"""全局配置：provider 注册表 + 按任务路由的模型设置。"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BACKEND_DIR / ".env"

TASKS = ("interview", "judge", "ocr", "draft", "review", "cluster", "intel")

PROVIDER_REGISTRY: dict[str, dict[str, str]] = {
    "dashscope": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "key_attr": "dashscope_api_key",
        "label": "通义千问 DashScope",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "key_attr": "deepseek_api_key",
        "label": "DeepSeek",
    },
    "zhipu": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "key_attr": "zhipu_api_key",
        "label": "智谱 GLM",
    },
    "kimi": {
        "base_url": "https://api.moonshot.cn/v1",
        "key_attr": "moonshot_api_key",
        "label": "Kimi",
    },
}

VISION_PROVIDERS = {"dashscope", "zhipu"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE), env_file_encoding="utf-8", extra="ignore"
    )

    dashscope_api_key: str = ""
    deepseek_api_key: str = ""
    zhipu_api_key: str = ""
    moonshot_api_key: str = ""
    tavily_api_key: str = ""
    bocha_api_key: str = ""

    interview_llm_provider: str = "dashscope"
    interview_llm_model: str = "qwen-plus"
    judge_llm_provider: str = "deepseek"
    judge_llm_model: str = "deepseek-chat"
    ocr_llm_provider: str = "dashscope"
    ocr_llm_model: str = "qwen3-vl-plus"
    draft_llm_provider: str = "dashscope"
    draft_llm_model: str = "qwen-max"
    review_llm_provider: str = "zhipu"
    review_llm_model: str = "glm-4-plus"
    mem0_llm_provider: str = "dashscope"
    mem0_llm_model: str = "qwen-flash"
    cluster_llm_provider: str = "dashscope"
    cluster_llm_model: str = "qwen-flash"
    intel_llm_provider: str = "dashscope"
    intel_llm_model: str = "qwen-plus"

    embedding_model: str = "text-embedding-v4"
    embedding_dims: int = 1024

    search_provider: str = "tavily"

    host: str = "127.0.0.1"
    port: int = 8010
    data_dir: str = str(BACKEND_DIR / "data")

    def provider_key(self, provider: str) -> str:
        meta = PROVIDER_REGISTRY.get(provider)
        if meta is None:
            return ""
        return getattr(self, meta["key_attr"], "")

    def task_provider(self, task: str) -> str:
        return getattr(self, f"{task}_llm_provider")

    def task_model(self, task: str) -> str:
        return getattr(self, f"{task}_llm_model")


@lru_cache
def get_settings() -> Settings:
    return Settings()
