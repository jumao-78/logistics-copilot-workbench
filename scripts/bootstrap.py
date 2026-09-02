#!/usr/bin/env python3
"""一键初始化：建表 → 生成模拟工单 → 同步知识库 → 跑评测。

等价于依次执行：
    python scripts/mock_data.py --force
    python scripts/init_kb.py
    python scripts/evaluate.py --mode auto
新环境拉下项目后，先装依赖（pip install -r requirements.txt），再跑本脚本即可完成全部初始化。
"""
import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"


def run(script: str, args: list) -> None:
    print(f"\n========== python scripts/{script} {' '.join(args)} ==========")
    argv_backup = sys.argv
    sys.argv = [script] + args
    try:
        runpy.run_path(str(SCRIPTS / script), run_name="__main__")
    finally:
        sys.argv = argv_backup


if __name__ == "__main__":
    run("mock_data.py", ["--force"])
    run("init_kb.py", [])
    run("evaluate.py", ["--mode", "auto"])
    print("\n[bootstrap 完成] 启动服务：python -m uvicorn app.main:app --reload --port 8000")
