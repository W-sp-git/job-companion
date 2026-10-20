"""Jobs, user-confirmed experience facts, and repeatable practice tasks."""

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.agents.workspace_schemas import FactBody, JobBody, PracticeBody
from app.db.database import get_session_factory
from app.db.models import (
    ExperienceFact,
    JobActivity,
    JobOpportunity,
    PracticeAttempt,
    PracticeTask,
)
from app.tools import profile_store, workspace_analysis
from app.tools import workspace_store as store

router = APIRouter(prefix="/api", tags=["workspace"])
_practice_locks: dict[int, asyncio.Lock] = {}
_analysis_locks: dict[int, asyncio.Lock] = {}
_creation_lock = asyncio.Lock()


def required(model, record_id: int) -> dict:
    record = store.get_record(model, record_id)
    if record is None:
        raise HTTPException(404, "记录不存在")
    return record


def validate_links(body: JobBody) -> None:
    if body.resume_version_id:
        version = profile_store.get_version(body.resume_version_id)
        if not version:
            raise HTTPException(422, "简历版本不存在")
    if body.intel_report_id:
        report = profile_store.get_intel_report(body.intel_report_id)
        if (
            not report
            or report["company"] != body.company
            or report["status"] != "done"
        ):
            raise HTTPException(422, "请选择同一公司的已完成情报报告")


def job_detail(job: dict) -> dict:
    analysis = job["analysis_json"]
    job["analysis_stale"] = bool(
        analysis
        and (
            analysis.get("opportunity_fingerprint")
            != workspace_analysis.fingerprint(
                {
                    key: job[key]
                    for key in ("company", "target_role", "city", "batch", "jd_text")
                }
            )
            or analysis.get("candidate_fingerprint")
            != workspace_analysis.fingerprint(workspace_analysis.candidate_sources(job))
            or analysis.get("jd_fingerprint")
            != workspace_analysis.fingerprint(job["jd_text"])
        )
    )
    return job


@router.get("/jobs")
async def list_jobs() -> list[dict]:
    return [job_detail(job) for job in store.list_records(JobOpportunity)]


@router.post("/jobs", status_code=201)
async def create_job(body: JobBody) -> dict:
    validate_links(body)
    duplicate = next(
        (
            job
            for job in store.list_records(JobOpportunity)
            if all(
                job[k] == getattr(body, k)
                for k in ("company", "target_role", "city", "batch")
            )
        ),
        None,
    )
    if duplicate:
        raise HTTPException(
            409, f"相同岗位已保存（编号 {duplicate['id']}），请在原岗位更新进展"
        )
    job = store.save_record(JobOpportunity, body.model_dump())
    store.add_activity(job["id"], "created", "保存岗位；状态由用户维护")
    return job_detail(job)


@router.get("/jobs/{job_id}")
async def get_job(job_id: int) -> dict:
    job = job_detail(required(JobOpportunity, job_id))
    job["activities"] = store.activities(job_id)
    job["sessions"] = [
        item
        for item in profile_store.list_sessions("default")
        if item.get("context", {}).get("job_id") == job_id
    ]
    return job


@router.put("/jobs/{job_id}")
async def update_job(job_id: int, body: JobBody) -> dict:
    before = required(JobOpportunity, job_id)
    validate_links(body)
    if any(
        job["id"] != job_id
        and all(
            job[k] == getattr(body, k)
            for k in ("company", "target_role", "city", "batch")
        )
        for job in store.list_records(JobOpportunity)
    ):
        raise HTTPException(409, "已有相同公司、岗位、城市和批次的档案，请在原档案更新")
    job = store.save_record(JobOpportunity, body.model_dump(), job_id)
    if before["status"] != body.status:
        store.add_activity(
            job_id,
            "status",
            f"{before['status']} → {body.status}",
            {"from": before["status"], "to": body.status},
        )
    return job_detail(job)


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: int) -> dict:
    required(JobOpportunity, job_id)
    with get_session_factory()() as session:
        session.execute(delete(JobActivity).where(JobActivity.job_id == job_id))
        for task in session.scalars(
            select(PracticeTask).where(PracticeTask.job_id == job_id)
        ):
            task.job_id = None
        session.delete(session.get(JobOpportunity, job_id))
        session.commit()
    return {"ok": True}


@router.post("/jobs/{job_id}/analyze")
async def analyze_job(job_id: int) -> dict:
    job = required(JobOpportunity, job_id)
    if not job["jd_text"].strip():
        raise HTTPException(422, "请先保存岗位 JD")
    lock = _analysis_locks.setdefault(job_id, asyncio.Lock())
    if lock.locked():
        raise HTTPException(409, "此岗位正在分析中")
    try:
        async with lock:
            analysis = await workspace_analysis.analyze_job(job)
    except Exception as exc:
        raise HTTPException(
            502, "岗位分析暂未完成，请检查模型配置后重试。已保存的岗位不受影响。"
        ) from exc
    current = required(JobOpportunity, job_id)
    if any(
        current[k] != job[k]
        for k in (
            "jd_text",
            "resume_version_id",
            "company",
            "target_role",
            "city",
            "batch",
        )
    ):
        raise HTTPException(409, "岗位资料在分析期间发生变化，请重新分析")
    analysis["opportunity_fingerprint"] = workspace_analysis.fingerprint(
        {
            key: job[key]
            for key in ("company", "target_role", "city", "batch", "jd_text")
        }
    )
    store.save_record(JobOpportunity, {"analysis_json": analysis}, job_id)
    return job_detail(required(JobOpportunity, job_id))


