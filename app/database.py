"""数据库引擎与会话：只认 DATABASE_URL，SQLite/PostgreSQL/MySQL 一套 ORM 通吃。"""
import os
from pathlib import Path
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import BASE_DIR, DATABASE_URL

Base = declarative_base()


def normalize_database_url(url: str) -> str:
    """把相对路径的 SQLite 地址锚定到项目根目录，其余地址原样返回。

    例：sqlite:///data/copilot.db → sqlite:///<项目根>/data/copilot.db
    这样无论从哪个目录启动 uvicorn / 脚本，数据库文件位置都一致。
    """
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        return url
    path = url[len(prefix):]
    if not path or path == ":memory:":
        return url
    if path.startswith("/") or Path(path).is_absolute():
        return url
    return "sqlite:///" + (BASE_DIR / path).as_posix()


def sqlite_dir(url: str) -> Optional[str]:
    """返回 SQLite 数据库文件所在目录（用于启动前自动创建目录）。"""
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        return None
    path = url[len(prefix):]
    if not path or path == ":memory:":
        return None
    return str(Path(path).parent)


DB_URL = normalize_database_url(DATABASE_URL)

_engine_kwargs: dict = {"pool_pre_ping": True}
if DB_URL.startswith("sqlite"):
    # FastAPI 多线程访问 SQLite 需要；仅引擎层参数，不影响 ORM 的可移植性
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DB_URL, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    """FastAPI 依赖：请求级数据库会话。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """建库建表（幂等）。真实库建议改用 Alembic 迁移（已预留，见 alembic/ 目录）。"""
    directory = sqlite_dir(DB_URL)
    if directory:
        os.makedirs(directory, exist_ok=True)
    from . import models  # noqa: F401  确保模型已注册

    Base.metadata.create_all(bind=engine)
