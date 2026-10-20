"""简历优化图：起草者-审查者-修订者循环（max_iterations=2）。

- draft（qwen-max）：只做重排/量化改写/关键词对齐，绝不虚构；差距进 target_gaps
- review（glm-4-plus，全新上下文保证视角独立）：联网调研 + ATS 覆盖 + 确定性防虚构守卫 + LLM 评审
- refine（qwen-max）：按评审意见修订；循环回 review
"""

from __future__ import annotations

import json
import operator
from typing import Annotated

from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

from app.agents.llm import get_llm
from app.agents.prompts import JD_KEYWORDS_SYSTEM
from app.agents.schemas import JdKeywords, ResumeDraft, ResumeRaw, ReviewReport
from app.memory import memory_manager
from app.tools.candidate import candidate_json
from app.tools.factuality import (
    ats_keyword_check,
    ground_review,
    resume_body_text,
    verify_factuality,
    verify_numbers,
)
from app.tools.search import web_search_text
from app.utils.structured import call_structured


class ResumeState(TypedDict, total=False):
    resume_id: int
    user_id: str
    target_role: str
    company: str
    jd_text: str
    raw_resume: dict
    profile: dict
    jd_keywords: list[str]
    company_context: str
    draft: dict
    review: dict
    factuality_violations: list[dict]
    ats_result: dict
    iteration: int
    max_iterations: int
    history: Annotated[list[dict], operator.add]
    locale: str


def output_language(state: ResumeState) -> str:
    return (
        "\n所有自然语言内容用英文输出，保留人名、单位和专有名称原文。"
        if state.get("locale") == "en"
        else "\n所有自然语言内容用中文输出。"
    )


def _emit(payload: dict) -> None:
    try:
        get_stream_writer()(payload)
    except Exception:  # noqa: BLE001
        pass


DRAFT_SYSTEM = """你是资深简历优化顾问。基于候选人原始简历与目标 JD，产出优化后的简历（ResumeDraft）。

硬性规则（违反视为失败）：
1. 绝不虚构：原始简历和档案里没有的经历、技能、数据，一律不得添加。数字只能来自原文。
2. 可以做的：重排结构、把经历改写得更结构化（动词开头、结果导向）、对齐 JD 关键词（仅当本人确有该技能）、补写 summary（只总结已有事实）。
3. JD 要求但候选人明显不具备的技能，放入 target_gaps，绝不混入 skills。
4. 每条 bullet 尽量包含动作 + 方法 + 量化结果（仅使用原文提供的数字）。
5. skills每项只使用有依据的规范技能名称（如Java、Redis），不要添加熟练程度词、合并技能或扩写成句子。
6. 技能名称优先沿用原材料的措辞。规则检查无法匹配某种改称，不等于用户不具备这项能力；已有经历明确体现的能力不得重复列为 target_gaps。

过往模拟面试反馈（若存在，可用于针对性强化，但仍不得扩写事实）：{memories}"""

REVIEW_SYSTEM = """你是独立简历评审官（与起草者相互独立，只看到草稿与原始材料）。请审查简历草稿：

1. 事实性：草稿中的经历/技能是否都有原始简历依据（无依据 = high 级问题）
2. 关键词覆盖：结合给定的 JD 关键词缺失清单
3. 表达质量：空泛、无量化、逻辑混乱、动词弱
4. 岗位匹配：内容组织是否突出与目标岗位最相关的事实

每个问题给出 severity（high/medium/low）、location（具体到字段或条目）、problem、suggestion。
high 必须同时给出 source_quote（原材料中连续的逐字摘录）与 draft_quote（草稿中被质疑的连续逐字摘录），说明草稿相对原材料改变了什么事实。不得拼接或改写引文。相同事实仅换了措辞、原始材料本身的疑点以及没有可核对引文的意见均使用 medium/low。
high 用于草稿相对事实来源新增、篡改或自相矛盾的事实。
原始材料自身的时间线疑点标 medium 并请用户核对。教育与工作时间重叠可能来自在校工作、兼职等，不能仅凭重叠认定虚构，也不能为了消除重叠而改写原始日期；草稿擅自修改原文日期才属于 high。
仅缺少 JD 关键词或不具备某项技能，最多标 medium，不能作为事实错误；不要求所有应聘者满足全部 JD。
target_gaps 是未导出的准备清单，不是候选人已具备的技能，不参与正文 ATS 覆盖。
overall 用一到两句总评。不要提出需要"添加不存在的经历或技能"才能满足的建议；学习计划应放在准备建议中，不能写成已有技能。"""

