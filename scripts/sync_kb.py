#!/usr/bin/env python3
"""同步知识库：扫描 kb/ 目录 Markdown → 幂等 upsert kb_docs / kb_chunks。

幂等性：
* 以 front matter 的 title 为同步键，内容未变不产生副作用；
* 内容变更则更新正文并重建该文档全部切块；
* kb/ 中删除的文件，对应文档与切块也会从库里移除；
* 重复执行结果一致，可在 Obsidian 编辑后反复运行。

用法：
    python scripts/sync_kb.py            # 使用默认 kb/ 目录
    python scripts/sync_kb.py --dir path # 指定其他 Markdown 目录
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.database import SessionLocal, init_db  # noqa: E402
from app.rag import KB_DIR, sync_kb  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="同步 Obsidian 知识库到数据库")
    parser.add_argument("--dir", default=str(KB_DIR), help="Markdown 知识库目录（默认 kb/）")
    args = parser.parse_args()

    kb_dir = Path(args.dir)
    if not kb_dir.exists():
        print(f"[错误] 目录不存在：{kb_dir}")
        sys.exit(1)
    md_files = list(kb_dir.rglob("*.md"))
    if not md_files:
        print(f"[错误] 目录中没有 Markdown 文件：{kb_dir}")
        sys.exit(1)

    init_db()
    db = SessionLocal()
    stats = sync_kb(db, kb_dir)
    print(f"[完成] 知识库同步：扫描 {stats['scanned']} 个文件 | "
          f"新增 {stats['added']} | 更新 {stats['updated']} | 移除 {stats['removed']} | "
          f"切块 {stats['chunks']} 块")


if __name__ == "__main__":
    main()
