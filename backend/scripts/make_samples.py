"""生成测试简历样本（backend/samples/）。

运行（backend/ 目录下）：uv run python -m scripts.make_samples
产物：
- resume_text.pdf    文本层 PDF（正常中文简历）
- resume_scan.png    由该 PDF 渲染的图片（模拟手机拍照，无文本层）
- resume_two_col.pdf 双栏排版 PDF（人工 --vision 强制走视觉路线）
"""

from __future__ import annotations

from pathlib import Path

import pymupdf

SAMPLES_DIR = Path(__file__).resolve().parents[1] / "samples"

RESUME_TEXT = """张明
电话：138-1234-5678    邮箱：zhangming@example.com
求职意向：Java 后端开发工程师

教育背景
2022.09 - 2026.06    某某大学    软件工程    本科
主修课程：数据结构、操作系统、计算机网络、数据库原理
GPA 3.7/4.0，专业排名前 15%

专业技能
熟悉 Java、Python，了解 C++；熟悉 Spring Boot、MyBatis 框架
掌握 MySQL 索引与事务，了解 Redis 缓存应用
熟悉 Linux 常用命令，了解 Docker 基本使用

实习经历
2025.07 - 2025.09    某某科技有限公司    后端开发实习生
- 参与公司内部工单系统开发，基于 Spring Boot 实现工单流转接口
- 优化订单查询 SQL，接口平均响应时间从 800ms 降至 200ms
- 编写单元测试 30 余个，覆盖核心业务逻辑

项目经历
校园二手交易平台（2024.09 - 2024.12）
- 技术栈：Spring Boot + MySQL + Redis + Vue
- 负责后端商品模块与订单模块，实现秒杀场景下的库存扣减
- 使用 Redis 预减库存 + 消息队列异步下单，压测 QPS 达 500

获奖情况
2024 年 蓝桥杯省级二等奖
2023 - 2024 学年 校级二等奖学金
"""

LEFT_COL = """张明
求职意向：Java 后端开发工程师

教育背景
某某大学 软件工程 本科
2022.09 - 2026.06
GPA 3.7/4.0

专业技能
Java / Python / Spring Boot
MySQL / Redis / Linux
Docker 基本使用

获奖情况
蓝桥杯省级二等奖
校级二等奖学金
"""

RIGHT_COL = """联系方式
电话：138-1234-5678
邮箱：zhangming@example.com

实习经历
某某科技有限公司 后端开发实习生
2025.07 - 2025.09
参与工单系统开发
优化订单查询 SQL
编写单元测试 30 余个

项目经历
校园二手交易平台
负责商品与订单模块
Redis 预减库存 + 消息队列
压测 QPS 达 500
"""


def _write_single_page_pdf(path: Path, text: str) -> None:
    doc = pymupdf.open()
    page = doc.new_page()
    rect = pymupdf.Rect(50, 50, page.rect.width - 50, page.rect.height - 50)
    rc = page.insert_textbox(rect, text, fontsize=10.5, fontname="china-ss", lineheight=1.5)
    if rc < 0:
        doc.close()
        raise RuntimeError(f"文本溢出页面：{path.name}")
    doc.save(str(path))
    doc.close()


def main() -> None:
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)

    pdf_path = SAMPLES_DIR / "resume_text.pdf"
    _write_single_page_pdf(pdf_path, RESUME_TEXT)

    doc = pymupdf.open(str(pdf_path))
    pix = doc[0].get_pixmap(dpi=110)
    pix.save(str(SAMPLES_DIR / "resume_scan.png"))
    doc.close()

    doc = pymupdf.open()
    page = doc.new_page()
    w = page.rect.width
    left = pymupdf.Rect(50, 50, w / 2 - 20, page.rect.height - 50)
    right = pymupdf.Rect(w / 2 + 20, 50, w - 50, page.rect.height - 50)
    page.insert_textbox(left, LEFT_COL, fontsize=10.5, fontname="china-ss", lineheight=1.5)
    page.insert_textbox(right, RIGHT_COL, fontsize=10.5, fontname="china-ss", lineheight=1.5)
    doc.save(str(SAMPLES_DIR / "resume_two_col.pdf"))
    doc.close()

    for f in ("resume_text.pdf", "resume_scan.png", "resume_two_col.pdf"):
        print(f"生成 {SAMPLES_DIR / f}")


if __name__ == "__main__":
    main()
