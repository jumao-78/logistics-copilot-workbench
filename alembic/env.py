"""Alembic 迁移环境：连接串与 app 同源（读 DATABASE_URL），元数据来自 app.models。

常用命令：
    alembic revision --autogenerate -m "init"   # 基于模型生成迁移
    alembic upgrade head                        # 应用迁移
首次使用请先 `pip install alembic`（requirements.txt 已包含）。
"""
import os
import sys
from logging.config import fileConfig

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import DATABASE_URL
from app.database import normalize_database_url
from app.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 与应用共用同一 DATABASE_URL，切库时迁移自动跟随
config.set_main_option("sqlalchemy.url", normalize_database_url(
    os.environ.get("DATABASE_URL", DATABASE_URL)))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
