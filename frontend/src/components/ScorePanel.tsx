import type { Evaluation } from "@/api/types";

export default function ScorePanel({ scores, maxRounds }: { scores: Evaluation[]; maxRounds: number }) {
  const avg = scores.length ? scores.reduce((a, s) => a + s.score, 0) / scores.length : 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-neutral-400">
        <span>
          已评分 {scores.length} / {maxRounds} 题
        </span>
        {scores.length > 0 && (
          <span>
            均分 <span className="text-emerald-400 font-semibold">{avg.toFixed(1)}</span>
          </span>
        )}
      </div>
      <div className="space-y-3">
        {scores.map((s, i) => (
          <div key={i} className="text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-neutral-400">第 {i + 1} 题</span>
              <span className="font-semibold">{Number(s.score).toFixed(1)}</span>
            </div>
            <div className="h-1.5 rounded bg-neutral-800 overflow-hidden">
              <div
                className="h-full rounded bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, (Number(s.score) / 10) * 100)}%` }}
              />
            </div>
            {s.comment && <p className="text-xs text-neutral-500 mt-1 leading-snug">{s.comment}</p>}
          </div>
        ))}
        {scores.length === 0 && <p className="text-sm text-neutral-500">完成回答后这里会显示逐题评分</p>}
      </div>
    </div>
  );
}
