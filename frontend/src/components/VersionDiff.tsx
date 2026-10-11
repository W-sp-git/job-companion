import { diffLines } from "diff";

import type { ResumeVersion } from "@/api/types";
import { draftToText } from "@/lib/resumeText";

export default function VersionDiff({
  current,
  previous,
  onClose,
}: {
  current: ResumeVersion;
  previous: ResumeVersion | null;
  onClose: () => void;
}) {
  const currText = draftToText(current.draft_json);
  const parts = previous
    ? diffLines(draftToText(previous.draft_json), currText)
    : [{ added: true, removed: undefined, value: currText }];

  return (
    <div className="fixed inset-0 z-30 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-sm">
            版本对比：{previous ? `v${previous.version_no} → v${current.version_no}` : `v${current.version_no}（首个版本）`}
          </h3>
          <button className="text-neutral-400 hover:text-white text-sm" onClick={onClose}>
            关闭
          </button>
        </div>
        <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono">
          {parts.map((p, i) => (
            <span
              key={i}
              className={
                p.added
                  ? "text-emerald-400 bg-emerald-950/40"
                  : p.removed
                    ? "text-red-400 bg-red-950/40 line-through"
                    : "text-neutral-400"
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
