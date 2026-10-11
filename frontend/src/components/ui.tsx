import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-emerald-600 hover:bg-emerald-500 text-white",
    ghost: "bg-neutral-800 hover:bg-neutral-700 text-neutral-200",
    danger: "bg-red-600/90 hover:bg-red-500 text-white",
  }[variant];
  return (
    <button
      className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 ${className}`}>{children}</div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red" | "blue";
}) {
  const tones = {
    neutral: "bg-neutral-800 text-neutral-300",
    green: "bg-emerald-900/60 text-emerald-300",
    amber: "bg-amber-900/60 text-amber-300",
    red: "bg-red-900/60 text-red-300",
    blue: "bg-blue-900/60 text-blue-300",
  }[tone];
  return <span className={`inline-block px-2 py-0.5 rounded text-xs ${tones}`}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:border-emerald-600 placeholder:text-neutral-600";

export function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-500 border-t-transparent align-middle" />
  );
}
