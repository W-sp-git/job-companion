"""确定性守卫：防虚构检查（技能/单位/项目 + 量化数字）+ ATS 关键词覆盖。纯代码逻辑，零 LLM 成本。"""

from __future__ import annotations

import re

from app.agents.schemas import ResumeDraft, ResumeRaw

_NUM_RE = re.compile(r"\d+(?:\.\d+)?")


def _normalize(text: str) -> str:
    return re.sub(r"[\s\-_/、，,。.：:（）()]+", "", text).lower()


def _evidence_parts(raw: ResumeRaw, profile: dict) -> list[str]:
    """把原始简历与档案拆成"证据库"文本片段。"""
    parts: list[str] = [raw.name, raw.phone, raw.email, raw.target_role, *raw.skills, *raw.awards, *raw.other]
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
            violations.append({"type": "skill", "value": skill, "reason": "原始简历与档案中无依据"})

    for it in draft.internships:
        key = _normalize(it.org or "")
        if key and key not in corpus:
            violations.append({"type": "internship", "value": it.org, "reason": "原始简历中无此实习单位"})

    for p in draft.projects:
        key = _normalize(p.name or "")
        if key and key not in corpus:
            violations.append({"type": "project", "value": p.name, "reason": "原始简历中无此项目"})

    return violations


def verify_numbers(draft: ResumeDraft, raw: ResumeRaw, profile: dict) -> list[dict]:
    """量化数据必须来自原文：草稿正文里的每个数字都要能在证据库中找到。"""
    raw_nums = set(_NUM_RE.findall(" ".join(_evidence_parts(raw, profile))))
    texts: list[str] = [draft.summary]
    for ed in draft.education:
        texts += ed.highlights
    for it in draft.internships:
        texts += it.bullets
    for p in draft.projects:
        texts += p.bullets

    violations: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for text in texts:
        for num in _NUM_RE.findall(text or ""):
            key = (num, (text or "")[:40])
            if num not in raw_nums and key not in seen:
                seen.add(key)
                violations.append(
                    {
                        "type": "number",
                        "value": num,
                        "reason": f"量化数据在原始简历中无依据（上下文：{(text or '')[:50]}）",
                    }
                )
    return violations


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