REFINE_SYSTEM = """你是简历修订者。根据评审意见修订简历草稿。规则同起草：
绝不虚构；事实性违规必须删除；ATS 缺失关键词只在候选人确有该技能时加入，否则保留为待确认。
skills优先使用原材料中的技能措辞。target_gaps只能列原材料未体现的岗位要求；评审发现某项差距是误判时，允许删除该项，不能把已有能力同时列为缺失。不要为了消除关键词缺失而添加新经历或技能。"""


async def extract_jd_keywords(state: ResumeState) -> list[str]:
    jd = (state.get("jd_text") or "").strip()
    if not jd:
        return []
    llm = get_llm("judge", temperature=0.1)
    result = await call_structured(
        llm,
        JdKeywords,
        [
            {"role": "system", "content": JD_KEYWORDS_SYSTEM},
            {"role": "user", "content": jd[:4000]},
        ],
    )
    return result.keywords[:20]


async def draft_node(state: ResumeState) -> dict:
    _emit({"stage": "drafting", "label": "简历起草中（事实边界内重写）…"})
    raw = ResumeRaw.model_validate(state.get("raw_resume") or {})
    memories: list[dict] = []
    try:
        memories = await memory_manager.arecall(
            state.get("user_id", "default"),
            f"{state.get('target_role', '')} 面试弱点 技能短板",
            limit=4,
        )
    except Exception:  # noqa: BLE001
        memories = []

    if not state.get("jd_keywords"):
        try:
            keywords = await extract_jd_keywords(state)
        except Exception:  # noqa: BLE001
            keywords = []
    else:
        keywords = state["jd_keywords"]

    llm = get_llm("draft", temperature=0.4)
    user = (
        f"【目标岗位】{state.get('target_role', '')}\n"
        f"【岗位 JD】\n{(state.get('jd_text') or '（未提供 JD，按目标岗位常识优化）')[:6000]}\n\n"
        f"【JD 关键词】{', '.join(keywords) or '（无）'}\n\n"
        f"【学生档案】{candidate_json(state.get('profile') or {})}\n\n"
        f"【原始简历及用户确认的补充素材（事实来源）】\n{candidate_json(raw.model_dump())[:16000]}"
    )
    draft = await call_structured(
        llm,
        ResumeDraft,
        [
            {
                "role": "system",
                "content": DRAFT_SYSTEM.format(
                    memories="；".join(m["memory"] for m in memories) or "（无）"
                )
                + output_language(state),
            },
            {"role": "user", "content": user},
        ],
    )
    draft_dict = draft.model_dump()
    for key in ("name", "phone", "email"):
        draft_dict[key] = getattr(raw, key)
    # Exact wording checks cannot distinguish an unsupported claim from a synonym.
    # Remove unverified skill labels, but do not declare the candidate lacks them.
    violations = verify_factuality(draft, raw, state.get("profile") or {})
    if violations:
        bad = {v["value"] for v in violations if v["type"] == "skill"}
        draft_dict["skills"] = [s for s in draft_dict["skills"] if s not in bad]
    return {
        "draft": draft_dict,
        "jd_keywords": keywords,
        "iteration": 1,
        "history": [{"action": "draft", "iteration": 1}],
    }


