"""SQLite 表结构：6 张业务表。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _now() -> datetime:
    return datetime.now()


class Student(Base):
    __tablename__ = "students"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    profile_json: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    filename: Mapped[str] = mapped_column(String(255), default="")
    file_path: Mapped[str] = mapped_column(String(512), default="")
    raw_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class ResumeVersion(Base):
    __tablename__ = "resume_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    resume_id: Mapped[int] = mapped_column(ForeignKey("resumes.id"), index=True)
    version_no: Mapped[int] = mapped_column(Integer, default=1)
    draft_json: Mapped[dict] = mapped_column(JSON, default=dict)
    review_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    review_history: Mapped[list | None] = mapped_column(JSON, nullable=True)
    context_json: Mapped[dict] = mapped_column(JSON, default=dict)
    docx_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True
    )  # 与 LangGraph thread_id 一致
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    mode: Mapped[str] = mapped_column(String(32), default="behavioral")
    target_role: Mapped[str] = mapped_column(String(128), default="")
    company: Mapped[str] = mapped_column(String(128), default="")
    jd_text: Mapped[str] = mapped_column(Text, default="")
    context_json: Mapped[dict] = mapped_column(JSON, default=dict)
    max_rounds: Mapped[int] = mapped_column(Integer, default=8)
    status: Mapped[str] = mapped_column(String(32), default="created")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class InterviewTurn(Base):
    __tablename__ = "interview_turns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("interview_sessions.id"), index=True
    )
    round: Mapped[int] = mapped_column(Integer, default=0)
    question: Mapped[str] = mapped_column(Text, default="")
    answer: Mapped[str] = mapped_column(Text, default="")
    eval_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class InterviewReport(Base):
    __tablename__ = "interview_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("interview_sessions.id"), unique=True, index=True
    )
    report_json: Mapped[dict] = mapped_column(JSON, default=dict)
    total_score: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class IntelReportRow(Base):
    """公司背调存档：report_json 存 {report, verification, sources}，evidence_json 存原始检索素材。"""

    __tablename__ = "intel_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    company: Mapped[str] = mapped_column(String(128), index=True)
    target_role: Mapped[str] = mapped_column(String(128), default="")
    status: Mapped[str] = mapped_column(
        String(16), default="created"
    )  # created|running|done|failed
    source_count: Mapped[int] = mapped_column(Integer, default=0)
    report_json: Mapped[dict] = mapped_column(JSON, default=dict)
    evidence_json: Mapped[list] = mapped_column(JSON, default=list)
    error: Mapped[str] = mapped_column(String(512), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class JobOpportunity(Base):
    __tablename__ = "job_opportunities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), default="default", index=True)
    company: Mapped[str] = mapped_column(String(160))
    target_role: Mapped[str] = mapped_column(String(160))
    city: Mapped[str] = mapped_column(String(100), default="")
    batch: Mapped[str] = mapped_column(String(100), default="")
    jd_text: Mapped[str] = mapped_column(Text, default="")
    source_url: Mapped[str] = mapped_column(Text, default="")
    deadline: Mapped[str] = mapped_column(String(10), default="")
    status: Mapped[str] = mapped_column(String(24), default="saved")
    next_action: Mapped[str] = mapped_column(String(500), default="")
    action_date: Mapped[str] = mapped_column(String(10), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    resume_version_id: Mapped[int | None] = mapped_column(
        ForeignKey("resume_versions.id"), nullable=True
    )
    intel_report_id: Mapped[int | None] = mapped_column(
        ForeignKey("intel_reports.id"), nullable=True
    )
    analysis_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class JobActivity(Base):
    __tablename__ = "job_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("job_opportunities.id"), index=True)
    kind: Mapped[str] = mapped_column(String(24), default="note")
    content: Mapped[str] = mapped_column(Text, default="")
    details_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class ExperienceFact(Base):
    __tablename__ = "experience_facts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), default="default", index=True)
    title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(24), default="project")
    organization: Mapped[str] = mapped_column(String(200), default="")
    role: Mapped[str] = mapped_column(String(160), default="")
    situation: Mapped[str] = mapped_column(Text, default="")
    action: Mapped[str] = mapped_column(Text, default="")
    result: Mapped[str] = mapped_column(Text, default="")
    skills_json: Mapped[list] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(500), default="用户补充")
    confirmed: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class PracticeTask(Base):
    __tablename__ = "practice_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), default="default", index=True)
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("job_opportunities.id"), nullable=True
    )
    session_id: Mapped[str] = mapped_column(String(64), default="")
    skill: Mapped[str] = mapped_column(String(200))
    question: Mapped[str] = mapped_column(Text)
    rubric_json: Mapped[list] = mapped_column(JSON, default=list)
    source_text: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(24), default="pending")
    due_date: Mapped[str] = mapped_column(String(10), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class PracticeAttempt(Base):
    __tablename__ = "practice_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("practice_tasks.id"), index=True)
    answer: Mapped[str] = mapped_column(Text)
    evaluation_json: Mapped[dict] = mapped_column(JSON, default=dict)
    score: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
