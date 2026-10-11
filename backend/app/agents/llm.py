"""LLM 工厂：按任务（interview/judge/ocr/draft/review）取对应 provider 与模型的 ChatOpenAI。"""

from __future__ import annotations

from langchain_openai import ChatOpenAI

from app.config import PROVIDER_REGISTRY, VISION_PROVIDERS, get_settings


def get_llm(
    task: str,
    *,
    temperature: float = 0.7,
    streaming: bool = False,
    max_tokens: int | None = None,
) -> ChatOpenAI:
    settings = get_settings()
    provider = settings.task_provider(task)
    model = settings.task_model(task)

    if provider not in PROVIDER_REGISTRY:
        raise ValueError(f"未知 provider：{provider}（任务 {task}）")
    if task == "ocr" and provider not in VISION_PROVIDERS:
        raise ValueError(f"ocr 任务需要视觉模型（{sorted(VISION_PROVIDERS)}），当前为 {provider}")

    api_key = settings.provider_key(provider)
    if not api_key:
        raise RuntimeError(f"任务 {task} 使用的 provider {provider} 未配置 API Key")

    kwargs: dict = {
        "model": model,
        "api_key": api_key,
        "base_url": PROVIDER_REGISTRY[provider]["base_url"],
        "temperature": temperature,
        "streaming": streaming,
    }
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    return ChatOpenAI(**kwargs)
