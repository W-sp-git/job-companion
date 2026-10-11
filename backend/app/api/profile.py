"""学生档案 API。"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from app.memory import memory_manager
from app.tools import profile_store

router = APIRouter(prefix="/api/profile", tags=["profile"])

DEFAULT_USER = "default"


class ProfileBody(BaseModel):
    user_id: str = DEFAULT_USER
    patch: dict


@router.get("")
async def get_profile(user_id: str = DEFAULT_USER) -> dict:
    return {"profile": profile_store.get_profile(user_id)}


@router.put("")
async def put_profile(body: ProfileBody, background: BackgroundTasks) -> dict:
    merged = profile_store.upsert_profile(body.user_id, body.patch)
    # 记忆同步走后台（Mem0 add 是一次 LLM 调用）
    background.add_task(memory_manager.ingest_profile, body.user_id, body.patch)
    return {"profile": merged}
