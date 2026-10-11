"""Mem0 长期记忆封装。

读写时机（调用方负责）：
- 读：面试开场注入弱点/背景；简历起草提示强化方向；记忆管理页展示
- 写：每轮回答后（后台任务）；复盘报告后写弱点；档案保存后 ingest
Mem0 的 add 内部是一次 LLM 提取调用（数秒），务必放后台。
"""

from __future__ import annotations

import asyncio
import atexit
import os
from pathlib import Path
from typing import Any

os.environ.setdefault("MEM0_TELEMETRY", "False")

from app.config import PROVIDER_REGISTRY, get_settings

_memory = None

# 附加到 Mem0 提取提示词的指令：保证记忆用中文记录（默认提示词未稳定遵守）
_EXTRACT_INSTRUCTIONS = (
    "所有记忆事实必须用中文记录（专有名词如 Java、Spring Boot 保留原文）。"
    "每条事实独立、简洁、自包含，不依赖上下文也能读懂。"
)


def _build_config() -> dict:
    settings = get_settings()
    provider = settings.mem0_llm_provider
    return {
        "llm": {
            "provider": "openai",
            "config": {
                "model": settings.mem0_llm_model,
                "api_key": settings.provider_key(provider),
                "openai_base_url": PROVIDER_REGISTRY[provider]["base_url"],
                "temperature": 0.1,
            },
        },
        "embedder": {
            "provider": "openai",
            "config": {
                "model": settings.embedding_model,
                "api_key": settings.dashscope_api_key,
                "openai_base_url": PROVIDER_REGISTRY["dashscope"]["base_url"],
                "embedding_dims": settings.embedding_dims,
            },
        },
        "vector_store": {
            "provider": "qdrant",
            "config": {
                "collection_name": "career_memory",
                "path": str(Path(settings.data_dir) / "qdrant"),
                "embedding_model_dims": settings.embedding_dims,
                "on_disk": True,
            },
        },
    }


def get_memory():
    global _memory
    if _memory is None:
        from mem0 import Memory

        _memory = Memory.from_config(_build_config())
    return _memory


def _normalize(results: Any) -> list[dict]:
    if isinstance(results, dict):
        results = results.get("results", [])
    out: list[dict] = []
    for item in results or []:
        if not isinstance(item, dict):
            continue
        out.append(
            {
                "id": item.get("id"),
                "memory": item.get("memory") or item.get("text") or "",
                "score": item.get("score"),
                "metadata": item.get("metadata") or {},
            }
        )
    return out


# ---------- 同步实现 ----------
# mem0ai >= 2.x：search/get_all 用 filters 传 user_id，条数参数为 top_k

def recall(user_id: str, query: str, limit: int = 5) -> list[dict]:
    return _normalize(
        get_memory().search(query=query, filters={"user_id": user_id}, top_k=limit)
    )


def remember_messages(user_id: str, messages: list[dict], metadata: dict | None = None) -> None:
    """messages 形如 [{"role": "user"/"assistant", "content": "..."}]。"""
    get_memory().add(messages, user_id=user_id, metadata=metadata or {}, prompt=_EXTRACT_INSTRUCTIONS)


def remember_fact(user_id: str, fact: str, fact_type: str = "general", **extra_meta: Any) -> None:
    get_memory().add(
        [{"role": "user", "content": fact}],
        user_id=user_id,
        metadata={"type": fact_type, **extra_meta},
        prompt=_EXTRACT_INSTRUCTIONS,
    )


def ingest_profile(user_id: str, profile: dict) -> None:
    lines = [f"{k}：{v}" for k, v in profile.items() if v]
    if not lines:
        return
    remember_fact(user_id, "学生档案信息 —— " + "；".join(lines), fact_type="profile")


def all_memories(user_id: str) -> list[dict]:
    return _normalize(get_memory().get_all(filters={"user_id": user_id}, top_k=100))


def forget(memory_id: str) -> None:
    get_memory().delete(memory_id)


# ---------- 异步包装（节点内含 I/O 时用） ----------

async def arecall(user_id: str, query: str, limit: int = 5) -> list[dict]:
    return await asyncio.to_thread(recall, user_id, query, limit)


async def aremember_messages(user_id: str, messages: list[dict], metadata: dict | None = None) -> None:
    await asyncio.to_thread(remember_messages, user_id, messages, metadata)


async def aremember_fact(user_id: str, fact: str, fact_type: str = "general", **extra_meta: Any) -> None:
    await asyncio.to_thread(remember_fact, user_id, fact, fact_type, **extra_meta)


async def aingest_profile(user_id: str, profile: dict) -> None:
    await asyncio.to_thread(ingest_profile, user_id, profile)


async def aall_memories(user_id: str) -> list[dict]:
    return await asyncio.to_thread(all_memories, user_id)


async def aforget(memory_id: str) -> None:
    await asyncio.to_thread(forget, memory_id)


# ---------- 生命周期 ----------

def close() -> None:
    """关闭向量库客户端（进程退出前调用，避免 Qdrant __del__ 关闭噪音）。"""
    global _memory
    if _memory is None:
        return
    try:
        client = getattr(getattr(_memory, "vector_store", None), "client", None)
        if client is not None:
            client.close()
    except Exception:  # noqa: BLE001
        pass
    _memory = None


atexit.register(close)
