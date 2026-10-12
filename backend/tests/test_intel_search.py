"""背调检索测试：跨路去重、sid 编号、单路失败隔离、重试、证据渲染。"""

from __future__ import annotations

import asyncio

from app.tools import intel_search
from app.tools.search import SearchResult


def _r(title: str, url: str, snippet: str = "", date: str | None = None) -> SearchResult:
    return SearchResult(title=title, url=url, snippet=snippet, date=date)


def _patch_provider(monkeypatch, handler):
    class Fake:
        async def search(self, query: str, count: int = 5):
            return handler(query)

    monkeypatch.setattr(intel_search, "get_search_provider", lambda name=None: Fake())


def test_gather_evidence_dedup_and_sid(monkeypatch):
    def handler(q: str):
        if "校园招聘" in q:
            return [_r("招A", "https://a.com"), _r("招B", "https://b.com")]
        if "薪资" in q:
            # b 与 hiring 路重复 → 跨路去重
            return [_r("薪B", "https://b.com"), _r("薪C", "https://c.com", date="2026-01-02T10:00:00")]
        return []

    _patch_provider(monkeypatch, handler)
    items = asyncio.run(intel_search.gather_evidence("某公司", "后端开发"))
    assert [i.url for i in items] == ["https://a.com", "https://b.com", "https://c.com"]
    assert [i.sid for i in items] == [1, 2, 3]
    assert items[2].lane == "salary"
    assert items[2].date == "2026-01-02"  # 截断到日期


def test_lane_failure_isolated_and_emit(monkeypatch):
    def handler(q: str):
        if "薪资" in q:
            raise RuntimeError("boom")
        if "校园招聘" in q:
            return [_r("招A", "https://a.com")]
        return []

    _patch_provider(monkeypatch, handler)
    events: list[dict] = []

    async def emit(d: dict) -> None:
        events.append(d)

    items = asyncio.run(intel_search.gather_evidence("某公司", "后端", emit=emit))
    assert [i.url for i in items] == ["https://a.com"]
    starts = [e for e in events if e["stage"] == "lane_start"]
    dones = {e["lane"]: e["count"] for e in events if e["stage"] == "lane_done"}
    assert len(starts) == 4
    assert dones["salary"] == 0  # 失败路报 0 条，不炸其他路
    assert dones["hiring"] == 1


def test_lane_retries_then_succeeds(monkeypatch):
    calls = {"n": 0}

    def handler(q: str):
        if "薪资" in q:
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("transient")
            return [_r("薪A", "https://s.com")]
        return []

    _patch_provider(monkeypatch, handler)
    results = asyncio.run(intel_search.fetch_lane("salary", "某公司 薪资 待遇"))
    assert len(results) == 1
    assert calls["n"] == 2


def test_render_evidence():
    items = [
        intel_search.EvidenceItem(
            sid=1, lane="hiring", title="T1", url="https://a.com", date="2026-01-02", snippet="S1"
        ),
        intel_search.EvidenceItem(sid=2, lane="risk", title="T2", url="https://b.com", snippet="S2"),
    ]
    text = intel_search.render_evidence(items)
    assert "[S1] T1（2026-01-02）" in text
    assert "[S2] T2\n" in text
    assert "来源：https://b.com" in text
    assert intel_search.render_evidence([]) == "（无搜索结果）"


def test_build_queries_uses_fallback_role():
    queries = intel_search.build_queries("某公司", "")
    assert "校招" in queries["hiring"]
    assert set(queries) == {"hiring", "salary", "process", "risk"}
