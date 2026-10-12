import type { Evaluation } from "@/api/types";
import { CountNumber } from "@/components/ui";

export default function ScorePanel({ scores, maxRounds }: { scores: Evaluation[]; maxRounds: number }) {
  const avg = scores.length ? scores.reduce((a, s) => a + Number(s.score), 0) / scores.length : 0;
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between border-b border-rule pb-2">
        <span className="font-mono text-[11px] tracking-[0.12em] text-ink-soft">
          已评分 {scores.length} / {maxRounds} 题
        </span>
        {scores.length > 0 && (
          <span className="font-mono text-[11px] text-ink-soft">
            均分
            <span className="font-latin text-lg text-seal ml-1.5">
              <CountNumber value={avg} decimals={1} />
            </span>
          </span>
        )}
      </div>

      <div className="space-y-4">
        {scores.map((s, i) => (
          <div key={i} className="space-y-1.5 animate-pop-in">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[11px] tracking-[0.14em] text-ink-soft">第 {i + 1} 题</span>
              <span className="font-latin text-2xl leading-none text-seal">
                <CountNumber value={Number(s.score)} decimals={1} />
              </span>
            </div>
            <div className="score-rule">
              <span style={{ width: `${Math.min(100, (Number(s.score) / 10) * 100)}%` }} />
            </div>
            {s.comment && <p className="font-kai text-xs leading-5 text-ink-soft">{s.comment}</p>}
          </div>
        ))}
        {scores.length === 0 && (
          <p className="font-kai text-sm leading-6 text-ink-faint">完成回答后这里会出现红笔批改的逐题评分。</p>
        )}
      </div>
    </div>
  );
}
