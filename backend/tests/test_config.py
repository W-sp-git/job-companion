import os
from urllib.request import getproxies

from app.config import apply_api_proxy_bypass


def test_proxy_bypass_preserves_existing_exclusions_and_both_spellings(monkeypatch):
    monkeypatch.setenv("NO_PROXY", "localhost,127.0.0.1")
    monkeypatch.setenv("no_proxy", "internal.example,localhost")
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:7897")

    apply_api_proxy_bypass(" dashscope.aliyuncs.com,open.bigmodel.cn ")

    expected = (
        "localhost,127.0.0.1,internal.example,dashscope.aliyuncs.com,open.bigmodel.cn"
    )
    assert os.environ["NO_PROXY"] == os.environ["no_proxy"] == expected
    assert getproxies()["no"] == expected
    assert os.environ["HTTPS_PROXY"] == "http://127.0.0.1:7897"
    apply_api_proxy_bypass("dashscope.aliyuncs.com,open.bigmodel.cn")
    assert os.environ["NO_PROXY"] == expected


def test_proxy_bypass_is_opt_in(monkeypatch):
    monkeypatch.delenv("NO_PROXY", raising=False)
    monkeypatch.setenv("no_proxy", "localhost")
    apply_api_proxy_bypass(" ")
    assert "NO_PROXY" not in os.environ
    assert os.environ["no_proxy"] == "localhost"
