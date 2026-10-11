"""联网搜索：SearchProvider 协议 + Tavily / 博查 / 智谱 三实现。"""

from __future__ import annotations

from typing import Protocol

import httpx
from pydantic import BaseModel

from app.config import get_settings


class SearchResult(BaseModel):
    title: str = ""
    url: str = ""
    snippet: str = ""
    date: str | None = None


class SearchProvider(Protocol):
    async def search(self, query: str, count: int = 5) -> list[SearchResult]: ...


class TavilyProvider:
    def __init__(self, api_key: str):
        self._key = api_key

    async def search(self, query: str, count: int = 5) -> list[SearchResult]:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                headers={"Authorization": f"Bearer {self._key}"},
                json={
                    "query": query,
                    "max_results": count,
                    "search_depth": "basic",
                    "include_answer": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
        return [
            SearchResult(
                title=r.get("title", ""),
                url=r.get("url", ""),
                snippet=(r.get("content") or "")[:500],
            )
            for r in data.get("results", [])
        ]


class BochaProvider:
    def __init__(self, api_key: str):
        self._key = api_key

    async def search(self, query: str, count: int = 5) -> list[SearchResult]:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.bochaai.com/v1/web-search",
                headers={"Authorization": f"Bearer {self._key}"},
                json={"query": query, "count": count, "summary": True},
            )
            resp.raise_for_status()
            data = resp.json()
        pages = ((data.get("data") or {}).get("webPages") or {}).get("value") or []
        return [
            SearchResult(
                title=p.get("name", ""),
                url=p.get("url", ""),
                snippet=(p.get("summary") or p.get("snippet") or "")[:500],
                date=p.get("datePublished"),
            )
            for p in pages
        ]


class ZhipuProvider:
    def __init__(self, api_key: str):
        self._key = api_key

    async def search(self, query: str, count: int = 5) -> list[SearchResult]:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://open.bigmodel.cn/api/paas/v4/web_search",
                headers={"Authorization": f"Bearer {self._key}"},
                json={"search_engine": "search_std", "search_query": query, "count": count},
            )
            resp.raise_for_status()
            data = resp.json()
        return [
            SearchResult(
                title=r.get("title", ""),
                url=r.get("link", ""),
                snippet=(r.get("content") or "")[:500],
            )
            for r in data.get("search_result") or []
        ]


def get_search_provider(name: str | None = None) -> SearchProvider:
    settings = get_settings()
    name = name or settings.search_provider
    if name == "tavily":
        if not settings.tavily_api_key:
            raise RuntimeError("未配置 TAVILY_API_KEY")
        return TavilyProvider(settings.tavily_api_key)
    if name == "bocha":
        if not settings.bocha_api_key:
            raise RuntimeError("未配置 BOCHA_API_KEY")
        return BochaProvider(settings.bocha_api_key)
    if name == "zhipu":
        if not settings.zhipu_api_key:
            raise RuntimeError("未配置 ZHIPU_API_KEY")
        return ZhipuProvider(settings.zhipu_api_key)
    raise ValueError(f"未知搜索 provider：{name}（可选 tavily/bocha/zhipu）")


async def web_search_text(query: str, count: int = 5) -> str:
    """搜索并格式化为可读文本，用作提示词上下文。"""
    provider = get_search_provider()
    results = await provider.search(query, count)
    if not results:
        return "（无搜索结果）"
    lines = [f"[{i}] {r.title}\n    {r.snippet}\n    来源：{r.url}" for i, r in enumerate(results, 1)]
    return "\n".join(lines)
