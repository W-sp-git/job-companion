"""SSE 帧构造与 LangGraph 多版本流事件适配。"""

from __future__ import annotations

import json
from typing import Any


def sse_frame(event: str, data: dict) -> str:
    """构造单条 SSE 帧。json.dumps 的换行会被转义，保证 data 单行。"""
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def iter_stream_events(chunk: Any) -> tuple[str, Any]:
    """把 astream(stream_mode=[...]) 的 chunk 归一化为 (mode, payload)。

    兼容两种形态：
    - 元组：(mode, payload)
    - 字典：{"type": mode, "data": payload}（新版 LangGraph）
    """
    if isinstance(chunk, dict) and "type" in chunk and "data" in chunk:
        return chunk["type"], chunk["data"]
    if isinstance(chunk, (tuple, list)) and len(chunk) == 2:
        return chunk[0], chunk[1]
    raise ValueError(f"无法识别的流 chunk：{chunk!r}")
