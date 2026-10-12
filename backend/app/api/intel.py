"""公司背调 API：创建 / 列表 / 详情 / SSE 流式生成。"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.agents.intel_pipeline import run_intel_report
from app.tools import profile_store
from app.utils.sse import sse_frame

router = APIRouter(prefix="/api/intel", tags=["intel"])

DEFAULT_USER = "default"
_intel_locks: dict[int, asyncio.Lock] = {}


class CreateIntelBody(BaseModel):
    company: str = Field(..., min_length=1, max_length=60)
    target_role: str = Field("", max_length=60)
    user_id: str = DEFAULT_USER


@router.post("/reports")
async def create_report(body: CreateIntelBody) -> dict:
    company = body.company.strip()
    if not company:
        raise HTTPException(status_code=422, detail="公司名不能为空")
    if profile_store.has_recent_active_intel(body.user_id, company):
        raise HTTPException(status_code=409, detail="该公司已有背调任务进行中，请稍候")
    report_id = profile_store.create_intel_report(body.user_id, company, body.target_role.strip())
    return {"report_id": report_id}


@router.get("/reports")
async def list_reports(user_id: str = DEFAULT_USER, limit: int = 20) -> list[dict]:
    return profile_store.list_intel_reports(user_id, limit)


@router.get("/reports/{rid}")
async def get_report_detail(rid: int) -> dict:
    row = profile_store.get_intel_report(rid)
    if row is None:
        raise HTTPException(status_code=404, detail="背调报告不存在")
    rj = row["report_json"] or {}
    return {
        "report_id": row["id"],
        "company": row["company"],
        "target_role": row["target_role"],
        "status": row["status"],
        "created_at": row["created_at"],
        "finished_at": row["finished_at"],
        "error": row["error"],
        "report": rj.get("report"),
        "verification": rj.get("verification"),
        "sources": rj.get("sources") or [],
        "evidence": row["evidence_json"],
    }


@router.post("/reports/{rid}/stream")
async def stream_report(rid: int, request: Request) -> StreamingResponse:
    row = profile_store.get_intel_report(rid)
    if row is None:
        raise HTTPException(status_code=404, detail="背调报告不存在")
    if row["status"] == "done":
        raise HTTPException(status_code=409, detail="报告已生成，请直接查看")
    if row["status"] == "running":
        raise HTTPException(status_code=409, detail="该报告正在生成中")

    lock = _intel_locks.setdefault(rid, asyncio.Lock())
    if lock.locked():
        raise HTTPException(status_code=409, detail="该报告已有生成任务进行中")
    await lock.acquire()

    profile_store.mark_intel_running(rid)

    # 管道在独立任务中执行：客户端断开时也跑完并落库，SSE 生成器只负责转发事件
    queue: asyncio.Queue = asyncio.Queue()

    async def run_pipeline() -> None:
        try:

            async def emit(data: dict) -> None:
                await queue.put(data)

            await run_intel_report(rid, row["company"], row["target_role"], emit)
        except Exception as e:  # noqa: BLE001
            await queue.put(("__error__", str(e)[:300]))
        finally:
            lock.release()
            await queue.put(("__end__", None))

    pipeline_task = asyncio.create_task(run_pipeline())

    def _is_sentinel(chunk) -> str | None:
        if isinstance(chunk, tuple) and len(chunk) == 2 and chunk[0] in ("__end__", "__error__"):
            return chunk[0]
        return None

    async def gen():
        try:
            while True:
                try:
                    chunk = await asyncio.wait_for(queue.get(), timeout=0.5)
                except TimeoutError:
                    if await request.is_disconnected():
                        break
                    continue
                sentinel = _is_sentinel(chunk)
                if sentinel == "__end__":
                    break
                if sentinel == "__error__":
                    yield sse_frame("error", {"message": chunk[1]})
                    continue
                if await request.is_disconnected():
                    break
                if isinstance(chunk, dict) and "report" in chunk:
                    yield sse_frame("report", chunk["report"])
                else:
                    yield sse_frame("stage", chunk)
            yield sse_frame("done", {})
        finally:
            # 断连时管道继续在后台跑完（状态与锁由它自己收尾）
            if not pipeline_task.done():
                pipeline_task.add_done_callback(
                    lambda t: t.exception() if not t.cancelled() else None
                )

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
