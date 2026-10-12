"""背调检索：4 路并行（招聘动态 / 薪资待遇 / 面试流程 / 风险信号）。

- 单路失败（含一次瞬时重试）不影响其他路，返回空列表由上层决定是否整体失败
- 跨路按 url 去重；证据从 S1 连续编号，供 LLM 引用与前端锚点
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.tools.search import SearchResult, get_search_provider

LANES = ("hiring", "salary", "process", "risk")
LANE_LABELS = {
    "hiring": "招聘动态",
    "salary": "薪资待遇",
    "process": "面试流程",
    "risk": "风险信号",
}
# 预留：按路覆盖搜索 provider（如风险路走 bocha 以获取发布日期），空 = 全用 settings.search_provider
LANE_PROVIDER: dict[str, str] = {}

EmitFn = Callable[[dict[str, Any]], Awaitable[None]]


class EvidenceItem(BaseModel):
    sid: int = 0
    lane: str = ""
    title: str = ""
    url: str = ""
    date: str = ""
    snippet: str = ""


def build_queries(company: str, target_role: str) -> dict[str, str]:
    role = target_role.strip() or "校招"
    year = datetime.now().year
    return {
        "hiring": f"{company} {role} 校园招聘 在招岗位 招聘动态 {year}",
        "salary": f"{company} {role} 薪资 待遇 offer",
        "process": f"{company} 面试流程 面经 {role} 真题",
        "risk": f"{company} 裁员 缩编 加班 劳动纠纷 负面",
    }


async def fetch_lane(lane: str, query: str, *, count: int = 6, retries: int = 1) -> list[SearchResult]:
    provider = get_search_provider(LANE_PROVIDER.get(lane))
    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return await provider.search(query, count)
        except Exception as e:  # noqa: BLE001 - 网络抖动重试一次
            last_err = e
            if attempt < retries:
                await asyncio.sleep(0.8)
    raise RuntimeError(f"{LANE_LABELS.get(lane, lane)}检索失败：{last_err}")


async def gather_evidence(
    company: str, target_role: str, emit: EmitFn | None = None
) -> list[EvidenceItem]:
    queries = build_queries(company, target_role)

    async def _emit(data: dict) -> None:
        if emit is not None:
            await emit(data)

    async def run_lane(lane: str) -> list[SearchResult]:
        await _emit({"stage": "lane_start", "lane": lane, "label": f"正在检索{LANE_LABELS[lane]}…"})
        try:
            results = await fetch_lane(lane, queries[lane])
        except Exception:  # noqa: BLE001 - 单路失败不阻塞其他路
            results = []
        await _emit({"stage": "lane_done", "lane": lane, "count": len(results)})
        return results

    lane_results = await asyncio.gather(*(run_lane(lane) for lane in LANES))

    items: list[EvidenceItem] = []
    seen_urls: set[str] = set()
    for lane, results in zip(LANES, lane_results):
        for r in results:
            if not r.url or r.url in seen_urls:
                continue
            seen_urls.add(r.url)
            items.append(
                EvidenceItem(
                    sid=len(items) + 1,
                    lane=lane,
                    title=r.title,
                    url=r.url,
                    date=(r.date or "")[:10],
                    snippet=r.snippet,
                )
            )
    return items


def render_evidence(items: list[EvidenceItem]) -> str:
    if not items:
        return "（无搜索结果）"
    lines: list[str] = []
    for it in items:
        head = f"[S{it.sid}] {it.title}"
        if it.date:
            head += f"（{it.date}）"
        lines.append(f"{head}\n    {it.snippet}\n    来源：{it.url}")
    return "\n".join(lines)
