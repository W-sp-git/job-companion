"""简历解析：PDF 文本层优先；不可靠（扫描件/乱码/无中文）时渲染走 Qwen-VL；图片直接 VL。

统一管线：任意输入 → 提取/转写为纯文本 → 文本 LLM 结构化为 ResumeRaw。
"""

from __future__ import annotations

import base64
import re
from pathlib import Path

import pymupdf
from langchain_core.messages import HumanMessage

from app.agents.llm import get_llm
from app.agents.schemas import ResumeRaw
from app.utils.structured import call_structured

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
TEXT_EXTS = {".txt", ".md"}
MAX_VISION_PAGES = 5

_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".bmp": "image/bmp"}

_VISION_PROMPT = """你是简历 OCR 助手。请把这张简历图片完整转写为 Markdown 文本：
- 保留所有文字内容，不要总结、不要遗漏、不要美化
- 保留分节结构（教育背景 / 实习经历 / 项目经历 / 技能 / 获奖等）
- 表格式排版按「字段：值」逐行转写
- 只输出转写内容，不要任何解释"""

_STRUCTURE_SYSTEM = """你是简历信息抽取器。把用户提供的简历文本抽取为结构化 JSON。
硬性要求：
- 忠实原文：原文没有的信息一律留空，绝不补全、推测或美化
- skills 逐项拆分列出原文明确写出的技能（如 "Java"、"Spring Boot"、"MySQL"）
- 务必尽力提取：姓名/电话/邮箱/求职意向；教育经历的学校、专业、学历、起止时间、GPA 等亮点
- 实习经历：单位名称（org）、职位（role）、起止时间（start/end）与原文要点（bullets）
- 项目经历：项目名称（name）、你的角色（role）与原文要点（bullets）
- bullets 保留原文要点措辞，可轻微通顺化，不得添加新事实
- 日期用原文格式（如 2025.07 - 2025.09）"""


def extract_pdf_text(pdf_path: str | Path) -> tuple[str, bool]:
    """返回 (全文文本, 文本层是否可靠)。"""
    doc = pymupdf.open(str(pdf_path))
    try:
        pages_text = [page.get_text("text") for page in doc]
    finally:
        doc.close()
    full = "\n".join(pages_text)
    stripped = full.strip()

    reliable = True
    if len(stripped) < 30 * max(len(pages_text), 1):
        reliable = False
    if "(cid:" in full or full.count("\ufffd") > 5:
        reliable = False
    # 有内容但一个中文都没有：大概率是字体编码异常，交给视觉模型
    if len(stripped) > 100 and not re.search(r"[\u4e00-\u9fff]", full):
        reliable = False
    return full, reliable


def render_pdf_pages(pdf_path: str | Path, dpi: int = 160) -> list[bytes]:
    """把 PDF 每页渲染为 PNG bytes（最多 MAX_VISION_PAGES 页）。"""
    doc = pymupdf.open(str(pdf_path))
    out: list[bytes] = []
    try:
        for page in list(doc)[:MAX_VISION_PAGES]:
            out.append(page.get_pixmap(dpi=dpi).tobytes("png"))
    finally:
        doc.close()
    return out


async def vl_transcribe_image(image_bytes: bytes, mime: str = "image/png") -> str:
    """Qwen-VL 把简历图片转写为 Markdown 文本（不做结构抽取）。"""
    llm = get_llm("ocr", temperature=0.1)
    b64 = base64.b64encode(image_bytes).decode()
    msg = HumanMessage(
        content=[
            {"type": "text", "text": _VISION_PROMPT},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
        ]
    )
    resp = await llm.ainvoke([msg])
    return str(resp.content)


async def structure_resume_text(text: str) -> ResumeRaw:
    """纯文本 → 结构化简历（deepseek-chat，忠实抽取）。"""
    llm = get_llm("judge", temperature=0.1)
    return await call_structured(
        llm,
        ResumeRaw,
        [
            {"role": "system", "content": _STRUCTURE_SYSTEM},
            {"role": "user", "content": text[:20000]},
        ],
    )


async def parse_resume(
    file_path: str | Path, *, force_vision: bool = False
) -> tuple[ResumeRaw, str]:
    """简历解析主入口。返回 (结构化简历, 使用的路线标签)。"""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"文件不存在：{path}")
    ext = path.suffix.lower()
    transcript = ""

    if ext == ".pdf":
        text, reliable = extract_pdf_text(path)
        if reliable and not force_vision:
            route, transcript = "text-layer", text
        else:
            route = "vision"
            pages = render_pdf_pages(path)
            parts = [await vl_transcribe_image(png) for png in pages]
            transcript = "\n\n".join(parts)
    elif ext in IMAGE_EXTS:
        route = "vision"
        transcript = await vl_transcribe_image(path.read_bytes(), _MIME.get(ext, "image/png"))
    elif ext in TEXT_EXTS:
        route, transcript = "plain-text", path.read_text(encoding="utf-8")
    else:
        raise ValueError(f"不支持的文件类型：{ext}（支持 pdf/{'/'.join(sorted(e.lstrip('.') for e in IMAGE_EXTS))}/txt/md）")

    raw = await structure_resume_text(transcript)
    return raw, route
