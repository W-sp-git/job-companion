# 求职搭子 · 大学生求职全能智能体

AI 求职助手：多轮模拟面试 · 简历解析与优化 · 公司背景调研 · 长期记忆。
FastAPI + React 全栈，LangGraph 双状态图编排，多家大模型按任务路由，SSE 流式输出。

## 功能一览

| 功能 | 说明 |
|---|---|
| 模拟面试官 | 4 种模式（行为 / 技术 / 项目深挖 / 压力），开场播报面试契约、动态追问（每题至多 2 层）、逐题自动评分、结束后生成复盘报告（五维雷达 + 逐题"更优答法" + 改进行动） |
| 简历解析 | PDF 文本层自动识别；扫描件 / 手机照片走 Qwen 视觉模型；图片直接识别。解析结果忠实原文，不加工 |
| 简历优化 | 起草者-审查者双模型独立评审 → 修订循环；ATS 关键词对齐；**绝不虚构**（技能 / 单位 / 量化数字必须有原文依据，JD 要求但本人没有的诚实标注为"待补齐"）；导出 .docx（中文安全） |
| 公司调研 | 模拟面试开场与简历评审时真实联网搜索公司岗位要求 / 面经（Tavily，可插拔 博查 / 智谱） |
| 长期记忆 | Mem0 + Qdrant 本地向量库：自动提取并记住学生背景、目标岗位、面试弱点；跨会话在出题与简历优化中生效；记忆管理页可查看 / 删除 |
| 会话恢复 | 面试进度持久化（LangGraph checkpointer），断线 / 刷新后聊天记录与报告完整恢复；点"停止生成"后本轮仍在后台跑完并落库 |
| 战绩归档 | 档案页自动汇总历次面试：总分 / 单维度趋势曲线（可切换指标）、逐场归档台账；qwen-flash 跨场归并「能力短板主题」并统计复现次数（按场次指纹缓存，仅新面试后重算） |
| 公司背调 | 「情报处」页：4 路并行联网检索（招聘动态 / 薪资待遇 / 面试流程 / 风险信号）→ LLM 结构化抽取 + **确定性防虚构校验**（薪资数字必须对回搜索原文，无来源的风险信号直接剔除）→ SSE 进度流 → 存档可回看；每条结论附公开来源，情报可一键带入模拟面试 |

## 架构

```mermaid
flowchart TB
  U[浏览器 React] -- "REST + SSE" --> API[FastAPI]
  API --> IG[LangGraph 面试状态图]
  API --> RG[LangGraph 简历优化图]
  IG --> T1[工具: Tavily 搜索]
  IG --> M[(Mem0 长期记忆)]
  IG --> CKP[(SQLite checkpointer)]
  RG --> T2[工具: OCR·事实守卫·docx 导出]
  IG --> DB[(SQLite: 档案/会话/报告/简历版本)]
  RG --> DB
  IG --> LLM[LLM 按任务路由]
  RG --> LLM
  LLM --> DS[DashScope: qwen-plus/max · qwen3-vl-plus · qwen-flash]
  LLM --> DP[DeepSeek: 评分/抽取]
  LLM --> ZP[智谱 GLM: 独立评审]
```

**面试状态图**（`backend/app/agents/interview_graph.py`）：
`START → route_turn → opening | evaluate_answer | report`；`evaluate_answer → after_evaluate → probe | next_question | report`。
两个路由函数是纯函数，可无 API Key 单测（`tests/test_interview_routing.py`）。

**简历优化图**（`backend/app/agents/resume_graph.py`）：
`draft → review → (refine → review)* → finalize`，最多 2 轮修订。

## 技术决策（为什么这么选）

| 决策 | 理由 |
|---|---|
| **LangGraph** 而非手写 ReAct | 面试本质是确定性状态机（追问分支 / 轮次上限 / 强制出报告），条件边可断言可测试；checkpointer 免费拿到断点续聊；`astream` 多模式一次拿到 token 流 + 自定义事件 + 节点进度 |
| **Mem0** 而非自己写向量检索 | 难的不是检索而是"提取与更新"：哪些值得长期记、目标变了要覆盖、同义去重。封装为 `MemoryManager` 接口，框架可替换 |
| **起草者-审查者分离** | 审查节点用**不同厂商模型**（GLM）+ 全新上下文，保证视角独立；比单模型自审更能发现弱表述与虚构 |
| **三层防虚构** | ① 起草 prompt 硬规则 ② 确定性守卫（技能 / 单位 / 项目名 / **量化数字** 逐项对原文验证，零 LLM 成本）③ 独立评审员 LLM 复查 |
| 按任务路由模型 | 每类任务独立 `.env` 配置（见下），换模型一行切换：面试官要流式快模型、评分要严格低价、审查要换厂商、OCR 必须有视觉 |
| OCR 双路线 | 文本层便宜快速；扫描件 / 双栏 / CID 乱码自动切 Qwen-VL 渲染识别（页图 → 转写 → 结构化 JSON） |
| SSE 用 fetch 手写解析 | EventSource 只支持 GET、不能带请求体；前端 `src/api/sse.ts` 手写分帧解析，支持"停止生成"（AbortController） |
| 背调用确定性校验而非模型自评 | 薪资 / 规模等数字类事实由代码做「单位折算 + 全量比对」（2万 == 20k == 20000）；风险信号无公开来源直接剔除——合规与可信度靠规则兜底，而非让模型"自我保证" |
| 断连后台续跑 | 图在独立任务执行 + 队列转发：客户端断开时本轮仍完整执行并提交状态，不会出现"开场跑一半" |

