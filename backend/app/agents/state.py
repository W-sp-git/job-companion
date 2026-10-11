"""面试状态图的 State 定义。"""

from __future__ import annotations

import operator
from typing import Annotated

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class InterviewState(TypedDict, total=False):
    # 会话元信息（创建时写入 checkpointer，后续轮次继承）
    session_id: str
    user_id: str
    mode: str  # behavioral | technical | project | pressure
    target_role: str
    company: str
    jd_text: str
    max_rounds: int
    status: str  # created → answering → finishing → finished

    # 开场注入的上下文
    profile: dict
    recalled_memories: list[str]
    company_context: str

    # 对话与出题
    messages: Annotated[list[AnyMessage], add_messages]
    current_question: str
    round: int
    follow_up_depth: int
    qa_history: Annotated[list[dict], operator.add]

    # 评分
    last_evaluation: dict
    score_series: Annotated[list[float], operator.add]

    # 终局
    final_report: dict | None
