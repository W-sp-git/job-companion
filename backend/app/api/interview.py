"""面试会话 API：CRUD + SSE 流式主接口。"""

from __future__ import annotations

import asyncio
import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from app.agents.interview_graph import STREAMING_NODES, get_interview_graph
from app.db.models import JobOpportunity
from app.tools import profile_store, weakness_cluster, workspace_store
from app.tools.candidate import enriched_resume, redact
from app.utils.sse import iter_stream_events, sse_frame

router = APIRouter(prefix="/api/interview", tags=["interview"])

DEFAULT_USER = "default"
_session_locks: dict[str, asyncio.Lock] = {}


class CreateSessionBody(BaseModel):
    mode: Literal["behavioral", "technical", "project", "pressure"] = "behavioral"
    target_role: str = ""
    jd_text: str = ""
    company: str = ""
    max_rounds: int = Field(8, ge=1, le=20)
    user_id: str = DEFAULT_USER
    job_id: int | None = None
    resume_version_id: int | None = None
    intel_report_id: int | None = None
    locale: Literal["zh", "en"] = "zh"
    feedback_mode: Literal["coaching", "simulation"] = "coaching"


class StreamBody(BaseModel):
    control: str = Field(..., pattern="^(start|answer|finish)$")
    message: str = ""


@router.post("/sessions")
async def create_session(body: CreateSessionBody) -> dict:
    job = (
        workspace_store.get_record(JobOpportunity, body.job_id) if body.job_id else None
    )
    if body.job_id and not job:
        raise HTTPException(404, "岗位不存在")
    version_id = body.resume_version_id or (job or {}).get("resume_version_id")
    resume_context = {}
    if version_id:
        version = profile_store.get_version(version_id)
        if not version:
            raise HTTPException(422, "简历版本不存在")
        from app.api.resume import export_issues

        if export_issues(version):
            raise HTTPException(
                422, "所选简历仍有事实或高风险评审问题，请先在简历工作室核对"
            )
        resume_context = redact(version["draft_json"])
    else:
        resume_context = redact(enriched_resume({}))
    intel_id = body.intel_report_id or (job or {}).get("intel_report_id")
    intel = profile_store.get_intel_report(intel_id) if intel_id else None
    company = job["company"] if job else body.company
    if intel_id and (
        not intel or intel["status"] != "done" or intel["company"] != company
    ):
        raise HTTPException(422, "情报必须来自同一公司的已完成报告")
    context = {
        "job_id": body.job_id,
        "resume_version_id": version_id,
        "resume_context": resume_context,
        "company_context": (intel or {}).get("report_json") or {},
        "locale": body.locale,
        "feedback_mode": body.feedback_mode,
    }
    sid = uuid.uuid4().hex[:12]
    profile_store.create_session(
        sid,
        body.user_id,
        body.mode,
        job["target_role"] if job else body.target_role,
        job["jd_text"] if job else body.jd_text,
        body.max_rounds,
        company=company,
        context=context,
    )
    if body.job_id:
        workspace_store.add_activity(
            body.job_id,
            "mock_interview",
            "开始岗位模拟面试",
            {"session_id": sid, "resume_version_id": version_id},
        )
    return {"session_id": sid}


@router.get("/sessions")
async def list_sessions(user_id: str = DEFAULT_USER) -> list[dict]:
    return profile_store.list_sessions(user_id)


@router.get("/stats")
async def interview_stats(user_id: str = DEFAULT_USER) -> dict:
    """战绩归档：历次面试的总览 / 趋势（只读 DB，零 LLM，秒回）。"""
    return profile_store.get_interview_stats(user_id)


@router.get("/weakness-clusters")
async def weakness_clusters(user_id: str = DEFAULT_USER) -> dict:
    """跨场弱点聚类：首次/新面试后由 qwen-flash 归并，其余走内存缓存。"""
    return await weakness_cluster.get_clusters(user_id)


