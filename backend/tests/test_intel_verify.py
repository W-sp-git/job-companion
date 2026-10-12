"""防虚构校验器测试：单位折算对齐、幻觉数字降级、风险无来源剔除、编号容错。"""

from __future__ import annotations

from app.agents.schemas import IntelReport
from app.tools.intel_search import EvidenceItem
from app.tools.intel_verify import extract_canonical_numbers, verify_intel_report


def _ev(sid: int, snippet: str, title: str = "t", lane: str = "salary") -> EvidenceItem:
    return EvidenceItem(sid=sid, lane=lane, title=title, url=f"https://x/{sid}", snippet=snippet)


def test_extract_canonical_numbers_units():
    assert extract_canonical_numbers("20-35K·14薪") == {"20000", "35000", "14"}
    assert extract_canonical_numbers("月薪2万") == {"20000"}
    assert extract_canonical_numbers("２０ｋ") == {"20000"}  # 全角
    assert extract_canonical_numbers("") == set()


def test_unit_alignment_verified():
    """2万 == 20k == 20000，跨写法对齐后应判 verified。"""
    evidence = [_ev(1, "薪资范围 20k-35k，14薪，另有月薪2万的岗位")]
    report = IntelReport(
        company="某公司",
        summary="薪资具备竞争力。",
        salary=[
            {"role_hint": "后端", "range_text": "20-35K·14薪", "source_ids": [1]},
            {"role_hint": "后端", "range_text": "月薪 2 万", "source_ids": [1]},
        ],
    )
    report_out, verification = verify_intel_report(report, evidence)
    assert all(s["status"] == "verified" for s in report_out["salary"])
    assert verification["coverage"] == 1.0
    assert verification["total_claims"] == 2


def test_hallucinated_number_unverified():
    evidence = [_ev(1, "薪资范围 20k-35k")]
    report = IntelReport(
        summary="薪资优厚。",
        salary=[{"role_hint": "后端", "range_text": "40k 起", "source_ids": [1]}],
    )
    report_out, verification = verify_intel_report(report, evidence)
    assert report_out["salary"][0]["status"] == "unverified"
    assert verification["verified"] == 0
    assert verification["unverified"] == 1


def test_out_of_range_sid_sanitized():
    evidence = [_ev(1, "any")]
    report = IntelReport(
        summary="简述。",
        basics=[{"text": "业务覆盖广", "source_ids": [99]}],
    )
    report_out, verification = verify_intel_report(report, evidence)
    row = report_out["basics"][0]
    assert row["status"] == "unverified"
    assert row["sources"] == []
    assert verification["unverified"] == 1


def test_risk_without_source_dropped():
    evidence = [_ev(1, "某公司经营正常", lane="risk")]
    report = IntelReport(
        summary="简述。",
        risks=[
            {"category": "裁员缩编", "text": "某公司传出大规模裁员", "source_ids": []},
            {"category": "经营负面", "text": "业务调整", "source_ids": [1]},
        ],
    )
    report_out, verification = verify_intel_report(report, evidence)
    assert [r["text"] for r in report_out["risks"]] == ["业务调整"]
    assert verification["dropped_risk"] == 1
    assert any("剔除 1 条" in n for n in verification["notes"])


def test_risk_with_hallucinated_number_dropped():
    evidence = [_ev(1, "员工 5000 人，正常运营", lane="risk")]
    report = IntelReport(
        summary="简述。",
        risks=[{"category": "经营负面", "text": "裁员比例达 30%", "source_ids": [1]}],
    )
    report_out, verification = verify_intel_report(report, evidence)
    assert report_out["risks"] == []
    assert verification["dropped_risk"] == 1


def test_sid_string_coercion():
    report = IntelReport.model_validate(
        {
            "salary": [
                {"range_text": "x", "source_ids": "S3"},
                {"range_text": "y", "source_ids": "[1, S2]"},
                {"range_text": "z", "source_ids": 4},
            ]
        }
    )
    assert [s.source_ids for s in report.salary] == [[3], [1, 2], [4]]


def test_summary_sentence_level_drop():
    evidence = [_ev(1, "公司业务覆盖全国 20 个城市")]
    report = IntelReport(
        summary="公司业务稳定。月薪高达 99k。团队规模大。",
        salary=[{"range_text": "20k", "source_ids": [1]}],
    )
    report_out, verification = verify_intel_report(report, evidence)
    assert "99k" not in report_out["summary"]
    assert "公司业务稳定" in report_out["summary"]
    assert "团队规模大" in report_out["summary"]
    assert any("核要中 1 个" in n for n in verification["notes"])


def test_single_digit_and_year_exempt():
    evidence = [_ev(1, "2026 年校园招聘启动，共 3 个批次")]
    report = IntelReport(
        summary="简述。",
        hiring=[{"position": "后端", "trend": "2026 年启动招聘，共 3 个批次", "source_ids": [1]}],
    )
    report_out, _ = verify_intel_report(report, evidence)
    assert report_out["hiring"][0]["status"] == "verified"


def test_all_green_coverage_and_sources_attached():
    evidence = [
        _ev(1, "总部位于北京，员工超 5000 人"),
        _ev(2, "面试共 3 轮，含手撕代码"),
    ]
    report = IntelReport(
        company="某公司",
        summary="整体稳健。",
        basics=[{"text": "员工超 5000 人", "source_ids": [1]}],
        process=[{"stage": "技术面", "detail": "含手撕代码", "source_ids": [2]}],
    )
    report_out, verification = verify_intel_report(report, evidence)
    assert verification["coverage"] == 1.0
    assert report_out["basics"][0]["sources"][0]["url"] == "https://x/1"
    assert any("来源较少" in n for n in verification["notes"])  # 2 < 8
