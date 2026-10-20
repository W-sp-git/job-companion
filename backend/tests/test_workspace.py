"""Regression and application-flow checks with an isolated DB and no provider calls."""

import json

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.agents.schemas import (
    ExperienceItem,
    IntelReport,
    ProjectItem,
    ResumeDraft,
    ResumeRaw,
)
from app.agents.workspace_schemas import JobAnalysis, PracticeEvaluation, PracticePlan
from app.api import api_router
from app.db import database
from app.db.models import ExperienceFact
from app.tools import profile_store, workspace_analysis, workspace_store
from app.tools.candidate import enriched_resume, redact
from app.tools.factuality import (
    ats_keyword_check,
    ground_review,
    resume_body_text,
    verify_numbers,
)
from app.tools.intel_search import EvidenceItem
from app.tools.intel_verify import verify_intel_report


@pytest.fixture
def isolated_db(tmp_path, monkeypatch):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )
    monkeypatch.setattr(database, "_engine", engine)
    monkeypatch.setattr(
        database, "_session_factory", sessionmaker(bind=engine, expire_on_commit=False)
    )
    database.init_db()
    yield engine
    engine.dispose()


@pytest.fixture
async def client(isolated_db):
    app = FastAPI()
    app.include_router(api_router)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as instance:
        yield instance


def test_gap_keywords_never_count_as_resume_coverage():
    draft = ResumeDraft(skills=["Java"], target_gaps=["Redis"])
    assert ats_keyword_check(resume_body_text(draft), ["Java", "Redis"]) == {
        "matched": ["Java"],
        "missing": ["Redis"],
    }


@pytest.mark.asyncio
async def test_review_can_correct_false_gaps_without_authorizing_invented_skills(
    monkeypatch,
):
    from app.agents import resume_graph

    async def corrected(*args, **kwargs):
        return ResumeDraft(skills=["性能优化", "Kubernetes"], target_gaps=[])

    monkeypatch.setattr(resume_graph, "call_structured", corrected)
    monkeypatch.setattr(resume_graph, "get_llm", lambda *args, **kwargs: object())
    result = await resume_graph.refine_node(
        {
            "raw_resume": ResumeRaw(skills=["性能优化"]).model_dump(),
            "draft": ResumeDraft(target_gaps=["性能优化"]).model_dump(),
            "review": {"issues": [{"problem": "性能优化已有原文依据，不应列为差距"}]},
        }
    )
    assert result["draft"]["skills"] == ["性能优化"]
    assert "性能优化" not in result["draft"]["target_gaps"]
    assert "Kubernetes" not in result["draft"]["skills"]


def test_interview_prompt_uses_actual_jd_and_redacted_resume():
    from app.agents.interview_graph import interview_context

    content = interview_context(
        {
            "jd_text": "需要解释Redis缓存失效",
            "resume_context": {
                "name": "测试同学",
                "phone": "13800138000",
                "projects": [{"name": "缓存项目", "bullets": ["实现Redis缓存"]}],
            },
            "locale": "en",
        }
    )
    assert "需要解释Redis缓存失效" in content and "缓存项目" in content
    assert "13800138000" not in content and "测试同学" not in content
    assert "英文" in content and "target_gaps" in content


def test_quantity_cannot_change_units_or_move_across_projects():
    raw = ResumeRaw(
        projects=[
            ProjectItem(name="A", bullets=["实现20个接口"]),
            ProjectItem(name="B", bullets=["响应耗时降至20ms"]),
        ]
    )
    assert verify_numbers(
        ResumeDraft(projects=[ProjectItem(name="A", bullets=["性能提升20%"])]), raw, {}
    )
    assert verify_numbers(
        ResumeDraft(projects=[ProjectItem(name="A", bullets=["响应耗时降至20ms"])]),
        raw,
        {},
    )


def test_preserved_metric_and_unit_are_allowed():
    raw = ResumeRaw(
        internships=[
            ExperienceItem(org="A", bullets=["接口平均响应时间从800ms降至200ms"])
        ]
    )
    draft = ResumeDraft(
        internships=[
            ExperienceItem(org="A", bullets=["优化接口响应，从800ms降至200ms"])
        ]
    )
    assert not verify_numbers(draft, raw, {})