@router.get("/sessions/{sid}")
async def get_session_detail(sid: str) -> dict:
    session = profile_store.get_session(sid)
    if session is None:
        raise HTTPException(status_code=404, detail="会话不存在")

    messages: list[dict] = []
    try:
        graph = await get_interview_graph()
        st = await graph.aget_state({"configurable": {"thread_id": sid}})
        for m in (st.values or {}).get("messages", []):
            role = "user" if getattr(m, "type", "") == "human" else "assistant"
            content = m.content if isinstance(m.content, str) else str(m.content)
            messages.append({"role": role, "content": content})
    except Exception:  # noqa: BLE001 - 状态不可用时退回逐题记录
        messages = [
            {"role": "assistant", "content": t["question"]}
            for t in profile_store.list_turns(sid)
        ]

    return {
        "session": session,
        "turns": profile_store.list_turns(sid),
        "messages": messages,
    }


@router.get("/sessions/{sid}/report")
async def get_session_report(sid: str) -> dict:
    report = profile_store.get_report(sid)
    if report is None:
        raise HTTPException(status_code=404, detail="复盘报告尚未生成")
    return report


@router.post("/sessions/{sid}/stream")
async def stream_turn(
    sid: str, body: StreamBody, request: Request
) -> StreamingResponse:
    session = profile_store.get_session(sid)
    if session is None:
        raise HTTPException(status_code=404, detail="会话不存在")

    if body.control == "start":
        if session["status"] != "created":
            raise HTTPException(status_code=409, detail="会话已开始，请直接用 answer")
        inputs: dict = {
            "session_id": sid,
            "user_id": session["user_id"],
            "mode": session["mode"],
            "target_role": session["target_role"],
            "jd_text": session["jd_text"],
            "max_rounds": session["max_rounds"],
            "company": session.get("company", ""),
            "status": "created",
            **{
                key: session.get("context", {}).get(key, default)
                for key, default in (
                    ("resume_context", {}),
                    ("company_context", {}),
                    ("job_id", None),
                    ("locale", "zh"),
                    ("feedback_mode", "coaching"),
                )
            },
        }
    elif body.control == "answer":
        if not body.message.strip():
            raise HTTPException(status_code=422, detail="回答不能为空")
        inputs = {"messages": [HumanMessage(content=body.message)]}
    else:  # finish
        inputs = {"status": "finishing"}

    lock = _session_locks.setdefault(sid, asyncio.Lock())
    if lock.locked():
        raise HTTPException(status_code=409, detail="该会话已有生成任务进行中")
    await lock.acquire()

    graph = await get_interview_graph()
    config = {"configurable": {"thread_id": sid}}

    # 图在独立任务中执行：客户端断开（如点"停止生成"）时也跑完本轮并提交状态，
    # SSE 生成器只负责从队列转发事件。
    queue: asyncio.Queue = asyncio.Queue()

    async def run_graph() -> None:
        try:
            async for chunk in graph.astream(
                inputs, config, stream_mode=["messages", "custom", "updates"]
            ):
                await queue.put(chunk)
        except Exception as e:  # noqa: BLE001
            await queue.put(("__error__", str(e)[:300]))
        finally:
            lock.release()
            await queue.put(("__end__", None))

    graph_task = asyncio.create_task(run_graph())

    def _is_sentinel(chunk) -> str | None:
        if (
            isinstance(chunk, tuple)
            and len(chunk) == 2
            and chunk[0] in ("__end__", "__error__")
        ):
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
                try:
                    mode, payload = iter_stream_events(chunk)
                except ValueError:
                    continue
                if mode == "messages":
                    msg, meta = payload
                    node = (meta or {}).get("langgraph_node")
                    content = getattr(msg, "content", "")
                    if node in STREAMING_NODES and isinstance(content, str) and content:
                        yield sse_frame("token", {"delta": content})
                elif mode == "custom":
                    data = (
                        payload
                        if isinstance(payload, dict)
                        else {"label": str(payload)}
                    )
                    yield sse_frame("stage", data)
                elif mode == "updates":
                    for node, update in (payload or {}).items():
                        if not isinstance(update, dict):
                            continue
                        if node == "evaluate_answer" and update.get("last_evaluation"):
                            yield sse_frame("score", update["last_evaluation"])
                        elif node == "report" and update.get("final_report"):
                            yield sse_frame("report", update["final_report"])
                        else:
                            yield sse_frame("node_end", {"node": node})
            yield sse_frame("done", {})
        finally:
            # 断连时图任务继续在后台跑完（状态与锁由它自己收尾）
            if not graph_task.done():
                graph_task.add_done_callback(
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
