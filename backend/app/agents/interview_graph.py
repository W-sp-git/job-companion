"""面试状态图：确定性状态机 + 可测的路由纯函数 + AsyncSqliteSaver 断点续聊。

运行语义：每收到一条用户消息，用同一 thread_id 调一次 graph.astream(input, config)，
从 checkpointer 恢复状态合并输入，按条件路由只执行本轮需要的节点。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph

from app.agents.llm import get_llm
from app.agents.prompts import (
    EVALUATE_SYSTEM,
    MODE_PERSONAS,
    OPENING_SYSTEM,
    REPORT_SYSTEM,
)
from app.agents.schemas import AnswerEvaluation, InterviewReport
from app.agents.state import InterviewState
from app.config import get_settings
from app.memory import memory_manager
from app.tools import profile_store
from app.tools.search import web_search_text
from app.utils.structured import call_structured

# 允许把 token 流推给前端的节点（评分/报告等结构化节点绝不外泄原始输出）
STREAMING_NODES = {"opening", "probe", "next_question"}


def _emit(payload: dict) -> None:
    try:
        get_stream_writer()(payload)
    except Exception:  # noqa: BLE001 - 非流式上下文下静默
        pass


def _text_of(resp: Any) -> str:
    content = getattr(resp, "content", resp)
    return content if isinstance(content, str) else str(content)


def _profile_summary(profile: dict) -> str:
    if not profile:
        return "（暂无档案）"
    return "；".join(f"{k}：{v}" for k, v in profile.items() if v)


def _interviewer_system(state: InterviewState) -> str:
    persona_name, persona_desc = MODE_PERSONAS.get(
        state.get("mode", "behavioral"), MODE_PERSONAS["behavioral"]
    )
    return (
        f"你是求职模拟面试的{persona_name}。{persona_desc}\n"
        f"目标岗位：{state.get('target_role') or '（通用校招）'}；"
        f"面试契约：共 {state.get('max_rounds', 8)} 道主题目，当前第 {state.get('round', 1)} 题。\n"
        "规则：一次只问一个问题；使用中文；不评价候选人回答（评分由系统处理）；不输出任何格式标记。"
    )


# ---------- 节点 ----------

async def opening_node(state: InterviewState) -> dict:
    sid = state.get("session_id", "")
    user_id = state.get("user_id", "default")
    mode = state.get("mode", "behavioral")
    target_role = state.get("target_role", "")
    company = state.get("company", "")
    max_rounds = int(state.get("max_rounds", 8))

    _emit({"stage": "recalling", "label": "正在调取你的档案与长期记忆…"})
    profile = profile_store.get_profile(user_id)
    try:
        memories = await memory_manager.arecall(
            user_id, f"{target_role} 面试弱点 背景 经历", limit=5
        )
    except Exception:  # noqa: BLE001 - 记忆不可用不阻塞面试
        memories = []

    company_context = ""
    if company:
        _emit({"stage": "searching_company", "company": company, "label": f"正在调研「{company}」的岗位背景与面经…"})
        try:
            company_context = await web_search_text(
                f"{company} {target_role} 校招 面经 岗位要求", count=5
            )
        except Exception as e:  # noqa: BLE001
            company_context = f"（公司调研失败，跳过：{e}）"

    persona_name, persona_desc = MODE_PERSONAS.get(mode, MODE_PERSONAS["behavioral"])
    system = OPENING_SYSTEM.format(
        persona_name=persona_name,
        persona_desc=persona_desc,
        mode=mode,
        target_role=target_role or "（未指定，按通用校招处理）",
        profile_summary=_profile_summary(profile),
        memories="；".join(m["memory"] for m in memories) or "（暂无）",
        company_context=company_context or "（无）",
        max_rounds=max_rounds,
    )

    _emit({"stage": "opening", "label": "面试官已入场"})
    llm = get_llm("interview", temperature=0.7, streaming=True)
    resp = await llm.ainvoke([SystemMessage(content=system), HumanMessage(content="现在开始面试。")])

    profile_store.set_session_status(sid, "answering")
    return {
        "status": "answering",
        "round": 1,
        "follow_up_depth": 0,
        "messages": [resp],
        "current_question": _text_of(resp),
        "profile": profile,
        "recalled_memories": [m["memory"] for m in memories],
        "company_context": company_context,
    }


async def evaluate_answer_node(state: InterviewState) -> dict:
    sid = state.get("session_id", "")
    question = state.get("current_question", "")
    answer = ""
    for m in reversed(state.get("messages", [])):
        if isinstance(m, HumanMessage):
            answer = _text_of(m)
            break

    eval_llm = get_llm("judge", temperature=0.2)
    evaluation = await call_structured(
        eval_llm,
        AnswerEvaluation,
        [
            {
                "role": "system",
                "content": EVALUATE_SYSTEM.format(
                    mode=state.get("mode", ""), target_role=state.get("target_role", "")
                ),
            },
            {"role": "user", "content": f"【面试问题】\n{question}\n\n【候选人回答】\n{answer}"},
        ],
    )
    ev = evaluation.model_dump()
    round_no = int(state.get("round", 1))
    _emit({"stage": "evaluated", "round": round_no, "label": f"第 {round_no} 题评分完成"})
    try:
        profile_store.save_turn(sid, round_no, question, answer, ev)
    except Exception:  # noqa: BLE001
        pass
    return {
        "last_evaluation": ev,
        "qa_history": [{"round": round_no, "question": question, "answer": answer, "evaluation": ev}],
        "score_series": [float(evaluation.score)],
    }


async def probe_node(state: InterviewState) -> dict:
    _emit({"stage": "probe", "label": "面试官正在追问…"})
    llm = get_llm("interview", temperature=0.7, streaming=True)
    hint = (state.get("last_evaluation") or {}).get("follow_up_hint", "")
    instruction = (
        "（内部指令：针对候选人上一回答进行追问。追问方向参考："
        f"{hint or '深挖细节、验证真实性'}。只输出这一条追问，不要评价、不要给分、不要开启新话题。）"
    )
    resp = await llm.ainvoke(
        [SystemMessage(content=_interviewer_system(state)), *state.get("messages", []), HumanMessage(content=instruction)]
    )
    return {
        "messages": [resp],
        "current_question": _text_of(resp),
        "follow_up_depth": int(state.get("follow_up_depth", 0)) + 1,
    }


async def next_question_node(state: InterviewState) -> dict:
    round_no = int(state.get("round", 0)) + 1
    _emit({"stage": "next_question", "round": round_no, "label": f"第 {round_no} 题"})
    llm = get_llm("interview", temperature=0.7, streaming=True)
    instruction = (
        f"（内部指令：请提出第 {round_no} 个问题（共 {state.get('max_rounds', 8)} 题）。"
        "结合目标岗位与之前的问答递进出题，避免重复已问过的内容。只输出问题本身。）"
    )
    resp = await llm.ainvoke(
        [
            SystemMessage(content=_interviewer_system({**state, "round": round_no})),
            *state.get("messages", []),
            HumanMessage(content=instruction),
        ]
    )
    return {
        "messages": [resp],
        "round": round_no,
        "follow_up_depth": 0,
        "current_question": _text_of(resp),
    }


async def report_node(state: InterviewState) -> dict:
    _emit({"stage": "reporting", "label": "正在生成复盘报告…"})
    sid = state.get("session_id", "")
    qa = state.get("qa_history", [])
    lines = []
    for item in qa:
        ev = item.get("evaluation") or {}
        lines.append(
            f"第{item.get('round')}题：{item.get('question')}\n"
            f"回答：{item.get('answer')}\n"
            f"评分：{ev.get('score')}　点评：{ev.get('comment', '')}"
        )
    transcript = "\n\n".join(lines) or "（本次面试没有完成任何问答）"

    llm = get_llm("judge", temperature=0.2)
    report = await call_structured(
        llm,
        InterviewReport,
        [
            {
                "role": "system",
                "content": REPORT_SYSTEM.format(
                    target_role=state.get("target_role", ""), mode=state.get("mode", "")
                ),
            },
            {"role": "user", "content": f"面试问答记录：\n\n{transcript}"},
        ],
    )
    report_json = report.model_dump()
    try:
        profile_store.save_report(sid, report_json, float(report.overall_score))
        profile_store.set_session_status(sid, "finished")
    except Exception:  # noqa: BLE001
        pass
    if report.weaknesses:
        try:
            await memory_manager.aremember_fact(
                state.get("user_id", "default"),
                "面试弱点：" + "；".join(report.weaknesses),
                fact_type="weakness",
                session_id=sid,
            )
        except Exception:  # noqa: BLE001
            pass
    return {"final_report": report_json, "status": "finished"}


# ---------- 路由（纯函数，可单测） ----------

def route_turn(state: InterviewState) -> str:
    status = state.get("status", "created")
    if status == "created":
        return "opening"
    if status == "finishing":
        return "report"
    if status == "finished":
        return "end"
    return "evaluate_answer"


def after_evaluate(state: InterviewState) -> str:
    if int(state.get("round", 1)) >= int(state.get("max_rounds", 8)):
        return "report"
    ev = state.get("last_evaluation") or {}
    if ev.get("needs_follow_up") and int(state.get("follow_up_depth", 0)) < 2:
        return "probe"
    return "next_question"


# ---------- 图构建与单例 ----------

def build_interview_graph(checkpointer=None):
    b = StateGraph(InterviewState)
    b.add_node("opening", opening_node)
    b.add_node("evaluate_answer", evaluate_answer_node)
    b.add_node("probe", probe_node)
    b.add_node("next_question", next_question_node)
    b.add_node("report", report_node)

    b.add_conditional_edges(
        START,
        route_turn,
        {"opening": "opening", "evaluate_answer": "evaluate_answer", "report": "report", "end": END},
    )
    b.add_conditional_edges(
        "evaluate_answer",
        after_evaluate,
        {"probe": "probe", "next_question": "next_question", "report": "report"},
    )
    for node in ("opening", "probe", "next_question", "report"):
        b.add_edge(node, END)
    return b.compile(checkpointer=checkpointer)


async def create_async_sqlite_saver(db_path: str):
    """兼容不同 langgraph 版本的 AsyncSqliteSaver 初始化。返回 (saver, cleanup)。"""
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    try:
        cm = AsyncSqliteSaver.from_conn_string(db_path)
        saver = await cm.__aenter__()

        async def cleanup() -> None:
            await cm.__aexit__(None, None, None)

        return saver, cleanup
    except AttributeError:
        import aiosqlite

        conn = await aiosqlite.connect(db_path)
        saver = AsyncSqliteSaver(conn)

        async def cleanup() -> None:
            await conn.close()

        return saver, cleanup


_graph = None
_graph_cleanup = None


async def get_interview_graph():
    global _graph, _graph_cleanup
    if _graph is None:
        db_path = str(Path(get_settings().data_dir) / "checkpoints.db")
        saver, _graph_cleanup = await create_async_sqlite_saver(db_path)
        _graph = build_interview_graph(saver)
    return _graph


async def close_interview_graph() -> None:
    global _graph, _graph_cleanup
    if _graph_cleanup is not None:
        await _graph_cleanup()
    _graph = None
    _graph_cleanup = None
