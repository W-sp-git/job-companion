"""Build factual candidate snapshots; strip contact details before language-model calls."""

import json
import re

from app.agents.schemas import ResumeRaw
from app.tools import workspace_store


def redact(value, _root=True):
    if isinstance(value, dict):
        hide_name = _root or any(
            key in value for key in ("phone", "email", "education", "school")
        )
        excluded = {"phone", "email", "file_path", "docx_path"} | (
            {"name"} if hide_name else set()
        )
        return {
            k: redact(v, False) for k, v in value.items() if k.lower() not in excluded
        }
    if isinstance(value, list):
        return [redact(item, False) for item in value]
    if isinstance(value, str):
        value = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[邮箱已隐藏]", value)
        return re.sub(
            r"(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)", "[手机号已隐藏]", value
        )
    return value


def candidate_json(value) -> str:
    return json.dumps(redact(value), ensure_ascii=False)


def enriched_resume(raw: dict) -> dict:
    """User-confirmed additions become a snapshot, never silently mutate the uploaded source."""
    result = ResumeRaw.model_validate(raw).model_dump()
    for fact in workspace_store.confirmed_facts():
        bullets = [fact[key] for key in ("situation", "action", "result") if fact[key]]
        if fact["kind"] == "project":
            result["projects"].append(
                {"name": fact["title"], "role": fact["role"], "bullets": bullets}
            )
        elif fact["kind"] == "internship":
            result["internships"].append(
                {
                    "org": fact["organization"] or fact["title"],
                    "role": fact["role"],
                    "start": "",
                    "end": "",
                    "bullets": bullets,
                }
            )
        else:
            result["other"].append(workspace_store.fact_text(fact))
        result["skills"] = list(dict.fromkeys([*result["skills"], *fact["skills"]]))
    return result
