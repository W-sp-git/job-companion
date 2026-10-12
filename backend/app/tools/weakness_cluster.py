"""跨场弱点聚类：qwen-flash 把历次复盘报告中的弱点原文归并成「能力短板主题」。

- 按场次指纹缓存（进程内存）：只有完成新面试后指纹变化才重算，平时打开档案页秒回
- 聚类失败不阻塞战绩页：返回 clustered=False，前端给出提示（下次刷新自动重试）
"""

from __future__ import annotations

import asyncio

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.llm import get_llm
from app.agents.prompts import WEAKNESS_CLUSTER_SYSTEM
from app.agents.schemas import WeaknessClusters
from app.tools import profile_store
from app.utils.structured import call_structured

_cache: dict[str, tuple[str, dict]] = {}  # user_id -> (fingerprint, result)
_locks: dict[str, asyncio.Lock] = {}


async def _cluster(items: list[dict]) -> dict:
    lines = "\n".join(f"[{i['date'][:10]}] {i['text']}" for i in items)
    llm = get_llm("cluster", temperature=0.1)
    result = await call_structured(
        llm,
        WeaknessClusters,
        [
            SystemMessage(content=WEAKNESS_CLUSTER_SYSTEM),
            HumanMessage(content="弱点清单：\n" + lines),
        ],
        retries=1,
    )
    themes = [t.model_dump() for t in result.themes if t.theme.strip()]
    themes.sort(key=lambda t: (-t["count"], t["theme"]))
    return {"clustered": True, "themes": themes}


async def get_clusters(user_id: str) -> dict:
    material = profile_store.collect_weaknesses(user_id)
    if not material["items"]:
        return {"clustered": True, "themes": []}

    cached = _cache.get(user_id)
    if cached and cached[0] == material["fingerprint"]:
        return cached[1]

    lock = _locks.setdefault(user_id, asyncio.Lock())
    async with lock:
        cached = _cache.get(user_id)
        if cached and cached[0] == material["fingerprint"]:
            return cached[1]
        try:
            result = await _cluster(material["items"])
        except Exception:  # noqa: BLE001 - 聚类失败降级为不可用，不阻塞战绩页
            return {"clustered": False, "themes": []}
        _cache[user_id] = (material["fingerprint"], result)
        return result
