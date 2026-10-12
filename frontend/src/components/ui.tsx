import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

/* ---------- 按钮：印章红块 / 墨线描边 / 红描边 ---------- */
export function Button({
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary:
      "bg-seal text-sheet border border-seal-deep shadow-print hover:bg-seal-deep active:translate-x-[2px] active:translate-y-[2px] active:shadow-press",
    ghost:
      "bg-transparent text-ink border border-rule-strong hover:bg-paper-deep/70 active:translate-x-[2px] active:translate-y-[2px]",
    danger:
      "bg-transparent text-seal border border-seal hover:bg-seal-wash active:translate-x-[2px] active:translate-y-[2px]",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 px-3.5 py-2 rounded-[2px] text-sm font-medium tracking-wide transition-all duration-150 disabled:opacity-40 disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-print ${styles} ${className}`}
      {...props}
    />
  );
}

/* ---------- 纸张卡片 ---------- */
export function Card({
  className = "",
  children,
  hover = false,
  fold = false,
  tapeClass,
}: {
  className?: string;
  children: ReactNode;
  hover?: boolean;
  fold?: boolean;
  tapeClass?: string;
}) {
  return (
    <div className={`sheet p-4 ${hover ? "sheet-hover" : ""} ${fold ? "corner-fold overflow-hidden" : ""} ${className}`}>
      {tapeClass && <span className={`tape ${tapeClass}`} aria-hidden="true" />}
      {children}
    </div>
  );
}

/* ---------- 印刷标签 ---------- */
export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red" | "blue";
  className?: string;
}) {
  const tones = {
    neutral: "border-rule-strong text-ink-soft",
    green: "border-moss/55 text-moss bg-moss/5",
    amber: "border-ochre/55 text-ochre bg-ochre/5",
    red: "border-seal/55 text-seal bg-seal/5",
    blue: "border-indigo/55 text-indigo bg-indigo/5",
  }[tone];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded-[2px] border text-[11px] leading-5 tracking-wide ${tones} ${className}`}
    >
      {children}
    </span>
  );
}

/* ---------- 表单题头 ---------- */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">
        <span className="text-seal">▪</span>
        {label}
      </span>
      {children}
    </label>
  );
}

/* ---------- 表单控件样式 ---------- */
export const inputCls = "input-line";
export const inputBoxCls = "paper-input";

/* ---------- 印刷滚轮（加载中）---------- */
export function Spinner() {
  return <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-dashed border-seal animate-spin" />;
}

/* ---------- 圆形印章 ---------- */
export function Stamp({
  children,
  tone = "seal",
  size = "md",
  animate = false,
  className = "",
}: {
  children: ReactNode;
  tone?: "seal" | "moss" | "ink" | "ochre";
  size?: "sm" | "md" | "lg" | "xl";
  animate?: boolean;
  className?: string;
}) {
  const tones = { seal: "text-seal", moss: "text-moss", ink: "text-ink-soft", ochre: "text-ochre" }[tone];
  const sizes = {
    sm: "h-8 w-8 text-[11px]",
    md: "h-12 w-12 text-[13px]",
    lg: "h-20 w-20 text-xl",
    xl: "h-32 w-32 text-4xl",
  }[size];
  return (
    <span className={`stamp ${tones} ${sizes} ${animate ? "animate-stamp-in" : ""} ${className}`} aria-hidden="true">
      {children}
    </span>
  );
}

/* ---------- 台账行（标签 ……… 值）---------- */
export function LeaderRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="shrink-0 text-ink-soft">{label}</span>
      <span className="h-px min-w-4 flex-1 self-center border-b border-dotted border-rule-strong translate-y-[-2px]" />
      <span className="shrink-0 text-right">{children}</span>
    </div>
  );
}

/* ---------- 数字滚动（墨迹未干，数字先跑）---------- */
export function CountNumber({
  value,
  decimals = 0,
  duration = 750,
  className = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !Number.isFinite(value)) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className={className}>{display.toFixed(decimals)}</span>;
}
