"""Export and explicitly erase this local workspace, never remote-provider records."""

import json
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import delete, select

from app.agents.interview_graph import close_interview_graph
from app.config import get_settings
from app.db.database import Base, get_engine
from app.memory import memory_manager

router = APIRouter(prefix="/api/privacy", tags=["privacy"])
erasing = False
active_mutations = 0


@router.get("/export")
async def export_workspace() -> Response:
    with get_engine().connect() as connection:
        tables = {
            table.name: [
                dict(row._mapping) for row in connection.execute(select(table))
            ]
            for table in Base.metadata.sorted_tables
        }
    body = json.dumps(
        {"format": "job-companion-workspace-v1", "tables": tables},
        ensure_ascii=False,
        default=str,
        indent=2,
    )
    return Response(
        body,
        media_type="application/json",
        headers={
            "Content-Disposition": 'attachment; filename="job-companion-workspace.json"'
        },
    )


class EraseBody(BaseModel):
    confirmation: str


@router.post("/erase")
async def erase_workspace(body: EraseBody) -> dict:
    global erasing
    if body.confirmation != "DELETE":
        raise HTTPException(422, "请输入 DELETE 确认清空本地工作区")
    # Inspect actual running tasks, including client-disconnected generation.
    from app.api import intel, interview, profile, resume, workspace
    from app.tools import weakness_cluster

    lock_maps = [
        intel._intel_locks,
        interview._session_locks,
        resume._resume_locks,
        workspace._practice_locks,
        workspace._analysis_locks,
        weakness_cluster._locks,
    ]
    if (
        erasing
        or active_mutations
        or any(lock.locked() for mapping in lock_maps for lock in mapping.values())
        or workspace._creation_lock.locked()
        or profile._memory_sync_count
    ):
        raise HTTPException(409, "仍有模型或记忆任务运行，请等待完成后清空")
    erasing = True
    try:
        await close_interview_graph()
        memory_manager.close()
        data_dir = Path(get_settings().data_dir).resolve()
        # Only the application's named artifacts are eligible; never recursively
        # remove a configurable data_dir that could contain unrelated user files.
        for name in ("uploads", "exports", "qdrant"):
            path = data_dir / name
            if path.is_symlink():
                path.unlink()
            elif path.exists():
                shutil.rmtree(path)
        for name in ("checkpoints.db", "memory_history.db"):
            for suffix in ("", "-wal", "-shm"):
                (data_dir / f"{name}{suffix}").unlink(missing_ok=True)
        with get_engine().begin() as connection:
            for table in reversed(Base.metadata.sorted_tables):
                connection.execute(delete(table))
        from app.tools import weakness_cluster

        weakness_cluster._cache.clear()
        return {"ok": True}
    except OSError as exc:
        raise HTTPException(
            500, "部分本地文件无法删除；请关闭占用文件的程序后重试。清空尚未全部完成。"
        ) from exc
    finally:
        erasing = False
