"""背调管道：4 路检索 → LLM 结构化抽取 → 确定性防虚构校验 → 落库存档。

单次任务、无多轮状态，用普通异步管道 + emit 回调（不用 LangGraph）；
落库在管道内完成，与 SSE 解耦——客户端断开也跑完并进存档。
"""

from __future__ import annotations

from datetime import datetime

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.llm import get_llm
from app.agents.prompts import INTEL_SYSTEM, INTEL_USER
from app.agents.schemas import IntelReport
from app.tools import profile_store
from app.tools.intel_search import EmitFn, gather_evidence, render_evidence
from app.tools.intel_verify import verify_intel_report
from app.utils.structured import call_structured


async def run_intel_report(
    report_id: int,
    company: str,
    target_role: str,
    emit: EmitFn,
) -> None:
    try:
        evidence = await gather_evidence(company, target_role, emit=emit)
        if not evidence:
            profile_store.fail_intel_report(report_id, "未检索到任何公开来源")
            await emit({"stage": "failed", "label": "未检索到任何公开来源，无法生成情报（可稍后重试）"})
            return

        await emit(
            {
                "stage": "extract",
                "count": len(evidence),
                "label": f"已收集 {len(evidence)} 条来源，正在结构化抽取…",
            }
        )
        llm = get_llm("intel", temperature=0.1)
        report = await call_structured(
            llm,
            IntelReport,
            [
                SystemMessage(content=INTEL_SYSTEM),
                HumanMessage(
                    content=INTEL_USER.format(
                        company=company,
                        target_role=target_role or "（未指定）",
                        today=datetime.now().strftime("%Y-%m-%d"),
                        evidence=render_evidence(evidence),
                    )
                ),
            ],
        )

        await emit({"stage": "verify", "label": "防虚构校验：正在比对原文…"})
        report_out, verification = verify_intel_report(report, evidence)
        # 身份字段以用户输入为准（不信任 LLM 回显）
        report_out["company"] = company
        report_out["target_role"] = target_role

        await emit({"stage": "save", "label": "正在存档…"})
        sources = [
            {"sid": ev.sid, "lane": ev.lane, "title": ev.title, "url": ev.url, "date": ev.date}
            for ev in evidence
        ]
        evidence_dump = [ev.model_dump() for ev in evidence]
        profile_store.finish_intel_report(
            report_id,
            {"report": report_out, "verification": verification, "sources": sources},
            evidence_dump,
            len(evidence),
        )
        await emit(
            {
                "report": {
                    "report_id": report_id,
                    "company": company,
                    "target_role": target_role,
                    "created_at": datetime.now().isoformat(),
                    "report": report_out,
                    "verification": verification,
                    "sources": sources,
                }
            }
        )
    except Exception as e:  # 失败落库后交给上层转 error 事件
        profile_store.fail_intel_report(report_id, str(e)[:300])
        raise
