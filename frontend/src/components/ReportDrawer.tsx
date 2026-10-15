import { useState } from "react";

import ScoreRadar from "@/components/ScoreRadar";
import { Badge, Button, CountNumber, Stamp } from "@/components/ui";
import { useT } from "@/i18n";
import type { InterviewReport } from "@/api/types";

export default function ReportDrawer({ report, onClose }: { report: InterviewReport; onClose: () => void }) {
  const { t } = useT();
  const [openQ, setOpenQ] = useState<number | null>(null);
  return (
    <div
      className="fixed inset-0 z-30 flex justify-end bg-ink/45 backdrop-blur-[2px] animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl h-full overflow-y-auto bg-sheet border-l-2 border-ink p-6 space-y-6 animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="tape top-3 left-1/2 -translate-x-1/2 w-28 rotate-[-2deg]" aria-hidden="true" />
        <Stamp size="lg" className="absolute right-7 top-16 pointer-events-none">
          {t("report.stamp.reviewed")}
        </Stamp>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow mb-1.5">{t("report.eyebrow")}</div>
            <h2 className="font-display text-2xl font-black tracking-wide">{t("report.title")}</h2>
            <p className="font-kai text-xs text-ink-soft mt-1.5">{t("report.desc")}</p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>

        <div className="flex items-center gap-6 border-y border-rule py-5">
          <div className="text-center shrink-0">
            <div className="font-latin text-6xl text-seal leading-none">
              <CountNumber value={Number(report.overall_score)} />
            </div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-ink-faint mt-2.5">
              {t("report.overall")}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <ScoreRadar data={report.dimension_scores || []} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="flex items-baseline gap-1.5 font-mono text-[11px] tracking-[0.2em] text-moss mb-2.5">
              <span className="text-seal">▪</span>
              {t("report.strengths")}
            </h3>
            <ul className="space-y-1.5 text-sm leading-6">
              {(report.strengths || []).map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-moss shrink-0">✓</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="flex items-baseline gap-1.5 font-mono text-[11px] tracking-[0.2em] text-ochre mb-2.5">
              <span className="text-seal">▪</span>
              {t("report.weaknesses")}
            </h3>
            <ul className="space-y-1.5 text-sm leading-6">
              {(report.weaknesses || []).map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-ochre shrink-0">△</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <h3 className="font-display text-base font-bold mb-2.5">{t("report.perQuestion")}</h3>
          <div className="space-y-2 stagger">
            {(report.per_question || []).map((q, i) => (
              <div key={i} className="border border-rule-strong bg-sheet-bright rounded-[2px] overflow-hidden">
                <button
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-left hover:bg-paper-deep/50 transition-colors"
                  onClick={() => setOpenQ(openQ === i ? null : i)}
                >
                  <span className="truncate pr-2">
                    {t("report.qNo", { round: q.round, question: q.question })}
                  </span>
                  <span className="font-latin text-xl text-seal leading-none shrink-0">
                    <CountNumber value={Number(q.score)} decimals={1} />
                  </span>
                </button>
                {openQ === i && (
                  <div className="px-3 pb-3 pt-2.5 text-sm space-y-3 border-t border-rule animate-fade-in">
                    <p className="font-kai leading-6 text-ink-soft">
                      <span className="block font-mono text-[10px] tracking-[0.2em] text-ink-faint mb-0.5">
                        {t("report.yourAnswer")}
                      </span>
                      {q.answer_summary}
                    </p>
                    <div className="border-l-2 border-moss bg-moss/5 p-2.5 rounded-r-[2px]">
                      <span className="font-mono text-[10px] tracking-[0.2em] text-moss">
                        {t("report.betterAnswer")}
                      </span>
                      <p className="mt-1 whitespace-pre-wrap font-kai leading-6">{q.better_answer}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-display text-base font-bold mb-2.5">{t("report.plan")}</h3>
          <ol className="space-y-2">
            {(report.improvement_plan || []).map((s, i) => (
              <li key={i} className="flex gap-3 text-sm leading-6">
                <span className="font-latin text-lg text-seal leading-6 w-6 text-right shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          {!!report.recommended_practice?.length && (
            <div className="mt-3 flex flex-wrap gap-1.5">
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
