from app.agents.schemas import ExperienceItem, ProjectItem, ResumeDraft, ResumeRaw
from app.tools.factuality import ats_keyword_check, verify_factuality, verify_numbers


def _raw() -> ResumeRaw:
    return ResumeRaw(
        name="张明",
        skills=["Java", "MySQL"],
        internships=[
            ExperienceItem(
                org="某某科技有限公司",
                role="后端开发实习生",
                bullets=["接口平均响应时间从 800ms 降至 200ms"],
            )
        ],
        projects=[ProjectItem(name="校园二手交易平台")],
        awards=["蓝桥杯省级二等奖"],
    )


def test_factuality_flags_fabricated_skill():
    draft = ResumeDraft(name="张明", skills=["Java", "Rust"])
    violations = verify_factuality(draft, _raw(), {})
    assert any(v["type"] == "skill" and v["value"] == "Rust" for v in violations)
    assert not any(v["value"] == "Java" for v in violations)


def test_factuality_flags_fabricated_internship_and_project():
    draft = ResumeDraft(
        name="张明",
        internships=[ExperienceItem(org="某某不存在的公司")],
        projects=[ProjectItem(name="虚构项目")],
    )
    violations = verify_factuality(draft, _raw(), {})
    assert any(v["type"] == "internship" for v in violations)
    assert any(v["type"] == "project" for v in violations)


def test_factuality_accepts_grounded_draft():
    draft = ResumeDraft(
        name="张明",
        skills=["Java", "MySQL"],
        internships=[ExperienceItem(org="某某科技有限公司")],
        projects=[ProjectItem(name="校园二手交易平台")],
    )
    assert verify_factuality(draft, _raw(), {}) == []


def test_factuality_uses_profile_as_evidence():
    draft = ResumeDraft(name="张明", skills=["Python"])
    violations = verify_factuality(draft, _raw(), {"skills": "Python、Go"})
    assert not any(v["value"] == "Python" for v in violations)


def test_ats_keyword_check_case_and_space_insensitive():
    result = ats_keyword_check("熟悉 JAVA 开发与 my sql 使用", ["Java", "MySQL", "Kafka"])
    assert result["matched"] == ["Java", "MySQL"]
    assert result["missing"] == ["Kafka"]


def test_numbers_without_evidence_flagged():
    draft = ResumeDraft(
        name="张明",
        internships=[
            ExperienceItem(org="某某科技有限公司", bullets=["将响应时间优化至 10ms，吞吐提升 300%"])
        ],
    )
    violations = verify_numbers(draft, _raw(), {})
    flagged = {v["value"] for v in violations}
    assert "10" in flagged and "300" in flagged


def test_numbers_grounded_not_flagged():
    draft = ResumeDraft(
        name="张明",
        internships=[ExperienceItem(org="某某科技有限公司", bullets=["接口响应从 800ms 降至 200ms"])],
    )
    assert verify_numbers(draft, _raw(), {}) == []