def test_unchanged_source_uncertainty_and_unquoted_opinions_are_advice():
    raw = ResumeRaw(
        education=[{"school": "测试大学", "start": "2024/09", "end": "2028/06"}]
    )
    draft = ResumeDraft.model_validate(raw.model_dump())
    checked = ground_review(
        {
            "issues": [
                {
                    "severity": "high",
                    "problem": "时间线需要确认",
                    "source_quote": "2024/09",
                    "draft_quote": "2024/09",
                },
                {"severity": "high", "problem": "缺少JD技能"},
            ]
        },
        raw,
        draft,
    )
    assert all(item["severity"] == "medium" for item in checked["issues"])
    assert checked["factuality_notes"]


def test_verified_changed_quantity_still_blocks_export(isolated_db):
    from app.api.resume import export_issues

    raw = ResumeRaw(projects=[{"name": "测试项目", "bullets": ["实现10个接口"]}])
    draft = ResumeDraft(projects=[{"name": "测试项目", "bullets": ["实现100个接口"]}])
    report = ground_review(
        {
            "issues": [
                {
                    "severity": "high",
                    "problem": "接口数量被扩大",
                    "source_quote": "实现10个接口",
                    "draft_quote": "实现100个接口",
                }
            ]
        },
        raw,
        draft,
    )
    assert report["issues"][0]["severity"] == "high"
    resume_id = profile_store.save_resume_file(
        "default", "test.pdf", "", raw.model_dump()
    )
    issues = export_issues(
        {
            "resume_id": resume_id,
            "draft_json": draft.model_dump(),
            "review_json": report,
            "context": {"source_snapshot": raw.model_dump()},
        }
    )
    assert {item["type"] for item in issues} == {"number", "review"}


def test_salary_cannot_borrow_a_number_from_an_uncited_source():
    evidence = [
        EvidenceItem(sid=1, snippet="甲公司开展校招", url="https://a.example"),
        EvidenceItem(sid=2, snippet="乙公司薪资30k", url="https://b.example"),
    ]
    report = IntelReport(
        salary=[
            {"range_text": "30k", "source_ids": [1], "evidence_quote": "甲公司开展校招"}
        ]
    )
    out, _ = verify_intel_report(report, evidence)
    assert out["salary"][0]["status"] == "unverified"


def test_confirmed_materials_only_and_no_source_mutation(isolated_db):
    raw = ResumeRaw(name="张同学", skills=["Java"]).model_dump()
    workspace_store.save_record(
        ExperienceFact, {"title": "草稿项目", "confirmed": False, "skills": ["Rust"]}
    )
    workspace_store.save_record(
        ExperienceFact,
        {
            "title": "确认项目",
            "confirmed": True,
            "action": "实现Redis缓存",
            "skills": ["Redis"],
        },
    )
    result = enriched_resume(raw)
    assert result["skills"] == ["Java", "Redis"]
    assert [p["name"] for p in result["projects"]] == ["确认项目"]
    assert raw["skills"] == ["Java"] and raw["projects"] == []


def test_redaction_preserves_project_names():
    value = {
        "name": "张同学",
        "phone": "13800138000",
        "email": "test@example.com",
        "projects": [
            {
                "name": "校园平台",
                "bullets": ["联系13800138000或test@example.com，使用Redis"],
            }
        ],
    }
    result = redact(value)
    assert "name" not in result and "phone" not in result and "email" not in result
    assert "13800138000" not in json.dumps(
        result
    ) and "test@example.com" not in json.dumps(result)
    assert result["projects"][0]["name"] == "校园平台"


