"""Local workspace persistence and explicit links to existing artifacts."""

from datetime import datetime

from sqlalchemy import select

from app.db.database import get_session_factory
from app.db.models import (
    ExperienceFact,
    JobActivity,
    PracticeAttempt,
)

USER = "default"  # This app runs as a local single-user workspace.


def serialize(row) -> dict:
    result = {}
    for column in row.__table__.columns:
        value = getattr(row, column.name)
        result[column.name] = (
            value.isoformat() if isinstance(value, datetime) else value
        )
    if isinstance(row, ExperienceFact):
        result["skills"] = result.pop("skills_json")
    return result


def get_record(model, record_id: int) -> dict | None:
    with get_session_factory()() as session:
        row = session.get(model, record_id)
        if row is None or getattr(row, "user_id", USER) != USER:
            return None
        return serialize(row)


def list_records(model) -> list[dict]:
    with get_session_factory()() as session:
        rows = session.scalars(
            select(model).where(model.user_id == USER).order_by(model.id.desc())
        ).all()
        return [serialize(row) for row in rows]


def save_record(model, values: dict, record_id: int | None = None) -> dict:
    values = dict(values)
    if model is ExperienceFact and "skills" in values:
        values["skills_json"] = values.pop("skills")
    with get_session_factory()() as session:
        row = session.get(model, record_id) if record_id else model(user_id=USER)
        if row is None or row.user_id != USER:
            raise ValueError("记录不存在")
        for key, value in values.items():
            setattr(row, key, value)
        session.add(row)
        session.commit()
        return serialize(row)


def activities(job_id: int) -> list[dict]:
    with get_session_factory()() as session:
        return [
            serialize(row)
            for row in session.scalars(
                select(JobActivity)
                .where(JobActivity.job_id == job_id)
                .order_by(JobActivity.id.desc())
            )
        ]


def add_activity(
    job_id: int, kind: str, content: str, details: dict | None = None
) -> dict:
    with get_session_factory()() as session:
        row = JobActivity(
            job_id=job_id, kind=kind, content=content, details_json=details or {}
        )
        session.add(row)
        session.commit()
        return serialize(row)


def attempts(task_id: int) -> list[dict]:
    with get_session_factory()() as session:
        return [
            serialize(row)
            for row in session.scalars(
                select(PracticeAttempt)
                .where(PracticeAttempt.task_id == task_id)
                .order_by(PracticeAttempt.id)
            )
        ]


def fact_text(fact: dict) -> str:
    return (
        "\n".join(
            str(fact.get(k) or "")
            for k in ("title", "organization", "role", "situation", "action", "result")
        )
        + "\n"
        + "、".join(fact.get("skills") or [])
    )


def confirmed_facts() -> list[dict]:
    return [fact for fact in list_records(ExperienceFact) if fact["confirmed"]]


def facts_profile() -> dict:
    return {f"用户确认素材#{fact['id']}": fact_text(fact) for fact in confirmed_facts()}
