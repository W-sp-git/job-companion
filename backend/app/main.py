"""FastAPI 入口：lifespan 初始化 DB / checkpointer，挂载 API 路由。"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.agents.interview_graph import close_interview_graph, get_interview_graph
from app.api import api_router
from app.config import PROVIDER_REGISTRY, TASKS, get_settings
from app.db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    await get_interview_graph()
    yield
    await close_interview_graph()


app = FastAPI(title="求职搭子智能体", version="0.1.0", lifespan=lifespan)
app.include_router(api_router)


@app.get("/api/health")
async def health() -> dict:
    settings = get_settings()
    providers = {
        name: {
            "label": meta["label"],
            "key_configured": bool(settings.provider_key(name)),
        }
        for name, meta in PROVIDER_REGISTRY.items()
    }
    tasks = {
        t: {"provider": settings.task_provider(t), "model": settings.task_model(t)}
        for t in TASKS
    }
    return {
        "status": "ok",
        "providers": providers,
        "tasks": tasks,
        "search_provider": settings.search_provider,
        "tavily_key_configured": bool(settings.tavily_api_key),
    }