async def review_node(state: ResumeState) -> dict:
    draft = ResumeDraft.model_validate(state.get("draft") or {})
    raw = ResumeRaw.model_validate(state.get("raw_resume") or {})

    company_context = state.get("company_context", "")
    if state.get("company") and not company_context:
        _emit(
            {
                "stage": "searching_company",
                "company": state["company"],
                "label": f"正在调研「{state['company']}」的岗位要求…",
            }
        )
        try:
            company_context = await web_search_text(
                f"{state['company']} {state.get('target_role', '')} 岗位要求 技术栈",
                count=4,
            )
        except Exception as e:  # noqa: BLE001
            company_context = f"（调研失败：{e}）"

    _emit({"stage": "reviewing", "label": "独立评审中（ATS 覆盖 + 防虚构检查）…"})
    ats = ats_keyword_check(resume_body_text(draft), state.get("jd_keywords") or [])
    violations = verify_factuality(
        draft, raw, state.get("profile") or {}
    ) + verify_numbers(draft, raw, state.get("profile") or {})

    llm = get_llm("review", temperature=0.3)
    user = (
        f"【目标岗位】{state.get('target_role', '')}\n"
        f"【公司调研】{company_context or '（无）'}\n"
        f"【ATS 关键词缺失】{json.dumps(ats['missing'], ensure_ascii=False)}\n"
        f"【确定性防虚构检查违规】{json.dumps(violations, ensure_ascii=False)}\n\n"
        f"【简历草稿】\n{candidate_json(draft.model_dump())[:14000]}\n\n"
        f"【原始简历】\n{candidate_json(raw.model_dump())[:14000]}"
    )
    review = await call_structured(
        llm,
        ReviewReport,
        [
            {"role": "system", "content": REVIEW_SYSTEM + output_language(state)},
            {"role": "user", "content": user},
        ],
    )
    review_dict = ground_review(review.model_dump(), raw, draft)
    review_dict["ats_matched"] = ats["matched"]
    review_dict["ats_missing"] = ats["missing"]
    review_dict["factuality_violations"] = violations
    iteration = int(state.get("iteration", 1))
    _emit(
        {
            "stage": "reviewed",
            "issues": len(review.issues),
            "missing": len(ats["missing"]),
            "label": f"评审完成：{len(review.issues)} 条意见，ATS 缺失 {len(ats['missing'])} 项",
        }
    )
    return {
        "review": review_dict,
        "factuality_violations": violations,
        "ats_result": ats,
        "company_context": company_context,
        "history": [
            {"action": "review", "iteration": iteration, "issues": len(review.issues)}
        ],
    }


async def refine_node(state: ResumeState) -> dict:
    iteration = int(state.get("iteration", 1)) + 1
    _emit(
        {
            "stage": "refining",
            "iteration": iteration,
            "label": f"第 {iteration} 轮修订中…",
        }
    )
    llm = get_llm("draft", temperature=0.3)
    user = (
        f"【评审意见】\n{json.dumps(state.get('review') or {}, ensure_ascii=False)[:6000]}\n\n"
        f"【当前草稿】\n{candidate_json(state.get('draft') or {})[:14000]}\n\n"
        f"【原始简历（事实来源）】\n{candidate_json(state.get('raw_resume') or {})[:14000]}"
    )
    new_draft = await call_structured(
        llm,
        ResumeDraft,
        [
            {"role": "system", "content": REFINE_SYSTEM + output_language(state)},
            {"role": "user", "content": user},
        ],
    )
    draft_dict = new_draft.model_dump()
    raw = ResumeRaw.model_validate(state.get("raw_resume") or {})
    for key in ("name", "phone", "email"):
        draft_dict[key] = getattr(raw, key)
    violations = verify_factuality(new_draft, raw, state.get("profile") or {})
    if violations:
        bad = {v["value"] for v in violations if v["type"] == "skill"}
        draft_dict["skills"] = [s for s in draft_dict["skills"] if s not in bad]
    # Gaps are derived advice and must be correctable after independent review.
    # Unsupported skills remain blocked by the same source checks on every revision.
    draft_dict["target_gaps"] = list(
        dict.fromkeys(
            gap for gap in draft_dict["target_gaps"] if gap not in draft_dict["skills"]
        )
    )
    return {
        "draft": draft_dict,
        "iteration": iteration,
        "history": [{"action": "refine", "iteration": iteration}],
    }


async def finalize_node(state: ResumeState) -> dict:
    _emit({"stage": "finalizing", "label": "定稿中…"})
    return {
        "history": [{"action": "finalize", "iteration": int(state.get("iteration", 1))}]
    }


def after_review(state: ResumeState) -> str:
    if int(state.get("iteration", 1)) >= int(state.get("max_iterations", 2)):
        return "finalize"
    review = state.get("review") or {}
    has_high = any(i.get("severity") == "high" for i in review.get("issues", []))
    if (
        has_high
        or state.get("factuality_violations")
        or (state.get("ats_result") or {}).get("missing")
    ):
        return "refine"
    return "finalize"


def build_resume_graph():
    b = StateGraph(ResumeState)
    b.add_node("draft", draft_node)
    b.add_node("review", review_node)
    b.add_node("refine", refine_node)
    b.add_node("finalize", finalize_node)
    b.add_edge(START, "draft")
    b.add_edge("draft", "review")
    b.add_conditional_edges(
        "review", after_review, {"refine": "refine", "finalize": "finalize"}
    )
    b.add_edge("refine", "review")
    b.add_edge("finalize", END)
    return b.compile()


_resume_graph = None


def get_resume_graph():
    global _resume_graph
    if _resume_graph is None:
        _resume_graph = build_resume_graph()
    return _resume_graph