class ActivityBody(BaseModel):
    kind: str = Field("note", pattern="^(note|real_interview)$")
    content: str = Field(min_length=1, max_length=20000)
    questions: str = Field("", max_length=10000)
    answer: str = Field("", max_length=10000)
    explicit_feedback: str = Field("", max_length=10000)
    reflection: str = Field("", max_length=10000)


@router.post("/jobs/{job_id}/activities", status_code=201)
async def add_activity(job_id: int, body: ActivityBody) -> dict:
    required(JobOpportunity, job_id)
    return store.add_activity(
        job_id, body.kind, body.content, body.model_dump(exclude={"kind", "content"})
    )


@router.get("/experiences")
async def list_facts() -> list[dict]:
    return store.list_records(ExperienceFact)


@router.post("/experiences", status_code=201)
async def create_fact(body: FactBody) -> dict:
    return store.save_record(ExperienceFact, body.model_dump())


@router.put("/experiences/{fact_id}")
async def update_fact(fact_id: int, body: FactBody) -> dict:
    required(ExperienceFact, fact_id)
    return store.save_record(ExperienceFact, body.model_dump(), fact_id)


@router.delete("/experiences/{fact_id}")
async def delete_fact(fact_id: int) -> dict:
    required(ExperienceFact, fact_id)
    with get_session_factory()() as session:
        session.delete(session.get(ExperienceFact, fact_id))
        session.commit()
    return {"ok": True}


@router.get("/practice")
async def list_practice() -> list[dict]:
    return [
        {**task, "attempts": store.attempts(task["id"])}
        for task in store.list_records(PracticeTask)
    ]


@router.post("/practice", status_code=201)
async def create_practice(body: PracticeBody) -> dict:
    if not body.skill.strip():
        raise HTTPException(422, "请填写要练习的能力点")
    job = required(JobOpportunity, body.job_id) if body.job_id else None
    source_text = body.source_text
    if body.session_id:
        session = profile_store.get_session(body.session_id)
        if not session:
            raise HTTPException(422, "来源面试不存在")
        from app.tools.candidate import candidate_json

        source_text = candidate_json(
            {
                "weakness": body.skill,
                "report": profile_store.get_report(body.session_id),
                "turns": profile_store.list_turns(body.session_id),
            }
        )[:24000]
    existing = next(
        (
            task
            for task in store.list_records(PracticeTask)
            if task["session_id"] == body.session_id
            and body.session_id
            and task["skill"] == body.skill
        ),
        None,
    )
    if existing:
        return {**existing, "attempts": store.attempts(existing["id"])}
    try:
        if _creation_lock.locked():
            raise HTTPException(409, "训练题正在生成，请等待完成")
        async with _creation_lock:
            plan = await workspace_analysis.make_practice(
                body.skill, body.question, source_text, job
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, "训练题暂未生成，请检查模型配置后重试") from exc
    task = store.save_record(
        PracticeTask,
        {
            "skill": body.skill.strip(),
            "question": body.question.strip() or plan.question,
            "rubric_json": plan.criteria,
            "job_id": body.job_id,
            "session_id": body.session_id,
            "source_text": source_text,
            "due_date": body.due_date,
        },
    )
    return {**task, "attempts": []}


class AttemptBody(BaseModel):
    answer: str = Field(min_length=1, max_length=15000)


@router.post("/practice/{task_id}/attempts", status_code=201)
async def attempt_practice(task_id: int, body: AttemptBody) -> dict:
    task = required(PracticeTask, task_id)
    if not body.answer.strip():
        raise HTTPException(422, "请先作答")
    lock = _practice_locks.setdefault(task_id, asyncio.Lock())
    if lock.locked():
        raise HTTPException(409, "此题正在评分，请等待完成")
    async with lock:
        try:
            evaluation = await workspace_analysis.evaluate_practice(task, body.answer)
        except Exception as exc:
            raise HTTPException(
                502, "本次评分未完成，回答仍保留在输入框中，请重试"
            ) from exc
        with get_session_factory()() as session:
            current = session.get(PracticeTask, task_id)
            if not current:
                raise HTTPException(409, "训练题已删除")
            row = PracticeAttempt(
                task_id=task_id,
                answer=body.answer,
                evaluation_json=evaluation,
                score=evaluation["score"],
            )
            session.add(row)
            current.status = "completed" if evaluation["score"] >= 8 else "practicing"
            session.commit()
            return store.serialize(row)


@router.delete("/practice/{task_id}")
async def delete_practice(task_id: int) -> dict:
    required(PracticeTask, task_id)
    if _practice_locks.get(task_id, asyncio.Lock()).locked():
        raise HTTPException(409, "请等待评分结束后删除")
    with get_session_factory()() as session:
        session.execute(
            delete(PracticeAttempt).where(PracticeAttempt.task_id == task_id)
        )
        session.delete(session.get(PracticeTask, task_id))
        session.commit()
    return {"ok": True}
