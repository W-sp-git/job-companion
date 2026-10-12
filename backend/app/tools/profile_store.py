"""业务数据读写（同步 SQLAlchemy；本地 SQLite 毫秒级，节点内直调即可）。"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select

from app.db.database import get_session_factory
from app.db.models import (
    IntelReportRow,
    InterviewReport,
    InterviewSession,
    InterviewTurn,
    Resume,
    ResumeVersion,
    Student,
)

# ---------- 学生档案 ----------

def get_profile(user_id: str) -> dict:
    with get_session_factory()() as s:
        row = s.get(Student, user_id)
        return dict(row.profile_json or {}) if row else {}


def upsert_profile(user_id: str, patch: dict) -> dict:
    with get_session_factory()() as s:
        row = s.get(Student, user_id)
        if row is None:
            row = Student(user_id=user_id, profile_json=patch)
            s.add(row)
        else:
            row.profile_json = {**(row.profile_json or {}), **patch}
        s.commit()
        return dict(row.profile_json)


# ---------- 简历 ----------

def save_resume_file(user_id: str, filename: str, file_path: str, raw_json: dict) -> int:
    with get_session_factory()() as s:
        row = Resume(user_id=user_id, filename=filename, file_path=file_path, raw_json=raw_json)
        s.add(row)
        s.commit()
        return row.id


def get_resume(resume_id: int) -> dict | None:
    with get_session_factory()() as s:
        row = s.get(Resume, resume_id)
        if row is None:
            return None
        return {
            "id": row.id,
            "user_id": row.user_id,
            "filename": row.filename,
            "file_path": row.file_path,
            "raw_json": row.raw_json,
            "created_at": row.created_at.isoformat(),
        }


def save_resume_version(
    resume_id: int,
    draft_json: dict,
    review_json: dict | None,
    docx_path: str | None = None,
    review_history: list | None = None,
) -> int:
    with get_session_factory()() as s:
        count = s.scalar(
            select(func.count()).select_from(ResumeVersion).where(ResumeVersion.resume_id == resume_id)
        ) or 0
        row = ResumeVersion(
            resume_id=resume_id,
            version_no=count + 1,
            draft_json=draft_json,
            review_json=review_json,
            review_history=review_history,
            docx_path=docx_path,
        )
        s.add(row)
        s.commit()
        return row.id


def update_version_docx(version_id: int, docx_path: str) -> None:
    with get_session_factory()() as s:
        row = s.get(ResumeVersion, version_id)
        if row is not None:
            row.docx_path = docx_path
            s.commit()


def list_resume_versions(resume_id: int) -> list[dict]:
    with get_session_factory()() as s:
        rows = s.scalars(
            select(ResumeVersion)
            .where(ResumeVersion.resume_id == resume_id)
            .order_by(ResumeVersion.version_no.desc())
        ).all()
        return [
            {
                "id": r.id,
                "resume_id": r.resume_id,
                "version_no": r.version_no,
                "draft_json": r.draft_json,
                "review_json": r.review_json,
                "review_history": r.review_history,
                "docx_path": r.docx_path,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]


def get_version(version_id: int) -> dict | None:
    with get_session_factory()() as s:
        row = s.get(ResumeVersion, version_id)
        if row is None:
            return None
        return {
            "id": row.id,
            "resume_id": row.resume_id,
            "version_no": row.version_no,
            "draft_json": row.draft_json,
            "review_json": row.review_json,
            "review_history": row.review_history,
            "docx_path": row.docx_path,
            "created_at": row.created_at.isoformat(),
        }


# ---------- 面试会话 ----------

def create_session(
    session_id: str,
    user_id: str,
    mode: str,
    target_role: str,
    jd_text: str,
    max_rounds: int,
    company: str = "",
) -> None:
    with get_session_factory()() as s:
        s.add(
            InterviewSession(
                id=session_id,
                user_id=user_id,
                mode=mode,
                target_role=target_role,
                company=company,
                jd_text=jd_text,
                max_rounds=max_rounds,
                status="created",
            )
        )
        s.commit()


def set_session_status(session_id: str, status: str) -> None:
    with get_session_factory()() as s:
        row = s.get(InterviewSession, session_id)
        if row is not None:
            row.status = status
            if status == "finished":
                row.finished_at = datetime.now()
            s.commit()


def get_session(session_id: str) -> dict | None:
    with get_session_factory()() as s:
        row = s.get(InterviewSession, session_id)
        if row is None:
            return None
        return {
            "id": row.id,
            "user_id": row.user_id,
            "mode": row.mode,
            "target_role": row.target_role,
            "company": row.company,
            "jd_text": row.jd_text,
            "max_rounds": row.max_rounds,
            "status": row.status,
            "created_at": row.created_at.isoformat(),
            "finished_at": row.finished_at.isoformat() if row.finished_at else None,
        }


def list_sessions(user_id: str) -> list[dict]:
    with get_session_factory()() as s:
        rows = s.scalars(
            select(InterviewSession)
            .where(InterviewSession.user_id == user_id)
            .order_by(InterviewSession.created_at.desc())
        ).all()
        out: list[dict] = []
        for r in rows:
            report = s.scalar(
                select(InterviewReport).where(InterviewReport.session_id == r.id)
            )
            out.append(
                {
                    "id": r.id,
                    "mode": r.mode,
                    "target_role": r.target_role,
                    "status": r.status,
                    "max_rounds": r.max_rounds,
                    "created_at": r.created_at.isoformat(),
                    "total_score": report.total_score if report else None,
                }
            )
        return out


def save_turn(session_id: str, round_no: int, question: str, answer: str, evaluation: dict | None) -> None:
    with get_session_factory()() as s:
        s.add(
            InterviewTurn(
                session_id=session_id,
                round=round_no,
                question=question,
                answer=answer,
                eval_json=evaluation,
            )
        )
        s.commit()


def list_turns(session_id: str) -> list[dict]:
    with get_session_factory()() as s:
        rows = s.scalars(
            select(InterviewTurn)
            .where(InterviewTurn.session_id == session_id)
            .order_by(InterviewTurn.id)
        ).all()
        return [
            {
                "round": r.round,
                "question": r.question,
                "answer": r.answer,
                "evaluation": r.eval_json,
            }
            for r in rows
        ]


def save_report(session_id: str, report_json: dict[str, Any], total_score: float) -> None:
    with get_session_factory()() as s:
        existing = s.scalar(
            select(InterviewReport).where(InterviewReport.session_id == session_id)
        )
        if existing is None:
            s.add(
                InterviewReport(
                    session_id=session_id, report_json=report_json, total_score=total_score
                )
            )
        else:
            existing.report_json = report_json
            existing.total_score = total_score
        s.commit()


def get_report(session_id: str) -> dict | None:
    with get_session_factory()() as s:
        row = s.scalar(select(InterviewReport).where(InterviewReport.session_id == session_id))
        if row is None:
            return None
        return {"report": row.report_json, "total_score": row.total_score}


def get_interview_stats(user_id: str) -> dict:
    """历次面试战绩聚合：只读 DB + 纯计算，不调 LLM。

    维度分按名字精确对齐（LLM 措辞可能漂移，对不上的场次该维度缺失，前端断线处理）。
    """
    with get_session_factory()() as s:
        rows = s.execute(
            select(InterviewSession, InterviewReport)
            .join(InterviewReport, InterviewReport.session_id == InterviewSession.id)
            .where(InterviewSession.user_id == user_id)
            # 按完成时间排（有会话中途挂起、次日才跑完，用 created_at 会乱序）
            .order_by(func.coalesce(InterviewSession.finished_at, InterviewSession.created_at))
        ).all()

        trend: list[dict] = []
        dim_counter: Counter[str] = Counter()
        question_total = 0

        for sess, report in rows:
            rj = report.report_json or {}
            dims: dict[str, float] = {}
            for d in rj.get("dimension_scores") or []:
                name = str(d.get("name") or "").strip()
                try:
                    score = float(d.get("score"))
                except (TypeError, ValueError):
                    continue
                if not name:
                    continue
                dims[name] = round(score, 1)
                dim_counter[name] += 1
            questions = rj.get("per_question") or []
            question_total += len(questions)
            trend.append(
                {
                    "session_id": sess.id,
                    "date": (sess.finished_at or sess.created_at).isoformat(),
                    "mode": sess.mode,
                    "target_role": sess.target_role,
                    "company": sess.company,
                    "score": round(float(report.total_score or 0.0), 1),
                    "dimensions": dims,
                    "questions": len(questions),
                }
            )

    scores = [t["score"] for t in trend]
    return {
        "overview": {
            "session_count": len(trend),
            "question_count": question_total,
            "avg_score": round(sum(scores) / len(scores), 1) if scores else 0.0,
            "best_score": max(scores) if scores else 0.0,
        },
        "dimension_names": [name for name, _ in dim_counter.most_common()],
        "trend": trend,
    }


def collect_weaknesses(user_id: str) -> dict:
    """为弱点聚类收集素材：场次指纹 + 带日期的弱点原文（完全相同的文本去重）。

    指纹只含场次数与最后完成时间：完成新面试后指纹变化，聚类缓存随之失效。
    """
    with get_session_factory()() as s:
        rows = s.execute(
            select(InterviewReport.report_json, InterviewSession.finished_at, InterviewSession.created_at)
            .join(InterviewSession, InterviewSession.id == InterviewReport.session_id)
            .where(InterviewSession.user_id == user_id)
            .order_by(func.coalesce(InterviewSession.finished_at, InterviewSession.created_at))
        ).all()

    seen: set[str] = set()
    items: list[dict] = []
    last_date = ""
    for rj, finished, created in rows:
        date = (finished or created).isoformat()
        last_date = date
        for w in (rj or {}).get("weaknesses") or []:
            text = str(w).strip()
            if not text or text in seen:
                continue
            seen.add(text)
            items.append({"date": date, "text": text})
    return {"fingerprint": f"{len(rows)}:{last_date}", "items": items}


# ---------- 公司背调存档 ----------

def create_intel_report(user_id: str, company: str, target_role: str) -> int:
    with get_session_factory()() as s:
        row = IntelReportRow(user_id=user_id, company=company, target_role=target_role, status="created")
        s.add(row)
        s.commit()
        return row.id


def has_recent_active_intel(user_id: str, company: str, minutes: int = 3) -> bool:
    """同公司短时间内已有 created/running 的背调（防双击重复烧搜索与 LLM 成本）。"""
    with get_session_factory()() as s:
        cutoff = datetime.now() - timedelta(minutes=minutes)
        row = s.scalar(
            select(IntelReportRow)
            .where(
                IntelReportRow.user_id == user_id,
                IntelReportRow.company == company,
                IntelReportRow.status.in_(("created", "running")),
                IntelReportRow.created_at > cutoff,
            )
            .limit(1)
        )
        return row is not None


def mark_intel_running(report_id: int) -> None:
    """开始生成（首次或 failed 后重跑）：复位现场。"""
    with get_session_factory()() as s:
        row = s.get(IntelReportRow, report_id)
        if row is not None:
            row.status = "running"
            row.error = ""
            row.report_json = {}
            row.evidence_json = []
            row.source_count = 0
            row.finished_at = None
            s.commit()


def finish_intel_report(
    report_id: int, report_json: dict, evidence_json: list, source_count: int
) -> None:
    with get_session_factory()() as s:
        row = s.get(IntelReportRow, report_id)
        if row is not None:
            row.status = "done"
            row.report_json = report_json
            row.evidence_json = evidence_json
            row.source_count = source_count
            row.finished_at = datetime.now()
            s.commit()


def fail_intel_report(report_id: int, error: str) -> None:
    with get_session_factory()() as s:
        row = s.get(IntelReportRow, report_id)
        if row is not None:
            row.status = "failed"
            row.error = error[:500]
            row.finished_at = datetime.now()
            s.commit()


def get_intel_report(report_id: int) -> dict | None:
    with get_session_factory()() as s:
        row = s.get(IntelReportRow, report_id)
        if row is None:
            return None
        return {
            "id": row.id,
            "user_id": row.user_id,
            "company": row.company,
            "target_role": row.target_role,
            "status": row.status,
            "source_count": row.source_count,
            "report_json": row.report_json or {},
            "evidence_json": row.evidence_json or [],
            "error": row.error,
            "created_at": row.created_at.isoformat(),
            "finished_at": row.finished_at.isoformat() if row.finished_at else None,
        }


def list_intel_reports(user_id: str, limit: int = 20) -> list[dict]:
    with get_session_factory()() as s:
        rows = s.scalars(
            select(IntelReportRow)
            .where(IntelReportRow.user_id == user_id)
            .order_by(IntelReportRow.created_at.desc())
            .limit(limit)
        ).all()
        out: list[dict] = []
        for r in rows:
            rj = r.report_json or {}
            out.append(
                {
                    "id": r.id,
                    "company": r.company,
                    "target_role": r.target_role,
                    "status": r.status,
                    "source_count": r.source_count,
                    "summary": (rj.get("report") or {}).get("summary", "") if r.status == "done" else "",
                    "error": r.error if r.status == "failed" else "",
                    "created_at": r.created_at.isoformat(),
                    "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                }
            )
        return out
