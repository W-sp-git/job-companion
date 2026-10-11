"""阶段验证 CLI。

用法（在 backend/ 目录下）：
    uv run python -m scripts.cli ping
    uv run python -m scripts.cli parse-resume samples/resume_text.pdf
    uv run python -m scripts.cli interview --mode technical --rounds 4 --role "Java 后端开发工程师"
    uv run python -m scripts.cli remember "我是软件工程大三学生，目标岗位是后端开发"
    uv run python -m scripts.cli recall "我的目标岗位是什么"
    uv run python -m scripts.cli profile '{"major": "软件工程", "target_role": "后端开发工程师"}'
"""

from __future__ import annotations

import asyncio
import json
import time

import httpx
import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(no_args_is_help=True, help="求职搭子后端验证 CLI")
console = Console()


# ---------- ping ----------

async def _ping_llm(task: str) -> tuple[str, float]:
    from app.agents.llm import get_llm

    llm = get_llm(task, temperature=0.1)
    t0 = time.perf_counter()
    resp = await llm.ainvoke("请只回复四个字：连通正常")
    dt = time.perf_counter() - t0
    return str(resp.content).strip()[:60], dt


async def _ping_tavily() -> tuple[str, float]:
    from app.config import get_settings

    settings = get_settings()
    if not settings.tavily_api_key:
        raise RuntimeError("未配置 TAVILY_API_KEY")
    t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.tavily.com/search",
            headers={"Authorization": f"Bearer {settings.tavily_api_key}"},
            json={"query": "大学生 校招 后端开发", "max_results": 2, "search_depth": "basic"},
        )
        resp.raise_for_status()
        data = resp.json()
    dt = time.perf_counter() - t0
    return f"返回 {len(data.get('results', []))} 条结果", dt


@app.command()
def ping() -> None:
    """对 5 类任务的模型与 Tavily 搜索各发一次请求，验证连通性。"""

    async def run() -> None:
        from app.config import get_settings

        settings = get_settings()
        table = Table(title="连通性检查", show_lines=True)
        table.add_column("项目", style="bold")
        table.add_column("状态")
        table.add_column("耗时", justify="right")
        table.add_column("响应 / 错误", overflow="fold")

        for task in ("interview", "judge", "ocr", "draft", "review"):
            provider = settings.task_provider(task)
            model = settings.task_model(task)
            label = f"{task}\n{provider}/{model}"
            try:
                msg, dt = await _ping_llm(task)
                table.add_row(label, "[green]通过[/green]", f"{dt:.2f}s", msg)
            except Exception as e:  # noqa: BLE001
                table.add_row(label, "[red]失败[/red]", "-", str(e)[:220])

        try:
            msg, dt = await _ping_tavily()
            table.add_row(
                f"tavily\n{settings.search_provider}", "[green]通过[/green]", f"{dt:.2f}s", msg
            )
        except Exception as e:  # noqa: BLE001
            table.add_row("tavily", "[red]失败[/red]", "-", str(e)[:220])

        console.print(table)

    asyncio.run(run())


# ---------- 简历解析 ----------

@app.command("parse-resume")
def parse_resume_cmd(
    file: str = typer.Argument(..., help="简历文件路径（pdf / png / jpg / txt）"),
    vision: bool = typer.Option(False, "--vision", help="强制走视觉识别路线"),
) -> None:
    """解析简历文件，打印所用路线与结构化 JSON。"""

    async def run() -> None:
        from app.tools.ocr import parse_resume

        t0 = time.perf_counter()
        raw, route = await parse_resume(file, force_vision=vision)
        dt = time.perf_counter() - t0
        console.print(f"[bold]解析路线：[/bold]{route}    [bold]耗时：[/bold]{dt:.1f}s")
        console.print_json(raw.model_dump_json(indent=2))

    asyncio.run(run())


# ---------- 记忆与档案 ----------

@app.command()
def remember(
    text: str = typer.Argument(..., help="要记住的事实"),
    user: str = typer.Option("default", help="用户 ID"),
) -> None:
    """写入一条长期记忆（Mem0 提取，需数秒）。"""
    from app.memory.memory_manager import remember_fact

    remember_fact(user, text)
    console.print("[green]已写入记忆[/green]")


@app.command()
def recall(
    query: str = typer.Argument(..., help="检索问题"),
    user: str = typer.Option("default", help="用户 ID"),
    limit: int = typer.Option(5, help="条数"),
) -> None:
    """语义检索长期记忆。"""
    from app.memory.memory_manager import recall as _recall

    items = _recall(user, query, limit=limit)
    if not items:
        console.print("[yellow]没有召回记忆[/yellow]")
        return
    for it in items:
        score = it.get("score")
        score_str = f"{score:.3f}" if isinstance(score, (int, float)) else "-"
        console.print(f"- ({score_str}) {it['memory']}", markup=False, soft_wrap=True)