def test_analysis_discards_invented_requirements_and_unsupported_evidence():
    analysis = JobAnalysis(
        summary="候选人已满足全部要求",
        requirements=[
            {
                "requirement": "熟悉Redis",
                "status": "supported",
                "evidence_id": "fact:1",
                "evidence_quote": "伪造引文",
            },
            {"requirement": "精通Kafka", "status": "supported"},
        ],
    )
    result = workspace_analysis.ground_analysis(
        analysis, "熟悉Redis", {"fact:1": {"label": "用户确认", "text": "使用Java"}}
    )
    assert len(result["requirements"]) == 1
    assert result["requirements"][0]["status"] == "unknown"
    assert not result["requirements"][0]["evidence_quote"]
    assert "0 项材料有依据" in result["summary"]
    assert "已满足全部要求" not in result["summary"]


def test_analysis_checks_separate_quotes_without_requiring_false_contiguity():
    sources = {
        "resume:1": {
            "label": "原始简历",
            "text": '技能：["React", "TypeScript", "Vite"]；项目：实现代码分割',
        }
    }
    analysis = JobAnalysis(
        requirements=[
            {
                "requirement": "熟悉React和Vite",
                "status": "supported",
                "evidence_id": "resume:1",
                "evidence_quotes": ["React", "Vite"],
            },
            {
                "requirement": "熟悉Rust和React",
                "status": "supported",
                "evidence_id": "resume:1",
                "evidence_quotes": ["React", "Rust"],
            },
        ]
    )
    result = workspace_analysis.ground_analysis(
        analysis, "熟悉React和Vite；熟悉Rust和React", sources
    )
    supported, unknown = result["requirements"]
    assert supported["status"] == "supported"
    assert supported["evidence_quotes"] == ["React", "Vite"]
    assert unknown["status"] == "unknown" and not unknown["evidence_quotes"]
    assert "1 项材料有依据" in result["summary"]


def test_rubric_score_is_calculated_and_ungrounded_points_removed():
    result = PracticeEvaluation(
        criteria=[
            {
                "criterion_index": 0,
                "score": 2,
                "evidence_quote": "原子性",
                "feedback": "正确",
            },
            {
                "criterion_index": 1,
                "score": 2,
                "evidence_quote": "不在回答中",
                "feedback": "正确",
            },
            {
                "criterion_index": 0,
                "score": 2,
                "evidence_quote": "原子性",
                "feedback": "重复",
            },
        ],
        next_step="补充隔离性",
        reference_outline="按ACID解释",
    )
    checked = workspace_analysis.ground_evaluation(
        result, "事务需要原子性", ["原子性", "隔离性", "边界条件"]
    )
    assert checked["score"] == 3.3
    assert [row["score"] for row in checked["criteria"]] == [2, 0, 0]


def test_legacy_migration_is_additive_and_idempotent(isolated_db):
    profile_store.upsert_profile("default", {"school": "保留的学校"})
    with isolated_db.begin() as connection:
        connection.execute(
            text("ALTER TABLE interview_sessions DROP COLUMN context_json")
        )
        connection.execute(text("ALTER TABLE resume_versions DROP COLUMN context_json"))
    database.init_db()
    database.init_db()
    assert "context_json" in {
        c["name"] for c in inspect(isolated_db).get_columns("interview_sessions")
    }
    assert profile_store.get_profile("default")["school"] == "保留的学校"


@pytest.mark.asyncio
async def test_job_lifecycle_duplicate_dates_and_unknown_status(client):
    body = {
        "company": "招聘测试公司",
        "target_role": "Java实习",
        "city": "杭州",
        "batch": "2027",
        "jd_text": "熟悉Redis",
        "status": "applied",
        "deadline": "2026-11-01",
    }
    created = await client.post("/api/jobs", json=body)
    assert created.status_code == 201
    job = created.json()
    assert (await client.post("/api/jobs", json=body)).status_code == 409
    assert (
        await client.post("/api/jobs", json={**body, "deadline": "bad"})
    ).status_code == 422
    detail = (await client.get(f"/api/jobs/{job['id']}")).json()
    assert detail["status"] == "applied"
    assert len(detail["activities"]) == 1
    assert (
        await client.put(f"/api/jobs/{job['id']}", json={**body, "status": "interview"})
    ).status_code == 200
    assert len((await client.get(f"/api/jobs/{job['id']}")).json()["activities"]) == 2


