"""学生档案 API。"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from app.memory import memory_manager
from app.tools import profile_store

router = APIRouter(prefix="/api/profile", tags=["profile"])

DEFAULT_USER = "default"
_memory_sync_count = 0


async def sync_profile_memory(user_id: str, patch: dict) -> None:
    global _memory_sync_count
    try:
        await asyncio.to_thread(memory_manager.ingest_profile, user_id, patch)
    except Exception as exc:  # noqa: BLE001 - Optional memory sync must not undo a saved profile.
        logging.getLogger(__name__).warning(
            "Profile saved; memory sync unavailable (%s)", type(exc).__name__
        )
    finally:
        _memory_sync_count -= 1


class ProfileBody(BaseModel):
    user_id: str = DEFAULT_USER
    patch: dict


@router.get("")
async def get_profile(user_id: str = DEFAULT_USER) -> dict:
    return {"profile": profile_store.get_profile(user_id)}


@router.put("")
async def put_profile(body: ProfileBody, background: BackgroundTasks) -> dict:
    global _memory_sync_count
    merged = profile_store.upsert_profile(body.user_id, body.patch)
    # 记忆同步走后台（Mem0 add 是一次 LLM 调用）
    _memory_sync_count += 1
    background.add_task(sync_profile_memory, body.user_id, body.patch)
    return {"profile": merged}
