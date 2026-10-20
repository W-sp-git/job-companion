"""统一结构化输出：with_structured_output → json_mode → json_repair+Pydantic 三层降级。

所有需要 LLM 返回 JSON 的场景都走 call_structured，禁止在业务代码里裸解析。
"""

from __future__ import annotations

import json
import re
from typing import TypeVar

from json_repair import repair_json
from langchain_core.messages import HumanMessage, SystemMessage
from openai import (
    APIConnectionError,
    AuthenticationError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
)
from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)
_SERVICE_ERRORS = (
    APIConnectionError,
    AuthenticationError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
)

_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(.+?)\s*```", re.DOTALL)


def _extract_json_text(content: str) -> str:
    """从模型输出中提取 JSON 文本：优先代码块，其次首尾大括号截取。"""
    m = _JSON_BLOCK_RE.search(content)
    if m:
        return m.group(1)
    start_obj, start_arr = content.find("{"), content.find("[")
    starts = [i for i in (start_obj, start_arr) if i >= 0]
    if not starts:
        return content
    start = min(starts)
    end = max(content.rfind("}"), content.rfind("]"))
    if end > start:
        return content[start : end + 1]
    return content


def parse_json_to_schema(content: str, schema: type[T]) -> T:
    """把模型输出文本解析为 schema 实例：json.loads → json_repair 兜底。"""
    text = _extract_json_text(content)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = repair_json(text, return_objects=True)
    if isinstance(data, schema):
        return data
    return schema.model_validate(data)


def _normalize_messages(messages: list | str) -> list:
    if isinstance(messages, str):
        return [HumanMessage(content=messages)]
    return list(messages)


async def call_structured(
    llm,
    schema: type[T],
    messages: list | str,
    *,
    retries: int = 2,
) -> T:
    """三层降级的结构化调用。返回 schema 实例，失败抛 RuntimeError。"""
    msgs = _normalize_messages(messages)

    # 第一层：原生结构化输出（function calling / json_schema）
    try:
        structured = llm.with_structured_output(schema)
        result = await structured.ainvoke(msgs)
        if isinstance(result, schema):
            return result
        if isinstance(result, dict):
            return schema.model_validate(result)
    except _SERVICE_ERRORS as exc:
        raise RuntimeError(
            f"模型服务暂不可用（{type(exc).__name__}），请稍后重试或检查模型连接与配置"
        ) from exc
    except Exception:  # noqa: BLE001 - 降级到 json_mode
        pass

    # 第二层 + 第三层：json_mode 输出 → 提取/修复 → 校验，失败反馈重试
    json_llm = llm.bind(response_format={"type": "json_object"})
    # json_object constrains syntax only. Providers without native schema support
    # still need the complete nested contract, not just top-level field names.
    json_messages = [
        SystemMessage(
            content="只输出符合以下 JSON Schema 的一个 JSON 对象。严格使用字段名称、枚举值与嵌套结构，不得用近义字段替换。Schema："
            + json.dumps(schema.model_json_schema(), ensure_ascii=False)
        ),
        *msgs,
    ]
    last_err: Exception | None = None
    convo = json_messages
    for _ in range(max(retries, 1)):
        try:
            resp = await json_llm.ainvoke(convo)
            return parse_json_to_schema(str(resp.content), schema)
        except _SERVICE_ERRORS as exc:
            raise RuntimeError(
                f"模型服务暂不可用（{type(exc).__name__}），请稍后重试或检查模型连接与配置"
            ) from exc
        except ValidationError as e:
            last_err = e
            convo = json_messages + [
                HumanMessage(
                    content=f"上一次输出未通过校验（{e.error_count()} 处错误，首条："
                    f"{e.errors()[0].get('msg', '')}）。请只输出一个符合 Schema 的 JSON 对象，"
                    f"不含任何解释文字。Schema 字段：{list(schema.model_fields.keys())}"
                )
            ]
        except Exception as e:  # noqa: BLE001
            last_err = e
            convo = json_messages + [
                HumanMessage(
                    content="上一次输出不是合法 JSON。请只输出一个 JSON 对象，不含任何多余文字。"
                )
            ]
    raise RuntimeError(f"结构化输出失败（{schema.__name__}）：{last_err}")
