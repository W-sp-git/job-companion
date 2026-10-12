export default function StageIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 w-fit border border-dashed border-rule-strong bg-sheet/70 px-3 py-2 rounded-[2px] animate-fade-in">
      <span className="h-2 w-2 bg-seal animate-press-pulse" aria-hidden="true" />
      <span className="font-mono text-[11px] tracking-[0.14em] text-ink-soft">{label}</span>
    </div>
  );
}