@pytest.mark.asyncio
async def test_practice_retest_and_delete_preserves_history(client, monkeypatch):
    async def plan(*args):
        return PracticePlan(
            question="说明事务", criteria=["原子性", "一致性", "隔离性"]
        )

    scores = iter([4.0, 8.0])

    async def evaluate(task, answer):
        return {
            "criteria": [],
            "next_step": "补充例子",
            "reference_outline": "ACID",
            "score": next(scores),
        }

    monkeypatch.setattr(workspace_analysis, "make_practice", plan)
    monkeypatch.setattr(workspace_analysis, "evaluate_practice", evaluate)
    job = (
        await client.post("/api/jobs", json={"company": "A", "target_role": "后端"})
    ).json()
    created = await client.post(
        "/api/practice", json={"job_id": job["id"], "skill": "事务"}
    )
    assert created.status_code == 201
    task = created.json()
    for answer in ("第一次回答", "第二次回答"):
        assert (
            await client.post(
                f"/api/practice/{task['id']}/attempts", json={"answer": answer}
            )
        ).status_code == 201
    saved = (await client.get("/api/practice")).json()[0]
    assert saved["rubric_json"] == ["原子性", "一致性", "隔离性"]
    assert [a["score"] for a in saved["attempts"]] == [4.0, 8.0]
    assert saved["status"] == "completed"
    assert (await client.delete(f"/api/jobs/{job['id']}")).status_code == 200
    assert (await client.get("/api/practice")).json()[0]["job_id"] is None
    assert (await client.delete(f"/api/practice/{task['id']}")).status_code == 200
    assert (await client.get("/api/practice")).json() == []


@pytest.mark.asyncio
async def test_export_blocks_unresolved_facts_even_after_acknowledgment(
    client, tmp_path
):
    raw = ResumeRaw(
        name="测试", projects=[ProjectItem(name="A", bullets=["完成20个接口"])]
    )
    resume_id = profile_store.save_resume_file(
        "default", "test.pdf", str(tmp_path / "test.pdf"), raw.model_dump()
    )
    draft = ResumeDraft(
        name="测试", projects=[ProjectItem(name="A", bullets=["性能提升20%"])]
    )
    version_id = profile_store.save_resume_version(
        resume_id,
        draft.model_dump(),
        {"issues": []},
        context={"source_snapshot": raw.model_dump()},
    )
    assert (
        await client.get(f"/api/resume-versions/{version_id}/docx")
    ).status_code == 409
    edited = await client.post(
        f"/api/resumes/{resume_id}/versions",
        json={
            "draft": draft.model_dump(),
            "parent_version_id": version_id,
            "review_acknowledged": True,
        },
    )
    assert edited.status_code == 201 and edited.json()["export_issues"]
    draft.projects[0].bullets = ["完成20个接口"]
    fixed = await client.post(
        f"/api/resumes/{resume_id}/versions",
        json={
            "draft": draft.model_dump(),
            "parent_version_id": version_id,
            "review_acknowledged": True,
        },
    )
    assert fixed.status_code == 201 and not fixed.json()["export_issues"]
    old = (await client.get(f"/api/resume-versions/{version_id}")).json()
    assert old["draft_json"]["projects"][0]["bullets"] == ["性能提升20%"]


@pytest.mark.asyncio
async def test_interview_snapshots_actual_jd_and_selected_resume(client, tmp_path):
    raw = ResumeRaw(skills=["Redis"])
    resume_id = profile_store.save_resume_file(
        "default", "cv.pdf", str(tmp_path / "cv.pdf"), raw.model_dump()
    )
    version_id = profile_store.save_resume_version(
        resume_id,
        ResumeDraft(skills=["Redis"]).model_dump(),
        {},
        context={"source_snapshot": raw.model_dump()},
    )
    job = (
        await client.post(
            "/api/jobs",
            json={
                "company": "A",
                "target_role": "后端",
                "jd_text": "熟悉Redis缓存",
                "resume_version_id": version_id,
            },
        )
    ).json()
    result = await client.post(
        "/api/interview/sessions",
        json={"job_id": job["id"], "locale": "en", "feedback_mode": "simulation"},
    )
    assert result.status_code == 200
    session = profile_store.get_session(result.json()["session_id"])
    assert session["jd_text"] == "熟悉Redis缓存"
    assert session["context"]["resume_context"]["skills"] == ["Redis"]
    assert session["context"]["feedback_mode"] == "simulation"
    assert session["context"]["locale"] == "en"


