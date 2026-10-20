"""简历 API：上传解析 / 优化（SSE）/ 版本 / 导出下载。"""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.agents.resume_graph import get_resume_graph
from app.agents.schemas import ResumeDraft, ResumeRaw
from app.config import get_settings
from app.db.models import JobOpportunity
from app.tools import profile_store, workspace_store
from app.tools.candidate import enriched_resume
from app.tools.docx_export import render_resume_docx
from app.tools.factuality import (
    ats_keyword_check,
    resume_body_text,
    verify_factuality,
    verify_numbers,
)
from app.tools.ocr import parse_resume
from app.utils.sse import iter_stream_events, sse_frame

router = APIRouter(prefix="/api", tags=["resume"])

DEFAULT_USER = "default"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
_resume_locks: dict[int, asyncio.Lock] = {}


class OptimizeBody(BaseModel):
    target_role: str = ""
    company: str = ""
    jd_text: str = ""
    max_iterations: int = Field(2, ge=1, le=3)
    job_id: int | None = None
    locale: Literal["zh", "en"] = "zh"


def export_issues(version: dict) -> list[dict]:
    context = version.get("context") or {}
    resume = profile_store.get_resume(version["resume_id"])
    raw = ResumeRaw.model_validate(
        context.get("source_snapshot") or (resume or {}).get("raw_json") or {}
    )
    draft = ResumeDraft.model_validate(version["draft_json"])
    profile = context.get("profile_snapshot") or {}
    issues = verify_factuality(draft, raw, profile) + verify_numbers(
        draft, raw, profile
    )
    if not context.get("review_acknowledged"):
        issues += [
            {
                "type": "review",
                "value": item.get("location", ""),
                "reason": item.get("problem", "需核对评审意见"),
            }
            for item in (version.get("review_json") or {}).get("issues", [])
            if item.get("severity") == "high"
        ]
    return issues


@router.get("/resumes")
async def list_resumes() -> list[dict]:
    return profile_store.list_resumes()


@router.get("/resume-library")
async def resume_library() -> list[dict]:
    return [
        {
            **resume,
            "versions": [
                {**version, "export_issues": export_issues(version)}
                for version in profile_store.list_resume_versions(resume["id"])
            ],
        }
        for resume in profile_store.list_resumes()
    ]


@router.put("/resumes/{resume_id}")
async def correct_resume(resume_id: int, body: ResumeRaw) -> dict:
    if profile_store.get_resume(resume_id) is None:
        raise HTTPException(404, "简历不存在")
    profile_store.update_raw_resume(resume_id, body.model_dump())
    return profile_store.get_resume(resume_id)


class SaveDraftBody(BaseModel):
    draft: ResumeDraft
    parent_version_id: int | None = None
    label: str = Field("手动校订", max_length=120)
    review_acknowledged: bool = False


@router.post("/resumes/{resume_id}/versions", status_code=201)
async def save_edited_draft(resume_id: int, body: SaveDraftBody) -> dict:
    resume = profile_store.get_resume(resume_id)
    if not resume:
        raise HTTPException(404, "简历不存在")
    parent = (
        profile_store.get_version(body.parent_version_id)
        if body.parent_version_id
        else None
    )
    if body.parent_version_id and (not parent or parent["resume_id"] != resume_id):
        raise HTTPException(422, "父版本与简历不一致")
    context = {**((parent or {}).get("context") or {})}
    context["source_snapshot"] = enriched_resume(resume["raw_json"])
    context["profile_snapshot"] = profile_store.get_profile("default")
    context.update(
        label=body.label,
        review_acknowledged=body.review_acknowledged,
        parent_version_id=body.parent_version_id,
    )
    review = dict((parent or {}).get("review_json") or {})
    keywords = list(
        dict.fromkeys([*review.get("ats_matched", []), *review.get("ats_missing", [])])
    )
    if keywords:
        coverage = ats_keyword_check(resume_body_text(body.draft), keywords)
        review.update(ats_matched=coverage["matched"], ats_missing=coverage["missing"])
    provisional = {
        "resume_id": resume_id,
        "draft_json": body.draft.model_dump(),
        "review_json": review,
        "context": context,
    }
    violations = export_issues(provisional)
    review["factuality_violations"] = [
        item for item in violations if item["type"] != "review"
    ]
    version_id = profile_store.save_resume_version(
        resume_id, body.draft.model_dump(), review, context=context
    )
    result = profile_store.get_version(version_id)
    return {**result, "export_issues": violations}


