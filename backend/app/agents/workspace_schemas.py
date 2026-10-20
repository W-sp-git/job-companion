"""Workspace inputs and grounded model outputs. No model-generated application status."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

JobStatus = Literal[
    "saved",
    "preparing",
    "applied",
    "assessment",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
]


class JobBody(BaseModel):
    company: str = Field(min_length=1, max_length=160)
    target_role: str = Field(min_length=1, max_length=160)
    city: str = Field("", max_length=100)
    batch: str = Field("", max_length=100)
    jd_text: str = Field("", max_length=20000)
    source_url: str = Field("", max_length=2000)
    deadline: str = ""
    status: JobStatus = "saved"
    next_action: str = Field("", max_length=500)
    action_date: str = ""
    notes: str = Field("", max_length=20000)
    resume_version_id: int | None = Field(None, gt=0)
    intel_report_id: int | None = Field(None, gt=0)

    @field_validator("company", "target_role")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("公司与岗位不能为空")
        return value.strip()

    @field_validator("deadline", "action_date")
    @classmethod
    def date_or_blank(cls, value: str) -> str:
        if value:
            return date.fromisoformat(value).isoformat()
        return value

    @field_validator("source_url")
    @classmethod
    def public_url(cls, value: str) -> str:
        if value and not value.startswith(("https://", "http://")):
            raise ValueError("岗位链接必须以 http:// 或 https:// 开头")
        return value


class FactBody(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    kind: Literal["project", "internship", "education", "activity"] = "project"
    organization: str = Field("", max_length=200)
    role: str = Field("", max_length=160)
    situation: str = Field("", max_length=5000)
    action: str = Field("", max_length=5000)
    result: str = Field("", max_length=5000)
    skills: list[str] = Field(default_factory=list, max_length=40)
    source: str = Field("用户补充", max_length=500)
    confirmed: bool = False

    @field_validator("title")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("素材标题不能为空")
        return value.strip()


class RequirementMatch(BaseModel):
    requirement: str
    category: Literal["skill", "eligibility", "responsibility", "preference"] = "skill"
    status: Literal["supported", "gap", "unknown"] = "unknown"
    evidence_id: str = ""
    evidence_quote: str = ""
    evidence_quotes: list[str] = Field(default_factory=list, max_length=20)
    explanation: str = ""
    next_action: str = ""


class JobAnalysis(BaseModel):
    summary: str = ""
    requirements: list[RequirementMatch] = Field(default_factory=list, max_length=20)
    preparation: list[str] = Field(default_factory=list, max_length=5)
    questions_to_ask: list[str] = Field(default_factory=list, max_length=5)


class PracticeBody(BaseModel):
    skill: str = Field(min_length=1, max_length=200)
    question: str = Field("", max_length=5000)
    job_id: int | None = Field(None, gt=0)
    session_id: str = Field("", max_length=64)
    source_text: str = Field("", max_length=10000)
    due_date: str = ""

    @field_validator("due_date")
    @classmethod
    def valid_date(cls, value: str) -> str:
        if value:
            return date.fromisoformat(value).isoformat()
        return value


class PracticePlan(BaseModel):
    question: str = Field(min_length=1, max_length=5000)
    criteria: list[str] = Field(min_length=3, max_length=5)


class CriterionResult(BaseModel):
    criterion_index: int = Field(ge=0)
    score: int = Field(ge=0, le=2)
    evidence_quote: str = ""
    feedback: str


class PracticeEvaluation(BaseModel):
    criteria: list[CriterionResult]
    next_step: str
    reference_outline: str