@pytest.mark.asyncio
async def test_analysis_becomes_stale_when_confirmed_facts_change(client, monkeypatch):
    async def analyze(job):
        return workspace_analysis.ground_analysis(
            JobAnalysis(
                summary="准备缓存", requirements=[{"requirement": "熟悉Redis"}]
            ),
            job["jd_text"],
            workspace_analysis.candidate_sources(job),
        )

    monkeypatch.setattr(workspace_analysis, "analyze_job", analyze)
    job = (
        await client.post(
            "/api/jobs",
            json={"company": "A", "target_role": "后端", "jd_text": "熟悉Redis"},
        )
    ).json()
    analyzed = (await client.post(f"/api/jobs/{job['id']}/analyze")).json()
    assert not analyzed["analysis_stale"]
    await client.post(
        "/api/experiences",
        json={"title": "缓存项目", "action": "实现Redis缓存", "confirmed": True},
    )
    assert (await client.get(f"/api/jobs/{job['id']}")).json()["analysis_stale"]


@pytest.mark.asyncio
async def test_model_failure_does_not_create_a_partial_attempt(client, monkeypatch):
    async def plan(*args):
        return PracticePlan(
            question="说明事务", criteria=["原子性", "一致性", "隔离性"]
        )

    async def failure(*args):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(workspace_analysis, "make_practice", plan)
    task = (await client.post("/api/practice", json={"skill": "事务"})).json()
    monkeypatch.setattr(workspace_analysis, "evaluate_practice", failure)
    response = await client.post(
        f"/api/practice/{task['id']}/attempts", json={"answer": "保留此回答"}
    )
    assert response.status_code == 502
    assert (await client.get("/api/practice")).json()[0]["attempts"] == []


@pytest.mark.asyncio
async def test_generation_saves_blocked_version_without_creating_export(
    client, monkeypatch, tmp_path
):
    from app.api import resume

    raw = ResumeRaw(projects=[ProjectItem(name="A", bullets=["完成20个接口"])])
    resume_id = profile_store.save_resume_file(
        "default", "test.pdf", str(tmp_path / "test.pdf"), raw.model_dump()
    )

    class Graph:
        async def astream(self, *args, **kwargs):
            yield (
                "updates",
                {
                    "draft": {
                        "draft": ResumeDraft(
                            projects=[ProjectItem(name="A", bullets=["提升20%"])]
                        ).model_dump()
                    }
                },
            )
            yield ("updates", {"review": {"review": {"issues": []}}})

    monkeypatch.setattr(resume, "get_resume_graph", lambda: Graph())
    response = await client.post(f"/api/resumes/{resume_id}/optimize", json={})
    assert response.status_code == 200
    assert '"download_url":""' in response.text.replace(" ", "")
    version = (await client.get(f"/api/resumes/{resume_id}/versions")).json()[0]
    assert version["export_issues"]
    assert not version["docx_path"]


