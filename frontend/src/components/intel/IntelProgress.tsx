import type { LaneStatus } from "@/stores/intelStore";

const LANE_ROWS = [
  { key: "hiring", label: "招聘动态" },
  { key: "salary", label: "薪资待遇" },
  { key: "process", label: "面试流程" },
  { key: "risk", label: "风险信号" },
] as const;

const EXTRA_ROWS = [
  { key: "extract", label: "结构化抽取" },
  { key: "verify", label: "防虚构校验" },
  { key: "save", label: "存档" },
] as const;

function StatusMark({ status }: { status: LaneStatus }) {
  if (status === "done") {
    return <span className="w-2.5 text-center font-mono text-[11px] leading-none text-moss">✓</span>;
  }
  if (status === "active") {
    return <span className="h-2.5 w-2.5 bg-seal animate-press-pulse" aria-hidden="true" />;
  }
  return <span className="h-2.5 w-2.5 border border-rule-strong rounded-full" aria-hidden="true" />;
}

export default function IntelProgress({
  lanes,
  laneCounts,
  extras,
}: {
  lanes: Record<string, LaneStatus>;
  laneCounts: Record<string, number>;
  extras: Record<string, LaneStatus>;
}) {
  const rows = [
    ...LANE_ROWS.map((r) => ({ ...r, status: lanes[r.key] ?? "pending", count: laneCounts[r.key] })),
    ...EXTRA_ROWS.map((r) => ({ ...r, status: extras[r.key] ?? "pending", count: undefined })),
  ];
  const doneCount = rows.filter((r) => r.status === "done").length;

  return (
    <div className="border border-dashed border-rule-strong bg-sheet/70 rounded-[2px] px-4 py-3.5 space-y-2.5 animate-fade-in">
      <div className="flex items-center justify-between pb-1 border-b border-rule">
        <span className="font-mono text-[10px] tracking-[0.22em] text-ink-faint">
          COLLECTING INTELLIGENCE
        </span>
        <span className="font-mono text-[10px] text-ink-faint">{doneCount}/7</span>
      </div>
      <div className="space-y-2 stagger">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2.5">
            <span className="w-2.5 flex justify-center">
              <StatusMark status={r.status} />
            </span>
            <span
              className={`font-mono text-[11px] tracking-[0.14em] ${
                r.status === "pending"
                  ? "text-ink-faint"
                  : r.status === "active"
                    ? "text-ink"
                    : "text-ink-soft"
              }`}
            >
              {r.label}
            </span>
            {r.status === "done" && r.count != null && (
              <span className="font-latin text-xs text-seal ml-auto">{r.count} 条来源</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
