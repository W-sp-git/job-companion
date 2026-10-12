"""确定性防虚构校验：报告条目中的数字必须能在检索证据中找到依据。

思路参照 factuality.py（数字抽取 + 归一化包含），但证据库是搜索结果而非简历：
- 带单位数字折算为"元"字面（"2万" == "20000" == "20k"），支持全角
- 个位数豁免（序号等）；其余数字必须在全部证据文本中出现过
- 风险条目无有效来源或数字无依据 → 从正文剔除（负面信息 + 不实数字是合规红线）
- 其余条目证据不足 → 保留但标 unverified，由前端灰显
"""

from __future__ import annotations

import re

from app.agents.schemas import IntelReport
from app.tools.intel_search import EvidenceItem

_RANGE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*[-~—–至到]\s*(\d+(?:\.\d+)?)\s*(万|w|W|k|K|千)")
_SINGLE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(万|w|W|k|K|千|元|块)?")
_UNIT_MAP = {"万": 10_000, "w": 10_000, "W": 10_000, "k": 1_000, "K": 1_000, "千": 1_000, "元": 1, "块": 1}


def _to_halfwidth(text: str) -> str:
    out: list[str] = []
    for ch in text:
        code = ord(ch)
        if code == 0x3000:
            code = 0x20
        elif 0xFF01 <= code <= 0xFF5E:
            code -= 0xFEE0
        out.append(chr(code))
    return "".join(out)


def _canon(raw: str, unit: str | None) -> str:
    val = float(raw)
    if unit:
        val *= _UNIT_MAP[unit]
    return str(int(val)) if val == int(val) else f"{val:.6g}"


def extract_canonical_numbers(text: str) -> set[str]:
    """抽取标准化数字：带单位折算（2万→20000），无单位保留字面。

    「20-35K」这类范围写法共享单位：先整体匹配范围并消费掉，左侧数字继承右侧单位。
    """
    t = _to_halfwidth(text or "")
    nums: set[str] = set()

    def _consume_range(m: re.Match) -> str:
        unit = m.group(3)
        nums.add(_canon(m.group(1), unit))
        nums.add(_canon(m.group(2), unit))
        return " " * len(m.group(0))

    t = _RANGE_RE.sub(_consume_range, t)
    for m in _SINGLE_RE.finditer(t):
        try:
            nums.add(_canon(m.group(1), m.group(2)))
        except ValueError:
            continue
    return nums


def sanitize_source_ids(ids: list[int], valid: set[int]) -> list[int]:
    out: list[int] = []
    for i in ids:
        if isinstance(i, int) and i in valid and i not in out:
            out.append(i)
    return out


def verify_intel_report(report: IntelReport, evidence: list[EvidenceItem]) -> tuple[dict, dict]:
    by_sid = {ev.sid: ev for ev in evidence}
    valid_sids = set(by_sid)

    corpus_nums: set[str] = set()
    for ev in evidence:
        corpus_nums |= extract_canonical_numbers(f"{ev.title} {ev.snippet}")

    def bad_numbers(text: str) -> list[str]:
        return [n for n in extract_canonical_numbers(text) if len(n) > 1 and n not in corpus_nums]

    def src_list(sids: list[int]) -> list[dict]:
        return [
            {
                "sid": s,
                "lane": by_sid[s].lane,
                "title": by_sid[s].title,
                "url": by_sid[s].url,
                "date": by_sid[s].date,
            }
            for s in sids
        ]

    def check(text: str, sids: list[int]) -> tuple[str, list[dict]]:
        clean = sanitize_source_ids(sids, valid_sids)
        sources = src_list(clean)
        return ("verified" if clean and not bad_numbers(text) else "unverified"), sources

    total = verified = unverified = dropped_risk = 0
    notes: list[str] = []

    # 核要：含未佐证数字的句子整句剔除
    kept: list[str] = []
    dropped_sentences = 0
    for sent in re.split(r"(?<=[。！？!?])", report.summary or ""):
        sent = sent.strip()
        if not sent:
            continue
        if bad_numbers(sent):
            dropped_sentences += 1
            continue
        kept.append(sent)
    if dropped_sentences:
        notes.append(f"核要中 {dropped_sentences} 个含未佐证数字的句子已剔除")

    def claim_row(check_text: str, sids: list[int], **extra) -> dict:
        nonlocal total, verified, unverified
        status, sources = check(check_text, sids)
        total += 1
        if status == "verified":
            verified += 1
        else:
            unverified += 1
        return {"status": status, "sources": sources, **extra}

    basics = [
        claim_row(b.text.strip(), b.source_ids, text=b.text.strip())
        for b in report.basics
        if b.text.strip()
    ]
    hiring = [
        claim_row(
            f"{h.position} {h.trend}",
            h.source_ids,
            position=h.position.strip(),
            location=h.location.strip(),
            trend=h.trend.strip(),
        )
        for h in report.hiring
        if h.position.strip() or h.trend.strip()
    ]
    salary = [
        claim_row(
            f"{s.range_text} {s.notes}",
            s.source_ids,
            role_hint=s.role_hint.strip(),
            range_text=s.range_text.strip(),
            notes=s.notes.strip(),
        )
        for s in report.salary
        if s.range_text.strip()
    ]
    process = [
        claim_row(
            f"{p.stage} {p.detail}",
            p.source_ids,
            stage=p.stage.strip(),
            detail=p.detail.strip(),
        )
        for p in report.process
        if p.stage.strip()
    ]

    risks: list[dict] = []
    for r in report.risks:
        text = r.text.strip()
        if not text:
            continue
        clean = sanitize_source_ids(r.source_ids, valid_sids)
        if not clean or bad_numbers(text):
            dropped_risk += 1
            continue
        risks.append(
            {"category": r.category.strip() or "其他", "text": text, "sources": src_list(clean)}
        )
    if dropped_risk:
        notes.append(f"已剔除 {dropped_risk} 条无公开来源佐证的风险线索")
    if len(evidence) < 8:
        notes.append(f"公开来源较少（{len(evidence)} 条），结论置信度有限")

    report_out = {
        "company": report.company.strip(),
        "target_role": report.target_role.strip(),
        "summary": "".join(kept),
        "summary_sources": src_list(sanitize_source_ids(report.summary_source_ids, valid_sids)),
        "basics": basics,
        "hiring": hiring,
        "salary": salary,
        "process": process,
        "risks": risks,
    }
    verification = {
        "total_claims": total,
        "verified": verified,
        "unverified": unverified,
        "dropped_risk": dropped_risk,
        "coverage": round((verified / total) if total else 1.0, 3),
        "evidence_total": len(evidence),
        "notes": notes,
    }
    return report_out, verification
