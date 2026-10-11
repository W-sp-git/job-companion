"""业务数据读写（同步 SQLAlchemy；本地 SQLite 毫秒级，节点内直调即可）。"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func, select

from app.db.database import get_session_factory
from app.db.models import (
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
