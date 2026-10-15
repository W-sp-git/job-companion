import { Link } from "react-router-dom";

import type { IntelReportMeta } from "@/api/types";
import { Badge } from "@/components/ui";
import { useT } from "@/i18n";
import type { MessageKey } from "@/i18n/messages";

const STATUS_META: Record<
  string,
  { label: MessageKey; tone: "green" | "red" | "blue" | "neutral" }
> = {
  done: { label: "intel.archive.status.done", tone: "green" },
  failed: { label: "intel.archive.status.failed", tone: "red" },
  running: { label: "intel.archive.status.running", tone: "blue" },
  created: { label: "intel.archive.status.created", tone: "neutral" },
};

function fmtDay(iso: string): string {
  return iso.slice(5, 10);
}

export default function IntelArchiveList({
  items,
  activeId,
}: {
  items: IntelReportMeta[];
  activeId?: number | null;
}) {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between border-b-2 border-ink pb-2">
        <h3 className="font-display text-base font-bold tracking-wide">{t("intel.archive.title")}</h3>
        <span className="font-mono text-[10px] tracking-[0.22em] text-ink-faint">INTEL ARCHIVE</span>
      </div>
      {items.length === 0 && (
        <p className="font-kai text-xs text-ink-faint">{t("intel.archive.empty")}</p>
      )}
      <div className="space-y-2 stagger">
        {items.map((r) => {
          const meta = STATUS_META[r.status] ?? STATUS_META.created;
          return (
            <Link key={r.id} to={`/intel/${r.id}`} className="block group">
              <div
                className={`border rounded-[2px] px-3 py-2.5 transition-all duration-150 group-hover:-translate-x-[1px] group-hover:-translate-y-[1px] group-hover:shadow-print ${
                  activeId === r.id
                    ? "border-seal/70 bg-seal-wash/40"
                    : "border-rule-strong bg-sheet group-hover:border-seal/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate group-hover:text-ink transition-colors">
                    {r.company}
                    {r.target_role && <span className="text-ink-faint"> · {r.target_role}</span>}
                  </span>
                  <Badge tone={meta.tone} className="shrink-0">
                    {t(meta.label)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="font-mono text-[10px] text-ink-faint">
                    {t("intel.archive.no", { no: String(r.id).padStart(3, "0"), date: fmtDay(r.created_at) })}
                  </span>
                  {r.status === "done" && r.source_count > 0 && (
                    <span className="font-mono text-[10px] text-ink-faint">
                      {t("intel.archive.sources", { n: r.source_count })}
                    </span>
                  )}
                </div>
                {r.summary && (
                  <p className="font-kai text-[11px] leading-4 text-ink-soft mt-1.5 line-clamp-2">
                    {r.summary}
                  </p>
                )}
                {r.status === "failed" && r.error && (
                  <p className="font-kai text-[11px] leading-4 text-seal mt-1.5 line-clamp-2">
                    {r.error}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
