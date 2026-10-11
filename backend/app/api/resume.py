"""简历 API：上传解析 / 优化（SSE）/ 版本 / 导出下载。"""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.agents.resume_graph import get_resume_graph
from app.agents.schemas import ResumeDraft
from app.config import get_settings
from app.tools import profile_store
from app.tools.docx_export import render_resume_docx
from app.tools.ocr import parse_resume
from app.utils.sse import iter_stream_events, sse_frame

router = APIRouter(prefix="/api", tags=["resume"])

DEFAULT_USER = "default"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


class OptimizeBody(BaseModel):
    target_role: str = ""
    company: str = ""
    jd_text: str = ""
    max_iterations: int = Field(2, ge=1, le=3)


def _uploads_dir() -> Path:
    d = Path(get_settings().data_dir) / "uploads"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _exports_dir() -> Path:
    d = Path(get_settings().data_dir) / "exports"
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.post("/resumes")
async def upload_resume(file: UploadFile, user_id: str = DEFAULT_USER) -> dict:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="文件为空")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="文件超过 10MB 限制")

    suffix = Path(file.filename or "resume").suffix.lower() or ".bin"
    saved = _uploads_dir() / f"{uuid.uuid4().hex[:10]}{suffix}"
    saved.write_bytes(data)

    try:
        raw, route = await parse_resume(saved)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    resume_id = profile_store.save_resume_file(
        user_id, file.filename or saved.name, str(saved), raw.model_dump()
    )
    return {"resume_id": resume_id, "route": route, "raw_json": raw.model_dump()}


@router.get("/resumes/{resume_id}")
async def get_resume(resume_id: int) -> dict:
    resume = profile_store.get_resume(resume_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="简历不存在")
    return resume


@router.get("/resumes/{resume_id}/versions")
async def list_versions(resume_id: int) -> list[dict]:
    return profile_store.list_resume_versions(resume_id)


@router.post("/resumes/{resume_id}/optimize")
async def optimize_resume(resume_id: int, body: OptimizeBody, request: Request) -> StreamingResponse:
    resume = profile_store.get_resume(resume_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="简历不存在")

    raw_json = resume["raw_json"] or {}
    state_init = {
        "resume_id": resume_id,
        "user_id": resume["user_id"],
        "target_role": body.target_role or raw_json.get("target_role", ""),
        "company": body.company,
        "jd_text": body.jd_text,
        "raw_resume": raw_json,
        "profile": profile_store.get_profile(resume["user_id"]),
        "max_iterations": body.max_iterations,
        "iteration": 0,
        "history": [],
    }
    graph = get_resume_graph()

    # 图与落库都在独立任务中执行：客户端断开也会产出结果并保存版本；
    # SSE 生成器只从队列转发事件。
    queue: asyncio.Queue = asyncio.Queue()

    async def run_graph() -> None:
        final_draft: dict = {}
        final_review: dict = {}
        review_history: list[dict] = []
        try:
            async for chunk in graph.astream(state_init, stream_mode=["custom", "updates"]):
                await queue.put(chunk)
                mode, payload = iter_stream_events(chunk)
                if mode == "updates":
                    for node, update in (payload or {}).items():
                        if not isinstance(update, dict):
                            continue
                        if node in ("draft", "refine") and update.get("draft"):
                            final_draft = update["draft"]
                        elif node == "review" and update.get("review"):
                            final_review = update["review"]
                            review_history.append(update["review"])

            if final_draft:
                version_id = profile_store.save_resume_version(
                    resume_id, final_draft, final_review, review_history=review_history
                )
                docx_path = _exports_dir() / f"resume_{resume_id}_v{version_id}.docx"
                render_resume_docx(ResumeDraft.model_validate(final_draft), docx_path)
                profile_store.update_version_docx(version_id, str(docx_path))
                await queue.put(
                    (
                        "__result__",
                        {
                            "version_id": version_id,
                            "draft": final_draft,
                            "review": final_review,
                            "review_history": review_history,
                            "download_url": f"/api/resume-versions/{version_id}/docx",
                        },
                    )
                )
        except Exception as e:  # noqa: BLE001
            await queue.put(("__error__", str(e)[:300]))
        finally:
            await queue.put(("__end__", None))

    graph_task = asyncio.create_task(run_graph())

    async def gen():
        try:
            while True:
                try:
                    chunk = await asyncio.wait_for(queue.get(), timeout=0.5)
                except TimeoutError:
                    if await request.is_disconnected():
                        break
                    continue
                if isinstance(chunk, tuple) and len(chunk) == 2 and isinstance(chunk[0], str) and chunk[0].startswith("__"):
                    if chunk[0] == "__end__":
                        break
                    if chunk[0] == "__error__":
                        yield sse_frame("error", {"message": chunk[1]})
                        continue
                    if chunk[0] == "__result__":
                        yield sse_frame("result", chunk[1])
                        continue
                if await request.is_disconnected():
                    break
                try:
                    mode, payload = iter_stream_events(chunk)
                except ValueError:
                    continue
                if mode == "custom":
                    data = payload if isinstance(payload, dict) else {"label": str(payload)}
                    yield sse_frame("stage", data)
                elif mode == "updates":
                    for node, update in (payload or {}).items():
                        if isinstance(update, dict):
                            yield sse_frame("node", {"node": node})
            yield sse_frame("done", {})
        finally:
            if not graph_task.done():
                graph_task.add_done_callback(lambda t: t.exception() if not t.cancelled() else None)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.get("/resume-versions/{version_id}/docx")
async def download_docx(version_id: int) -> FileResponse:
    version = profile_store.get_version(version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="版本不存在")

    docx_path = version.get("docx_path")
    if not docx_path or not Path(docx_path).exists():
        draft = ResumeDraft.model_validate(version["draft_json"] or {})
        docx_path = str(_exports_dir() / f"resume_{version['resume_id']}_v{version_id}.docx")
        render_resume_docx(draft, docx_path)
        profile_store.update_version_docx(version_id, docx_path)

    filename = f"简历_v{version['version_no']}.docx"
    return FileResponse(
        docx_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
    )


@router.get("/resume-versions/{version_id}/review")
async def get_version_review(version_id: int) -> dict:
    version = profile_store.get_version(version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="版本不存在")
    return {"review": version.get("review_json") or {}, "draft": version.get("draft_json") or {}}
