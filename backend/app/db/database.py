"""SQLite 引擎与会话（WAL 模式，单进程使用）。"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
_session_factory: sessionmaker | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        data_dir = Path(get_settings().data_dir)
        data_dir.mkdir(parents=True, exist_ok=True)
        db_path = data_dir / "app.db"
        _engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False},
        )

        @event.listens_for(_engine, "connect")
        def _set_wal(dbapi_conn, _record):
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.close()

    return _engine


def get_session_factory() -> sessionmaker:
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(
            bind=get_engine(), autoflush=False, expire_on_commit=False
        )
    return _session_factory


def init_db() -> None:
    from app.db import models  # noqa: F401 - 注册表结构

    Base.metadata.create_all(get_engine())
    # Additive migration for existing local installations. Never rebuild user tables.
    with get_engine().begin() as connection:
        for table in ("resume_versions", "interview_sessions"):
            columns = {
                column["name"] for column in inspect(connection).get_columns(table)
            }
            if "context_json" not in columns:
                connection.execute(
                    text(
                        f"ALTER TABLE {table} ADD COLUMN context_json JSON NOT NULL DEFAULT '{{}}'"
                    )
                )
