import { diffLines } from "diff";

import type { ResumeVersion } from "@/api/types";
import { draftToText } from "@/lib/resumeText";
import { useT } from "@/i18n";

export default function VersionDiff({
  current,
  previous,
  onClose,
}: {
  current: ResumeVersion;
  previous: ResumeVersion | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const currText = draftToText(current.draft_json);
  const parts = previous
    ? diffLines(draftToText(previous.draft_json), currText)
    : [{ added: true, removed: undefined, value: currText }];

  return (
    <div
      className="fixed inset-0 z-30 bg-ink/45 backdrop-blur-[2px] flex items-center justify-center p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="sheet w-full max-w-3xl max-h-[85vh] overflow-y-auto p-5 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="eyebrow mb-1">{t("diff.eyebrow")}</div>
            <h3 className="font-display text-base font-bold">
              {t("diff.title")}
              {previous
                ? `v${previous.version_no} → v${current.version_no}`
                : t("diff.firstVersion", { n: current.version_no })}
            </h3>
          </div>
          <button
            className="font-mono text-[11px] tracking-[0.14em] text-ink-soft hover:text-seal transition-colors"
            onClick={onClose}
          >
            {t("common.close")}
          </button>
        </div>
        <div className="flex items-center gap-4 border-y border-rule py-1.5 mb-4 font-mono text-[10px] tracking-[0.14em] text-ink-faint">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 bg-moss/25 border border-moss/50" /> {t("diff.added")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 bg-seal/15 border border-seal/50" /> {t("diff.removed")}
          </span>
        </div>
        <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {parts.map((p, i) => (
            <span
              key={i}
              className={
                p.added
                  ? "text-moss bg-moss/8"
                  : p.removed
                    ? "text-seal bg-seal/8 line-through decoration-seal/60"
                    : "text-ink-soft"
              }
            >
              {p.value}
            </span>
          ))}
        </pre>
      </div>
    </div>
  );
}
