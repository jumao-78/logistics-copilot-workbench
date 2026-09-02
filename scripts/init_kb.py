#!/usr/bin/env python3
"""知识库初始化：确认 kb/ 内 FAQ 齐全并把知识库同步入库（幂等，可重复执行）。

说明：kb/ 目录的 FAQ Markdown 随项目交付，本脚本负责：
1) 检查 kb/ 至少有 5 篇 FAQ（不足则给出提示）；
2) 调用 app.rag.sync_kb 完成 kb_docs / kb_chunks 的构建。
日常维护（新增/修改 FAQ 后）直接用 scripts/sync_kb.py 即可。
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.database import SessionLocal, init_db  # noqa: E402
from app.rag import KB_DIR, sync_kb  # noqa: E402


def main() -> None:
    kb_dir = KB_DIR
    md_files = sorted(kb_dir.rglob("*.md"))
    if len(md_files) < 5:
        print(f"[警告] kb/ 下仅发现 {len(md_files)} 篇 Markdown，FAQ 应至少 5~10 篇")
        print("       请参考 docs/Obsidian知识库管理指南.md 补充知识库内容后重试")
        sys.exit(1)

    init_db()
    db = SessionLocal()
    stats = sync_kb(db, kb_dir)
    print(f"[完成] 知识库初始化：{stats['scanned']} 篇 FAQ 已入库，共切出 {stats['chunks']} 个检索块")
    print("       （新增/修改 FAQ 后，运行 python scripts/sync_kb.py 增量同步即可）")


if __name__ == "__main__":
    main()
