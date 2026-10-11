import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "@/api/client";
import { MODE_LABELS, type SessionInfo } from "@/api/types";
import { Badge, Card } from "@/components/ui";

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
    <div className="space-y-10">
      <section className="py-12 text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">AI 求职搭子</h1>
        <p className="text-neutral-400 max-w-2xl mx-auto leading-relaxed">
          模拟面试 · 简历优化 · 公司调研 · 长期记忆
          <br />
          从「简历不会写、面试没经验」，到拿捏每一场校招。
        </p>
      </section>

      <div className="grid md:grid-cols-3 gap-4">
        {features.map((f) => (
          <Link key={f.to} to={f.to}>
            <Card className="h-full hover:border-emerald-700/70 transition-colors">
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">{f.desc}</p>
            </Card>
          </Link>
        ))}
      </div>

      {sessions.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">最近的面试</h2>
          <div className="space-y-2">
            {sessions.slice(0, 5).map((s) => (
              <Link key={s.id} to={`/interview/${s.id}`} className="block">
                <Card className="flex items-center justify-between py-3 hover:border-neutral-700">
                  <div className="flex items-center gap-3 text-sm min-w-0">
                    <Badge>{MODE_LABELS[s.mode] ?? s.mode}</Badge>
                    <span className="truncate">{s.target_role || "未指定岗位"}</span>
                    <span className="text-neutral-500 text-xs shrink-0">
                      {new Date(s.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm shrink-0">
                    {s.total_score != null ? (
                      <span className="text-emerald-400 font-semibold">
                        {Math.round(Number(s.total_score))} 分
                      </span>
                    ) : (
                      <Badge tone={s.status === "finished" ? "green" : "blue"}>
                        {s.status === "finished" ? "已结束" : "进行中"}
                      </Badge>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