def _uploads_dir() -> Path:
    d = Path(get_settings().data_dir) / "uploads"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _exports_dir() -> Path:
    d = Path(get_settings().data_dir) / "exports"
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.post("/resumes")
async def upload_resume(file: UploadFile, user_id: str = DEFAULT_USER) -> dict:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="文件为空")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="文件超过 10MB 限制")

    suffix = Path(file.filename or "resume").suffix.lower() or ".bin"
    saved = _uploads_dir() / f"{uuid.uuid4().hex[:10]}{suffix}"
    saved.write_bytes(data)

    try:
        raw, route = await parse_resume(saved)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    resume_id = profile_store.save_resume_file(
        user_id, file.filename or saved.name, str(saved), raw.model_dump()
    )
    return {"resume_id": resume_id, "route": route, "raw_json": raw.model_dump()}


@router.get("/resumes/{resume_id}")
async def get_resume(resume_id: int) -> dict:
    resume = profile_store.get_resume(resume_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="简历不存在")
    return resume


@router.get("/resumes/{resume_id}/versions")
async def list_versions(resume_id: int) -> list[dict]:
    return [
        {**version, "export_issues": export_issues(version)}
        for version in profile_store.list_resume_versions(resume_id)
    ]


@router.post("/resumes/{resume_id}/optimize")
async def optimize_resume(
    resume_id: int, body: OptimizeBody, request: Request
) -> StreamingResponse:
    resume = profile_store.get_resume(resume_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="简历不存在")

    job = (
        workspace_store.get_record(JobOpportunity, body.job_id) if body.job_id else None
    )
    if body.job_id and not job:
        raise HTTPException(404, "岗位不存在")
    raw_json = enriched_resume(resume["raw_json"] or {})
    context = {
        "job_id": body.job_id,
        "company": job["company"] if job else body.company,
        "target_role": job["target_role"] if job else body.target_role,
        "jd_text": job["jd_text"] if job else body.jd_text,
        "source_snapshot": raw_json,
        "profile_snapshot": profile_store.get_profile(resume["user_id"]),
        "label": f"{job['company']} · {job['target_role']}" if job else "AI 优化",
        "locale": body.locale,
    }
    state_init = {
        "resume_id": resume_id,
        "user_id": resume["user_id"],
        "target_role": context["target_role"] or raw_json.get("target_role", ""),
        "company": context["company"],
        "jd_text": context["jd_text"],
        "locale": body.locale,
        "raw_resume": raw_json,
        "profile": context["profile_snapshot"],
        "max_iterations": body.max_iterations,
        "iteration": 0,
        "history": [],
    }
    graph = get_resume_graph()
    lock = _resume_locks.setdefault(resume_id, asyncio.Lock())
    if lock.locked():
        raise HTTPException(409, "这份简历正在优化，请等待完成后从简历库恢复结果")
    await lock.acquire()

    # 图与落库都在独立任务中执行：客户端断开也会产出结果并保存版本；
    # SSE 生成器只从队列转发事件。
    queue: asyncio.Queue = asyncio.Queue()

    async def run_graph() -> None:
        final_draft: dict = {}
        final_review: dict = {}
        review_history: list[dict] = []
        try:
            async for chunk in graph.astream(
                state_init, stream_mode=["custom", "updates"]
            ):
                await queue.put(chunk)
                mode, payload = iter_stream_events(chunk)
                if mode == "updates":
                    for node, update in (payload or {}).items():
                        if not isinstance(update, dict):
                            continue
                        if node in ("draft", "refine") and update.get("draft"):
                            final_draft = update["draft"]
                        elif node == "review" and update.get("review"):
                            final_review = update["review"]
                            review_history.append(update["review"])

            if final_draft:
                version_id = profile_store.save_resume_version(
                    resume_id,
                    final_draft,
                    final_review,
                    review_history=review_history,
                    context=context,
                )
                issues = export_issues(profile_store.get_version(version_id))
                if body.job_id:
                    workspace_store.save_record(
                        JobOpportunity, {"resume_version_id": version_id}, body.job_id
                    )
                    workspace_store.add_activity(
                        body.job_id,
                        "resume",
                        "生成岗位简历版本",
                        {"resume_version_id": version_id},
                    )
                await queue.put(
                    (
                        "__result__",
                        {
                            "version_id": version_id,
                            "draft": final_draft,
                            "review": final_review,
                            "review_history": review_history,
                            "download_url": ""
                            if issues
                            else f"/api/resume-versions/{version_id}/docx",
                            "export_issues": issues,
                        },
                    )
                )
        except Exception as e:  # noqa: BLE001
            await queue.put(("__error__", str(e)[:300]))
        finally:
            lock.release()
            await queue.put(("__end__", None))

    graph_task = asyncio.create_task(run_graph())

    async def gen():
        try:
            while True:
                try:
                    chunk = await asyncio.wait_for(queue.get(), timeout=0.5)
                except TimeoutError:
                    if await request.is_disconnected():
                        break
                    continue
                if (
                    isinstance(chunk, tuple)
                    and len(chunk) == 2
                    and isinstance(chunk[0], str)
                    and chunk[0].startswith("__")
                ):
                    if chunk[0] == "__end__":
                        break
                    if chunk[0] == "__error__":
                        yield sse_frame("error", {"message": chunk[1]})
                        continue
                    if chunk[0] == "__result__":
                        yield sse_frame("result", chunk[1])
                        continue
                if await request.is_disconnected():
                    break
                try:
                    mode, payload = iter_stream_events(chunk)
                except ValueError:
                    continue
                if mode == "custom":
                    data = (
                        payload
                        if isinstance(payload, dict)
                        else {"label": str(payload)}
                    )
                    yield sse_frame("stage", data)
                elif mode == "updates":
                    for node, update in (payload or {}).items():
                        if isinstance(update, dict):
                            yield sse_frame("node", {"node": node})
            yield sse_frame("done", {})
        finally:
            if not graph_task.done():
                graph_task.add_done_callback(
                    lambda t: t.exception() if not t.cancelled() else None
                )

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/resumes/{resume_id}/baseline", status_code=201)
async def create_source_version(resume_id: int, body: OptimizeBody) -> dict:
    """Manual preparation remains available when a model provider is unavailable."""
    resume = profile_store.get_resume(resume_id)
    if not resume:
        raise HTTPException(404, "简历不存在")
    if _resume_locks.get(resume_id, asyncio.Lock()).locked():
        raise HTTPException(409, "请等待当前优化任务结束")
    job = (
        workspace_store.get_record(JobOpportunity, body.job_id) if body.job_id else None
    )
    if body.job_id and not job:
        raise HTTPException(404, "岗位不存在")
    source = enriched_resume(resume["raw_json"])
    draft = ResumeDraft.model_validate(source)
    draft.target_role = (
        job["target_role"] if job else body.target_role or draft.target_role
    )
    context = {
        "job_id": body.job_id,
        "source_snapshot": source,
        "profile_snapshot": profile_store.get_profile("default"),
        "company": job["company"] if job else body.company,
        "target_role": draft.target_role,
        "jd_text": job["jd_text"] if job else body.jd_text,
        "label": "Manual source version" if body.locale == "en" else "原材料手动版本",
    }
    version_id = profile_store.save_resume_version(
        resume_id, draft.model_dump(), {}, context=context
    )
    if job:
        workspace_store.save_record(
            JobOpportunity, {"resume_version_id": version_id}, job["id"]
        )
        workspace_store.add_activity(
            job["id"],
            "resume",
            "从原材料建立可编辑版本",
            {"resume_version_id": version_id},
        )
    version = profile_store.get_version(version_id)
    return {**version, "export_issues": export_issues(version)}