@app.command()
def profile(
    patch: str = typer.Argument(..., help='JSON 补丁，如 \'{"major": "软件工程"}\''),
    user: str = typer.Option("default", help="用户 ID"),
) -> None:
    """更新学生档案（合并式）并同步到长期记忆。"""
    from app.db.database import init_db
    from app.memory import memory_manager
    from app.tools import profile_store

    init_db()
    merged = profile_store.upsert_profile(user, json.loads(patch))
    console.print_json(json.dumps(merged, ensure_ascii=False))
    try:
        memory_manager.ingest_profile(user, json.loads(patch))
        console.print("[green]已同步到长期记忆[/green]")
    except Exception as e:  # noqa: BLE001
        console.print(f"[yellow]记忆同步失败（不影响档案）：{e}[/yellow]")


# ---------- 交互式面试 ----------

async def _stream_turn(graph, config, inputs) -> None:
    from app.agents.interview_graph import STREAMING_NODES
    from app.utils.sse import iter_stream_events

    async for chunk in graph.astream(inputs, config, stream_mode=["messages", "custom", "updates"]):
        try:
            mode, payload = iter_stream_events(chunk)
        except ValueError:
            continue
        if mode == "messages":
            msg, meta = payload
            node = (meta or {}).get("langgraph_node")
            content = getattr(msg, "content", "")
            if node in STREAMING_NODES and isinstance(content, str) and content:
                console.print(content, end="", highlight=False, markup=False, soft_wrap=True)
        elif mode == "custom":
            label = (payload or {}).get("label") if isinstance(payload, dict) else str(payload)
            if label:
                console.print(f"\n[dim]· {label}[/dim]")
        elif mode == "updates":
            for node, update in (payload or {}).items():
                if not isinstance(update, dict):
                    continue
                if node == "evaluate_answer" and update.get("last_evaluation"):
                    ev = update["last_evaluation"]
                    console.print(
                        f"\n[cyan]▸ 本题得分 {ev.get('score')}/10：{ev.get('comment', '')}[/cyan]"
                    )
                elif node == "report" and update.get("final_report"):
                    console.print("\n[bold]复盘报告：[/bold]")
                    console.print_json(json.dumps(update["final_report"], ensure_ascii=False))
    console.print()


@app.command()
def interview(
    mode: str = typer.Option("technical", help="behavioral / technical / project / pressure"),
    rounds: int = typer.Option(4, help="主题目数量"),
    role: str = typer.Option("Java 后端开发工程师", help="目标岗位"),
    jd: str = typer.Option("", help="岗位 JD 文本（可空）"),
    company: str = typer.Option("", help="公司名（填了会联网调研）"),
    session: str = typer.Option("", "--session", help="已有会话 ID（留空新建；填已有 ID 可续聊）"),
) -> None:
    """终端交互式模拟面试（Ctrl+C 退出，重进同 session 可续聊）。"""

    async def run() -> None:
        import uuid

        from langchain_core.messages import HumanMessage

        from app.agents.interview_graph import (
            close_interview_graph,
            get_interview_graph,
        )
        from app.db.database import init_db
        from app.tools import profile_store

        init_db()
        sid = session or f"cli-{uuid.uuid4().hex[:8]}"
        fresh = profile_store.get_session(sid) is None
        if fresh:
            profile_store.create_session(sid, "default", mode, role, jd, rounds, company=company)

        graph = await get_interview_graph()
        config = {"configurable": {"thread_id": sid}}
        console.print(f"[bold]会话：[/bold]{sid}  mode={mode}  rounds={rounds}  role={role}")

        if fresh:
            console.rule("[bold]面试开始")
            await _stream_turn(
                graph,
                config,
                {
                    "session_id": sid,
                    "user_id": "default",
                    "mode": mode,
                    "target_role": role,
                    "company": company,
                    "jd_text": jd,
                    "max_rounds": rounds,
                    "status": "created",
                },
            )

        while True:
            state = await graph.aget_state(config)
            if (state.values or {}).get("status") == "finished":
                console.rule("[bold]面试结束")
                break
            answer = console.input("[bold green]你的回答（/finish 提前结束）> [/bold green]").strip()
            if answer in ("/finish", "/end", "结束"):
                await _stream_turn(graph, config, {"status": "finishing"})
                console.rule("[bold]面试结束")
                break
            if not answer:
                continue
            await _stream_turn(graph, config, {"messages": [HumanMessage(content=answer)]})

        await close_interview_graph()

    asyncio.run(run())


if __name__ == "__main__":
    app()
