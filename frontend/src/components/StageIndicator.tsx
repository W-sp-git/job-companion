import { Spinner } from "@/components/ui";

export default function StageIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-400 bg-neutral-900/80 border border-neutral-800 rounded-lg px-3 py-2 w-fit">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}
