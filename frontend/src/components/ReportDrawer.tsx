import { useState } from "react";

import ScoreRadar from "@/components/ScoreRadar";
import { Badge, Button } from "@/components/ui";
import type { InterviewReport } from "@/api/types";

export default function ReportDrawer({ report, onClose }: { report: InterviewReport; onClose: () => void }) {
  const [openQ, setOpenQ] = useState<number | null>(null);
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-xl h-full overflow-y-auto bg-neutral-900 border-l border-neutral-800 p-6 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">面试复盘报告</h2>
            <p className="text-xs text-neutral-500 mt-1">基于逐题评分与整场表现的自动分析</p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-4xl font-bold text-emerald-400">{Math.round(Number(report.overall_score))}</div>
            <div className="text-xs text-neutral-500 mt-1">综合分 / 100</div>
          </div>
          <div className="flex-1">
            <ScoreRadar data={report.dimension_scores || []} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-semibold text-emerald-400 mb-2">优势</h3>
            <ul className="space-y-1.5 text-sm text-neutral-300">
              {(report.strengths || []).map((s, i) => (
                <li key={i}>· {s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-amber-400 mb-2">待提升</h3>
            <ul className="space-y-1.5 text-sm text-neutral-300">
              {(report.weaknesses || []).map((s, i) => (
                <li key={i}>· {s}</li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2">逐题回顾（点击展开更优答法）</h3>
          <div className="space-y-2">
            {(report.per_question || []).map((q, i) => (
              <div key={i} className="rounded-lg border border-neutral-800 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left hover:bg-neutral-800/50"
                  onClick={() => setOpenQ(openQ === i ? null : i)}
                >
                  <span className="truncate pr-2">
                    第 {q.round} 题：{q.question}
                  </span>
                  <Badge tone={Number(q.score) >= 7 ? "green" : Number(q.score) >= 5 ? "amber" : "red"}>
                    {Number(q.score).toFixed(1)}
                  </Badge>
                </button>
                {openQ === i && (
                  <div className="px-3 pb-3 text-sm space-y-2 border-t border-neutral-800 pt-2.5">
                    <p className="text-neutral-400">
                      <span className="text-neutral-500">你的回答：</span>
                      {q.answer_summary}
                    </p>
                    <div className="rounded-md bg-emerald-950/40 border border-emerald-900/60 p-2.5">
                      <span className="text-emerald-400 text-xs font-medium">更优答法</span>
                      <p className="mt-1 whitespace-pre-wrap">{q.better_answer}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2">改进行动</h3>
          <ol className="space-y-1.5 text-sm text-neutral-300 list-decimal list-inside">
            {(report.improvement_plan || []).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {!!report.recommended_practice?.length && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {report.recommended_practice.map((p, i) => (
                <Badge key={i} tone="blue">
                  {p}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
