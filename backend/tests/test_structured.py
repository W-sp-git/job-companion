import json

import pytest
from langchain_core.messages import AIMessage

from app.agents.workspace_schemas import JobAnalysis
from app.utils.structured import call_structured


@pytest.mark.asyncio
async def test_json_fallback_receives_full_nested_schema():
    class JsonOnlyModel:
        def __init__(self):
            self.messages = []

        def with_structured_output(self, schema):
            raise NotImplementedError("provider supports JSON syntax only")

        def bind(self, **kwargs):
            return self

        async def ainvoke(self, messages):
            self.messages = messages
            return AIMessage(
                content=json.dumps(
                    {
                        "requirements": [
                            {
                                "requirement": "熟悉Redis",
                                "status": "unknown",
                                "explanation": "缺少材料",
                                "next_action": "补充项目实例",
                            }
                        ]
                    }
                )
            )

    llm = JsonOnlyModel()
    result = await call_structured(
        llm, JobAnalysis, [{"role": "user", "content": "分析岗位"}]
    )
    schema_message = llm.messages[0].content
    assert '"$defs"' in schema_message
    assert "evidence_quote" in schema_message and "supported" in schema_message
    assert result.requirements[0].explanation == "缺少材料"


@pytest.mark.asyncio
async def test_connection_failure_does_not_trigger_format_fallbacks():
    import httpx
    from openai import APIConnectionError

    class OfflineModel:
        def with_structured_output(self, schema):
            return self

        async def ainvoke(self, messages):
            raise APIConnectionError(
                request=httpx.Request("POST", "https://model.example")
            )

        def bind(self, **kwargs):
            raise AssertionError(
                "A disconnected provider must not be retried as a schema issue"
            )

    with pytest.raises(RuntimeError, match="模型服务暂不可用"):
        await call_structured(OfflineModel(), JobAnalysis, "分析岗位")