@pytest.mark.asyncio
async def test_local_erase_requires_confirmation_and_preserves_unrelated_files(
    client, monkeypatch, tmp_path
):
    from types import SimpleNamespace

    from app.api import privacy

    project_data = tmp_path / "runtime"
    project_data.mkdir()
    (project_data / "unrelated.txt").write_text("keep")
    (project_data / "uploads").mkdir()
    (project_data / "uploads" / "cv.pdf").write_bytes(b"test")
    monkeypatch.setattr(
        privacy, "get_settings", lambda: SimpleNamespace(data_dir=str(project_data))
    )
    monkeypatch.setattr(privacy.memory_manager, "close", lambda: None)

    async def close_graph():
        return None

    monkeypatch.setattr(privacy, "close_interview_graph", close_graph)
    await client.post("/api/jobs", json={"company": "A", "target_role": "后端"})
    assert (
        await client.post("/api/privacy/erase", json={"confirmation": "wrong"})
    ).status_code == 422
    assert (await client.get("/api/jobs")).json()
    exported = await client.get("/api/privacy/export")
    assert (
        exported.status_code == 200 and exported.json()["tables"]["job_opportunities"]
    )
    assert (
        await client.post("/api/privacy/erase", json={"confirmation": "DELETE"})
    ).status_code == 200
    assert (await client.get("/api/jobs")).json() == []
    assert not (project_data / "uploads").exists()
    assert (project_data / "unrelated.txt").read_text() == "keep"


@pytest.mark.asyncio
async def test_erase_refuses_while_disconnected_generation_is_running(client):
    import asyncio

    from app.api import resume

    lock = resume._resume_locks.setdefault(98765, asyncio.Lock())
    await lock.acquire()
    try:
        response = await client.post(
            "/api/privacy/erase", json={"confirmation": "DELETE"}
        )
        assert response.status_code == 409
    finally:
        lock.release()


@pytest.mark.asyncio
async def test_manual_source_version_links_job_and_exports_without_model(
    client, monkeypatch, tmp_path
):
    from types import SimpleNamespace

    from app.api import resume

    raw = ResumeRaw(
        name="测试同学", skills=["Java"], other=["作品集：https://example.com/work"]
    )
    resume_id = profile_store.save_resume_file(
        "default", "cv.pdf", str(tmp_path / "cv.pdf"), raw.model_dump()
    )
    workspace_store.save_record(
        ExperienceFact,
        {
            "title": "缓存项目",
            "action": "实现Redis缓存",
            "confirmed": True,
            "skills": ["Redis"],
        },
    )
    job = (
        await client.post("/api/jobs", json={"company": "A", "target_role": "后端实习"})
    ).json()
    monkeypatch.setattr(
        resume, "get_settings", lambda: SimpleNamespace(data_dir=str(tmp_path))
    )

    def no_model():
        raise AssertionError("manual editing must not invoke the generation graph")

    monkeypatch.setattr(resume, "get_resume_graph", no_model)
    result = await client.post(
        f"/api/resumes/{resume_id}/baseline", json={"job_id": job["id"]}
    )
    assert result.status_code == 201
    version = result.json()
    assert version["draft_json"]["target_role"] == "后端实习"
    assert version["draft_json"]["other"] == raw.other
    assert version["draft_json"]["skills"] == ["Java", "Redis"]
    assert not version["export_issues"]
    assert (await client.get(f"/api/jobs/{job['id']}")).json()[
        "resume_version_id"
    ] == version["id"]
    exported = await client.get(f"/api/resume-versions/{version['id']}/docx")
    assert exported.status_code == 200 and exported.content.startswith(b"PK")


@pytest.mark.asyncio
async def test_erase_refuses_an_upload_or_other_mutation_in_flight(client, monkeypatch):
    from app.api import privacy

    monkeypatch.setattr(privacy, "active_mutations", 1)
    result = await client.post("/api/privacy/erase", json={"confirmation": "DELETE"})
    assert result.status_code == 409


@pytest.mark.asyncio
async def test_profile_still_saves_when_memory_provider_is_unavailable(
    client, monkeypatch
):
    from app.api import profile

    def unavailable(*args):
        raise RuntimeError("offline")

    monkeypatch.setattr(profile.memory_manager, "ingest_profile", unavailable)
    response = await client.put(
        "/api/profile",
        json={"patch": {"graduation": "2027年6月", "availability": "每周4天"}},
    )
    assert response.status_code == 200
    assert (await client.get("/api/profile")).json()["profile"][
        "graduation"
    ] == "2027年6月"
    assert profile._memory_sync_count == 0
