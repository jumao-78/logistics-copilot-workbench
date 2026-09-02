"""应用配置：数据库连接、LLM 接入参数。

约定：
* 数据库连接只从环境变量 DATABASE_URL 读取，默认 sqlite:///data/copilot.db；
  相对路径的 SQLite 地址会以项目根目录为基准解析，避免受启动目录影响。
* LLM 采用任意 OpenAI 兼容接口（智谱 glm-4-flash / DeepSeek / 本地 Ollama 等），
  通过 LLM_API_BASE / LLM_API_KEY / LLM_MODEL 三个环境变量接入；
  未配置 Key 时全链路自动降级为 mock（规则）模式。
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]


def _load_dotenv() -> None:
    """极简 .env 加载器（不引入额外依赖；不覆盖已有环境变量）。"""
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

# ---------------- 数据库 ----------------
DEFAULT_DATABASE_URL = "sqlite:///data/copilot.db"
DATABASE_URL = os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)

# ---------------- LLM（OpenAI 兼容） ----------------
LLM_API_KEY = os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY") or ""
LLM_API_BASE = (
    os.environ.get("LLM_API_BASE")
    or os.environ.get("OPENAI_API_BASE")
    or "https://open.bigmodel.cn/api/paas/v4"  # 默认对接智谱开放平台
)
LLM_MODEL = os.environ.get("LLM_MODEL", "glm-4-flash")
LLM_TIMEOUT = float(os.environ.get("LLM_TIMEOUT", "20"))


def llm_enabled() -> bool:
    """是否启用 LLM 模式：配置了 API Key 即视为可用，单次调用失败会自动逐条降级。"""
    return bool(LLM_API_KEY.strip())
