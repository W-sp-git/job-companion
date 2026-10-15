import { useT } from "@/i18n";
import type { MessageKey } from "@/i18n/messages";
import type { LaneStatus } from "@/stores/intelStore";

const LANE_ROWS: { key: string; labelKey: MessageKey }[] = [
  { key: "hiring", labelKey: "intel.progress.lane.hiring" },
  { key: "salary", labelKey: "intel.progress.lane.salary" },
  { key: "process", labelKey: "intel.progress.lane.process" },
  { key: "risk", labelKey: "intel.progress.lane.risk" },
];

const EXTRA_ROWS: { key: string; labelKey: MessageKey }[] = [
  { key: "extract", labelKey: "intel.progress.extract" },
  { key: "verify", labelKey: "intel.progress.verify" },
  { key: "save", labelKey: "intel.progress.save" },
];

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
  const { t } = useT();
  const rows = [
    ...LANE_ROWS.map((r) => ({ ...r, status: lanes[r.key] ?? "pending", count: laneCounts[r.key] })),
    ...EXTRA_ROWS.map((r) => ({ ...r, status: extras[r.key] ?? "pending", count: undefined })),
  ];
  const doneCount = rows.filter((r) => r.status === "done").length;

  return (
    <div className="border border-dashed border-rule-strong bg-sheet/70 rounded-[2px] px-4 py-3.5 space-y-2.5 animate-fade-in">
      <div className="flex items-center justify-between pb-1 border-b border-rule">
        <span className="font-mono text-[10px] tracking-[0.22em] text-ink-faint">
          {t("intel.progress.header")}
        </span>
        <span className="font-mono text-[10px] text-ink-faint">
          {doneCount}/{rows.length}
        </span>
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
              {t(r.labelKey)}
            </span>
            {r.status === "done" && r.count != null && (
              <span className="font-latin text-xs text-seal ml-auto">
                {t("intel.progress.count", { n: r.count })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
