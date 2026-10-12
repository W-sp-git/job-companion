import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "@/api/client";
import { MODE_LABELS, type SessionInfo } from "@/api/types";
import { Badge, Card, Stamp } from "@/components/ui";

const features = [
  {
    to: "/interview",
    title: "模拟面试官",
    desc: "四种模式多轮对话：开场契约、动态追问、逐题打分、复盘报告；跨会话记住你的弱点。",
  },
  {
    to: "/resume",
    title: "简历解析与优化",
    desc: "上传 PDF / 照片自动解析为结构化档案；起草-审查双 Agent 循环，ATS 关键词对齐，绝不虚构经历。",
  },
  {
    to: "/profile",
    title: "我的档案与记忆",
    desc: "专业背景、目标岗位写入长期记忆，面试出题与简历优化都会读取它，越用越懂你。",
  },
];

export default function HomePage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    api
      .get<SessionInfo[]>("/api/interview/sessions")
      .then(setSessions)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-12 pb-4">
      {/* ============ 封面 ============ */}
      <section className="relative pt-10 pb-10 text-center overflow-hidden">
        <span
          className="pointer-events-none select-none absolute left-1/2 top-[-30px] -translate-x-1/2 font-display font-black text-[300px] leading-none text-ink/[0.035]"
          aria-hidden="true"
        >
          录
        </span>
        <Stamp size="xl" animate className="hidden md:inline-flex absolute right-[6%] top-8">
          上岸
        </Stamp>
        <Stamp size="md" animate className="hidden lg:inline-flex absolute left-[8%] bottom-10 rotate-[6deg]">
          校招
        </Stamp>

        <div className="relative">
          <div className="flex items-center justify-center gap-4 font-mono text-[10px] uppercase tracking-[0.32em] text-ink-faint animate-ink-up">
            <span>创刊号 · № 001</span>
            <span className="h-1.5 w-1.5 bg-seal" />
            <span>校招作战 · 本地运行</span>
          </div>

          <div className="mt-7 flex items-center gap-4 animate-ink-up [animation-delay:80ms]">
            <span className="h-px flex-1 bg-rule-strong" />
            <span className="font-latin text-xs tracking-[0.4em] text-ink-soft whitespace-nowrap">
              THE JOB COMPANION
            </span>
            <span className="h-px flex-1 bg-rule-strong" />
          </div>

          <h1 className="mt-4 font-display font-black text-[52px] md:text-[84px] leading-none tracking-[0.08em] animate-ink-up [animation-delay:150ms]">
            求职搭子
          </h1>

          <p className="mt-6 text-sm leading-7 text-ink-soft animate-ink-up [animation-delay:220ms]">
            模拟面试 · 简历优化 · 公司调研 · 长期记忆
            <br />
            从「简历不会写、面试没经验」，到拿捏每一场校招。
          </p>
        </div>
      </section>

      {/* ============ 目录 ============ */}
      <section>
        <div className="flex items-end justify-between border-b-2 border-ink pb-2 mb-5">
          <h2 className="font-display text-xl font-bold tracking-[0.1em]">目录</h2>
          <span className="font-mono text-[10px] tracking-[0.24em] text-ink-faint">CONTENTS · 03 ENTRIES</span>
        </div>
        <div className="grid md:grid-cols-3 gap-5 stagger">
          {features.map((f, i) => (
            <Link key={f.to} to={f.to} className="group">
              <Card hover fold className="h-full">
                <div className="flex items-start justify-between mb-4">
                  <span className="font-latin text-4xl leading-none text-seal">0{i + 1}</span>
                  <span className="font-mono text-[10px] tracking-[0.2em] text-ink-faint mt-1">
                    {["MOCK INTERVIEW", "RESUME LAB", "MY DOSSIER"][i]}
                  </span>
                </div>
                <h3 className="font-display text-xl font-bold tracking-wide mb-2.5">{f.title}</h3>
                <p className="text-sm leading-6 text-ink-soft">{f.desc}</p>
                <div className="mt-5 font-mono text-[11px] tracking-[0.2em] text-ink-faint group-hover:text-seal transition-colors">
                  进入 →
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ============ 近期战绩 ============ */}
      {sessions.length > 0 && (
        <section>
          <div className="flex items-end justify-between border-b-2 border-ink pb-2 mb-1">
            <h2 className="font-display text-xl font-bold tracking-[0.1em]">近期战绩</h2>
            <span className="font-mono text-[10px] tracking-[0.24em] text-ink-faint">RECENT SESSIONS</span>
          </div>
          <div className="divide-y divide-rule stagger">
            {sessions.slice(0, 5).map((s) => (
              <Link key={s.id} to={`/interview/${s.id}`} className="block group">
                <div className="flex items-center gap-3 py-3">
                  <Badge>{MODE_LABELS[s.mode] ?? s.mode}</Badge>
                  <span className="truncate text-sm group-hover:text-seal transition-colors">
                    {s.target_role || "未指定岗位"}
                  </span>
                  <span className="hidden sm:block flex-1 border-b border-dotted border-rule-strong translate-y-[-2px]" />
                  <span className="font-mono text-[10px] text-ink-faint shrink-0 hidden md:inline">
                    {new Date(s.created_at).toLocaleString()}
                  </span>
                  <span className="shrink-0 w-16 text-right">
                    {s.total_score != null ? (
                      <span className="font-latin text-xl text-seal">
                        {Math.round(Number(s.total_score))}
                        <span className="font-mono text-[10px] text-ink-faint ml-1">分</span>
                      </span>
                    ) : (
                      <Badge tone={s.status === "finished" ? "green" : "blue"}>
                        {s.status === "finished" ? "已结束" : "进行中"}
                      </Badge>
                    )}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
