"""长期记忆管理 API：列表 / 删除。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.memory import memory_manager

router = APIRouter(prefix="/api/memories", tags=["memory"])

DEFAULT_USER = "default"


@router.get("")
async def list_memories(user_id: str = DEFAULT_USER) -> dict:
    memories = await memory_manager.aall_memories(user_id)
    return {"memories": memories}


@router.delete("/{memory_id}")
async def delete_memory(memory_id: str) -> dict:
    try:
        await memory_manager.aforget(memory_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败：{e}") from e
    return {"ok": True}