## 快速开始

前置：Python ≥ 3.11、[uv](https://docs.astral.sh/uv/)、Node ≥ 20；DeepSeek / DashScope（通义）/ 智谱 / Tavily 的 API Key。

```bash
# 1) 后端
cd backend
uv sync
cp .env.example .env          # 填入四家 Key（见下表）
uv run python -m scripts.cli ping          # 连通性自检：5 类任务模型 + Tavily
uv run uvicorn app.main:app --host 127.0.0.1 --port 8010

# 2) 前端（新终端）
cd frontend
npm install
npm run dev                   # http://localhost:5173（/api 已代理到 8010）
```

仓库根目录也提供命令：`make dev-backend` / `make dev-frontend` / `make ping` / `make test`。

### 模型路由（backend/.env）

| 任务 | 默认 | 说明 |
|---|---|---|
| interview | dashscope / qwen-plus | 面试官对话（流式） |
| judge | deepseek / deepseek-chat | 答题评分、简历解析结构化、复盘报告（便宜且严格） |
| ocr | dashscope / qwen3-vl-plus | 简历图片 / 扫描件（必须有视觉能力） |
| draft | dashscope / qwen-max | 简历起草与修订 |
| review | zhipu / glm-4-plus | 独立评审（故意换厂商保证视角独立） |
| mem0 | dashscope / qwen-flash | 记忆提取（高频，用便宜模型） |
| embedding | dashscope / text-embedding-v4（1024 维） | 中文语义检索 |
| search | tavily | 备选：bocha / zhipu |

## 验证与测试

```bash
cd backend
uv run pytest -q                       # 路由 / 防虚构守卫 / ATS 单测（无需 API Key）

# 命令行验证
uv run python -m scripts.make_samples  # 生成测试简历样本（PDF / 拍照图 / 双栏）
uv run python -m scripts.cli parse-resume samples/resume_text.pdf
uv run python -m scripts.cli parse-resume samples/resume_scan.png     # 视觉路线
uv run python -m scripts.cli interview --mode technical --rounds 3 --role "Java 后端开发工程师" --company "字节跳动"
uv run python -m scripts.cli remember "我是软件工程大三学生，目标岗位是后端开发"
uv run python -m scripts.cli recall "我面试有哪些弱点"

# 浏览器端到端（需前端 dev server 运行；脚本自带断言）
cd frontend
node scripts/e2e_interview.mjs   # 面试：流式 / 评分 / 报告 / 刷新恢复
node scripts/e2e_resume.mjs      # 简历：解析 / 优化 / 下载 docx / 版本对比
```

## 目录结构

```
backend/
  app/
    agents/        # 面试图 / 简历图 / LLM 工厂 / 提示词 / Pydantic 模型 / State
    api/           # interview(SSE) / resume / profile / memory 路由
    tools/         # ocr 双路线解析 / search 三实现 / docx 导出 / 守卫 / SQLite 读写
    memory/        # Mem0 封装（三读三写时机）
    db/            # SQLAlchemy 模型（6 张表）+ WAL 引擎
    utils/         # 三层结构化输出降级 / SSE 工具
  scripts/         # 验证 CLI / 样本生成
  tests/           # 纯逻辑单测（免 Key）
  data/            # 运行时产物（gitignore）：app.db / checkpoints.db / qdrant/ / exports/
frontend/
  src/api/         # fetch 封装 + SSE 流解析器
  src/stores/      # zustand 面试状态
  src/pages/       # 首页 / 面试 / 简历 / 档案
  src/components/  # 聊天气泡 / 阶段指示 / 评分面板 / 雷达图 / 报告抽屉 / 版本对比
  scripts/         # playwright 端到端脚本（驱动本机 Edge/Chrome）
```

## 成本参考

一场 8 题面试（含追问与复盘）约 15-20 次模型调用，按默认配置 **< 0.5 元**；一次简历优化（含 2 轮评审修订）约 8-12 次调用，**< 0.5 元**；一次公司背调 = 4 次搜索 + 1 次 qwen-plus，约 **1-2 分钱**；记忆提取使用 qwen-flash 可忽略不计。

## 这个项目怎么讲（简历 / 面试）

1. **多 Agent 协作**：面试状态机（条件边路由可单测）+ 简历"起草者-审查者-修订者"循环（跨厂商模型独立评审）
2. **长期记忆机制**：Mem0 的三读三写时机设计（开场注入弱点、每轮回答后台提取、报告后写入弱点记忆），记忆管理页可查看/删除
3. **可靠性工程**：LLM 结构化输出三层降级（`with_structured_output → json_mode → json_repair + 校验重试`）；防虚构三层守卫；SSE 断连后台续跑
4. **流式体验**：LangGraph `astream` 多模式 → SSE 事件协议（token / stage / score / report），前端手写 SSE 解析器支持中断与恢复
5. **多源情报管道**：4 路并发检索（单路失败隔离 + 瞬时重试）→ 结构化抽取 → 确定性防虚构校验（数字折算比对 / 无来源风险剔除 / 核要句级清洗）→ SSE 进度事件 → 落库存档（客户端断开照跑完）
6. **工程细节**：多模型按任务路由（一行切换 provider）、SQLite WAL + checkpointer 断点续聊、docx 中文字体安全导出、上传与并发保护（409 / 锁）
