"""OpenAI 兼容 LLM 客户端（用 httpx 直连，不依赖 openai SDK）。

支持智谱 GLM、DeepSeek、Moonshot、本地 Ollama 等任何
"POST {base}/chat/completions" 兼容接口。
"""
import json
import logging
from typing import List, Optional

import httpx

from .config import LLM_API_BASE, LLM_API_KEY, LLM_MODEL, LLM_TIMEOUT

logger = logging.getLogger("copilot.llm")


class LLMError(Exception):
    """LLM 调用失败（网络/鉴权/限流/格式），由上层捕获后自动降级 mock。"""


def chat(messages: List[dict], temperature: float = 0.0, timeout: Optional[float] = None) -> str:
    """调用 chat/completions，返回助手回复文本；任何异常统一抛 LLMError。"""
    if not LLM_API_KEY.strip():
        raise LLMError("未配置 LLM_API_KEY")
    url = LLM_API_BASE.rstrip("/") + "/chat/completions"
    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {LLM_API_KEY.strip()}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=timeout or LLM_TIMEOUT) as client:
            resp = client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            raise LLMError(f"HTTP {resp.status_code}: {resp.text[:200]}")
        content = resp.json()["choices"][0]["message"]["content"]
        if not content or not content.strip():
            raise LLMError("LLM 返回空内容")
        return content
    except LLMError:
        raise
    except Exception as exc:  # 网络超时、JSON 解析失败等
        raise LLMError(f"LLM 调用失败: {exc}") from exc


def parse_json_loose(text: str) -> dict:
    """宽容解析 LLM 输出里的 JSON（自动剥离 ```json 围栏、截取首尾大括号）。"""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise LLMError(f"LLM 输出中未找到 JSON：{text[:120]}")
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError as exc:
        raise LLMError(f"JSON 解析失败: {exc}") from exc
