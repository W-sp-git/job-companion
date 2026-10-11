"""LLM 输出与领域数据的 Pydantic 模型。

所有列表字段都带"单值自动包装为列表"的容错：LLM 常把 ["a"] 输出为 "a"。
维度类字段额外容错字典形态（{"内容相关性": 7.5} → [{name, score}]）。
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, BeforeValidator, Field


def _str_list(v: object) -> object:
    if v is None:
        return []
    if isinstance(v, str):
        return [v] if v.strip() else []
    return v


def _model_list(v: object) -> object:
    if v is None:
        return []
    if isinstance(v, dict):
        return [v]
    return v


def _dimension_list(v: object) -> object:
    if v is None:
        return []
    if isinstance(v, dict):
        out = []
        for k, val in v.items():
            try:
                score = float(val)  # type: ignore[arg-type]
            except (TypeError, ValueError):
                score = 0.0
            out.append({"name": str(k), "score": score})
        return out
    return v


StrList = Annotated[list[str], BeforeValidator(_str_list)]


# ---------- 简历解析 ----------

class EducationItem(BaseModel):
    school: str = ""
    major: str = ""
    degree: str = ""
    start: str = ""
    end: str = ""
    highlights: StrList = Field(default_factory=list)


class ExperienceItem(BaseModel):
    org: str = ""
    role: str = ""
    start: str = ""
    end: str = ""
    bullets: StrList = Field(default_factory=list)


class ProjectItem(BaseModel):
    name: str = ""
    role: str = ""
    bullets: StrList = Field(default_factory=list)


Educations = Annotated[list[EducationItem], BeforeValidator(_model_list)]
Internships = Annotated[list[ExperienceItem], BeforeValidator(_model_list)]
Projects = Annotated[list[ProjectItem], BeforeValidator(_model_list)]


class ResumeRaw(BaseModel):
    """简历解析结果——忠实原文，不加工、不补全。"""

    name: str = ""
    phone: str = ""
    email: str = ""
    target_role: str = ""
    education: Educations = Field(default_factory=list)
    skills: StrList = Field(default_factory=list)
    internships: Internships = Field(default_factory=list)
    projects: Projects = Field(default_factory=list)
    awards: StrList = Field(default_factory=list)
    other: StrList = Field(default_factory=list)


# ---------- 简历优化 ----------

class ResumeDraft(BaseModel):
    """优化后的简历。target_gaps：JD 要求但本人没有的技能（诚实标注差距，不得混入 skills）。"""

    name: str = ""
    phone: str = ""
    email: str = ""
    target_role: str = ""
    summary: str = ""
    education: Educations = Field(default_factory=list)
    skills: StrList = Field(default_factory=list)
    internships: Internships = Field(default_factory=list)
    projects: Projects = Field(default_factory=list)
    awards: StrList = Field(default_factory=list)
    target_gaps: StrList = Field(default_factory=list)


class ReviewIssue(BaseModel):
    severity: str = "medium"  # high | medium | low
    location: str = ""
    problem: str = ""
    suggestion: str = ""


ReviewIssues = Annotated[list[ReviewIssue], BeforeValidator(_model_list)]


class ReviewReport(BaseModel):
    overall: str = ""
    issues: ReviewIssues = Field(default_factory=list)
    factuality_notes: StrList = Field(default_factory=list)


class JdKeywords(BaseModel):
    keywords: StrList = Field(default_factory=list)


# ---------- 面试评分 ----------

class DimensionScore(BaseModel):
    name: str = ""
    score: float = 0.0


Dimensions = Annotated[list[DimensionScore], BeforeValidator(_dimension_list)]


class AnswerEvaluation(BaseModel):
    score: float = 0.0
    dimensions: Dimensions = Field(default_factory=list)
    comment: str = ""
    needs_follow_up: bool = False
    follow_up_hint: str = ""


class QaReview(BaseModel):
    round: int = 0
    question: str = ""
    answer_summary: str = ""
    score: float = 0.0
    better_answer: str = ""


QaReviews = Annotated[list[QaReview], BeforeValidator(_model_list)]


class InterviewReport(BaseModel):
    overall_score: float = 0.0
    dimension_scores: Dimensions = Field(default_factory=list)
    strengths: StrList = Field(default_factory=list)
    weaknesses: StrList = Field(default_factory=list)
    per_question: QaReviews = Field(default_factory=list)
    improvement_plan: StrList = Field(default_factory=list)
    recommended_practice: StrList = Field(default_factory=list)
