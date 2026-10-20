"""确定性守卫：防虚构检查（技能/单位/项目 + 量化数字）+ ATS 关键词覆盖。纯代码逻辑，零 LLM 成本。"""

from __future__ import annotations

import json
import re

from app.agents.schemas import ResumeDraft, ResumeRaw


def ground_review(report: dict, raw: ResumeRaw, draft: ResumeDraft) -> dict:
    """A model's high-risk label needs actual source/draft differences.

    A faithful copy of uncertain source material is a question for the user,
    not evidence that generation fabricated it. Deterministic checks remain
    independent and still block unsupported skills and quantities.
    """
    source_text = _normalize(json.dumps(raw.model_dump(), ensure_ascii=False))
    draft_text = _normalize(json.dumps(draft.model_dump(), ensure_ascii=False))
    issues = []
    downgraded = 0
    for original in report.get("issues", []):
        item = dict(original)
        if item.get("severity") == "high":
            source_quote = _normalize(item.get("source_quote", ""))
            draft_quote = _normalize(item.get("draft_quote", ""))
            grounded = (
                source_quote
                and draft_quote
                and source_quote in source_text
                and draft_quote in draft_text
                and draft_quote not in source_text
            )
            if not grounded:
                item["severity"] = "medium"
                downgraded += 1
        issues.append(item)
    notes = list(report.get("factuality_notes") or [])
    if downgraded:
        notes.append(
            f"{downgraded} 条意见缺少可核对的原文差异依据，已保留为待确认建议；请核对原始记录，不要为消除提示而改写真实经历。"
        )
    return {**report, "issues": issues, "factuality_notes": notes}


_QUANTITY_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(%|％|ms|毫秒|秒|分钟|小时|天|周|个月|月|年|万|千|个|人|次|条|倍|[kK]|[qQ][pP][sS])?"
)
_METRICS = {
    "latency": ("响应", "延迟", "耗时", "时延", "latency"),
    "throughput": ("吞吐", "qps", "并发", "请求量"),
    "accuracy": ("准确", "正确", "accuracy", "精度"),
    "cost": ("成本", "费用", "开销"),
    "volume": ("接口", "用户", "记录", "数据量"),
}


def _normalize(text: str) -> str:
    return re.sub(r"[\s\-_/、，,。.：:（）()]+", "", text).lower()


def _evidence_parts(raw: ResumeRaw, profile: dict) -> list[str]:
    """把原始简历与档案拆成"证据库"文本片段。"""
    parts: list[str] = [
        raw.name,
        raw.phone,
        raw.email,
        raw.target_role,
        *raw.skills,
        *raw.awards,
        *raw.other,
    ]
    for ed in raw.education:
        parts += [ed.school, ed.major, ed.degree, *ed.highlights]
    for it in raw.internships:
        parts += [it.org, it.role, *it.bullets]
    for p in raw.projects:
        parts += [p.name, p.role, *p.bullets]
    parts += [str(v) for v in profile.values() if v]
    return [p for p in parts if p]


def _corpus(raw: ResumeRaw, profile: dict) -> str:
    return _normalize(" ".join(_evidence_parts(raw, profile)))


def verify_factuality(draft: ResumeDraft, raw: ResumeRaw, profile: dict) -> list[dict]:
    """检查草稿中的技能/实习/项目是否都能在原始简历与档案中找到依据。"""
    corpus = _corpus(raw, profile)
    violations: list[dict] = []

    for skill in draft.skills:
        key = _normalize(skill)
        if key and key not in corpus:
            violations.append(
                {"type": "skill", "value": skill, "reason": "原始简历与档案中无依据"}
            )

    for it in draft.internships:
        key = _normalize(it.org or "")
        if key and key not in corpus:
            violations.append(
                {
                    "type": "internship",
                    "value": it.org,
                    "reason": "原始简历中无此实习单位",
                }
            )

    for p in draft.projects:
        key = _normalize(p.name or "")
        if key and key not in corpus:
            violations.append(
                {"type": "project", "value": p.name, "reason": "原始简历中无此项目"}
            )

    return violations


def verify_numbers(draft: ResumeDraft, raw: ResumeRaw, profile: dict) -> list[dict]:
    """Check quantities within the same experience, preserving units and metric family.

    This is a conservative rule check, not independent verification of a user's claims.
    Contact details and unrelated projects cannot authorize a generated statistic.
    """
    units = {"％": "%", "毫秒": "ms", "K": "k", "QPS": "qps"}

    def quantities(text: str) -> set[tuple[str, str]]:
        return {
            (number, units.get(unit, unit).lower())
            for number, unit in _QUANTITY_RE.findall(text)
        }

    def metrics(text: str) -> set[str]:
        return {
            name
            for name, words in _METRICS.items()
            if any(word in text.lower() for word in words)
        }

    groups: list[tuple[str, list[str]]] = [
        (
            draft.summary,
            [
                *raw.other,
                *raw.awards,
                *raw.skills,
                *(
                    f"{item.school} {item.major} {item.degree} {item.start} {item.end}"
                    for item in raw.education
                ),
                *(b for item in raw.projects for b in item.bullets),
                *(b for item in raw.internships for b in item.bullets),
                *(b for item in raw.education for b in item.highlights),
            ],
        )
    ]
    for item in draft.education:
        evidence = [
            b
            for source in raw.education
            if _normalize(source.school) == _normalize(item.school)
            for b in source.highlights
        ]
        groups.extend((text, evidence) for text in item.highlights)
    for item in draft.internships:
        evidence = [
            b
            for source in raw.internships
            if _normalize(source.org) == _normalize(item.org)
            for b in source.bullets
        ]
        groups.extend((text, evidence) for text in item.bullets)
    for item in draft.projects:
        evidence = [
            b
            for source in raw.projects
            if _normalize(source.name) == _normalize(item.name)
            for b in source.bullets
        ]
        groups.extend((text, evidence) for text in item.bullets)
    groups.extend((text, raw.other) for text in draft.other)
    violations: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for text, evidence in groups:
        for number, unit in quantities(text):
            # Keep the check local to a clause to avoid borrowing a different metric's number.
            source_ok = any(
                (number, unit) in quantities(clause)
                and (not metrics(text) or bool(metrics(text) & metrics(clause)))
                for source in evidence
                for clause in re.split(r"[，,；;。\n]", source)
            )
            key = (number + unit, text[:40])
            if not source_ok and key not in seen:
                seen.add(key)
                violations.append(
                    {
                        "type": "number",
                        "value": number,
                        "reason": f"同一经历中未找到数字、单位及指标的对应依据：{text[:100]}",
                    }
                )
    return violations


def resume_body_text(draft: ResumeDraft) -> str:
    """Only exported resume content participates in keyword coverage; gaps never do."""
    return "\n".join(
        [
            draft.summary,
            *draft.skills,
            *draft.awards,
            *draft.other,
            *(
                " ".join([e.school, e.major, e.degree, *e.highlights])
                for e in draft.education
            ),
            *(" ".join([e.org, e.role, *e.bullets]) for e in draft.internships),
            *(" ".join([p.name, p.role, *p.bullets]) for p in draft.projects),
        ]
    )


def ats_keyword_check(draft_text: str, jd_keywords: list[str]) -> dict:
    """检查 JD 关键词在草稿文本中的覆盖情况。"""
    norm = _normalize(draft_text)
    matched: list[str] = []
    missing: list[str] = []
    for kw in jd_keywords:
        if _normalize(kw) in norm:
            matched.append(kw)
        else:
            missing.append(kw)
    return {"matched": matched, "missing": missing}