@router.get("/resume-versions/{version_id}/docx")
async def download_docx(version_id: int) -> FileResponse:
    version = profile_store.get_version(version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="版本不存在")

    if export_issues(version):
        raise HTTPException(
            409, "此版本仍有事实或高风险评审问题，请在简历编辑中核对并保存后导出"
        )

    docx_path = version.get("docx_path")
    if not docx_path or not Path(docx_path).exists():
        draft = ResumeDraft.model_validate(version["draft_json"] or {})
        docx_path = str(
            _exports_dir() / f"resume_{version['resume_id']}_v{version_id}.docx"
        )
        render_resume_docx(draft, docx_path)
        profile_store.update_version_docx(version_id, docx_path)

    filename = f"简历_v{version['version_no']}.docx"
    return FileResponse(
        docx_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
    )


@router.get("/resume-versions/{version_id}")
async def get_saved_version(version_id: int) -> dict:
    version = profile_store.get_version(version_id)
    if not version:
        raise HTTPException(404, "版本不存在")
    return {**version, "export_issues": export_issues(version)}


@router.get("/resume-versions/{version_id}/review")
async def get_version_review(version_id: int) -> dict:
    version = profile_store.get_version(version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="版本不存在")
    return {
        "review": version.get("review_json") or {},
        "draft": version.get("draft_json") or {},
    }
