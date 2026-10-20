import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { JobStatus } from "@/api/types";
import { useT } from "@/i18n";
import { Button } from "@/components/ui";

export function useCopy() {
  const { locale } = useT();
  return (zh: string, en: string) => (locale === "zh" ? zh : en);
}

export function useResource<T>(url: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestNo = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++requestNo.current;
    setLoading(true);
    setError("");
    try {
      const result = await api.get<T>(url);
      if (sequence === requestNo.current) setData(result);
      return result;
    } catch (e) {
      if (sequence === requestNo.current) setError(String(e));
      return undefined;
    } finally {
      if (sequence === requestNo.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void refresh();
    return () => {
      ++requestNo.current;
    };
  }, [refresh]);
  return { data, setData, loading, error, refresh };
}

export function PageHeading({
  index,
  title,
  description,
  action,
}: {
  index: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-8 border-b-2 border-ink pb-5 mb-7">
      <div>
        <div className="eyebrow mb-3">{index}</div>
        <h1 className="font-display text-3xl font-black tracking-wide">
          {title}
        </h1>
        <p className="text-sm leading-6 text-ink-soft mt-3 max-w-2xl">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const c = useCopy();
  if (!message) return null;
  return (
    <div
      role="alert"
      className="border-l-2 border-seal bg-seal-wash p-3 text-sm leading-6 flex items-center justify-between gap-4"
    >
      <span>{message}</span>
      {retry && (
        <Button variant="ghost" onClick={retry}>
          {c("重试", "Retry")}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  to,
  action,
}: {
  title: string;
  children: ReactNode;
  to?: string;
  action?: string;
}) {
  return (
    <div className="border-y border-dashed border-rule-strong py-12 px-6 text-center">
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-ink-soft max-w-lg mx-auto">
        {children}
      </p>
      {to && (
        <Link
          to={to}
          className="inline-block mt-5 text-seal underline underline-offset-4"
        >
          {action}
        </Link>
      )}
    </div>
  );
}

export function LoadingRows() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="space-y-5 py-4 animate-pulse"
    >
      {[70, 95, 80].map((width) => (
        <div
          key={width}
          className="h-12 bg-ink/5 border-b border-rule"
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  );
}

export const JOB_STATUSES: JobStatus[] = [
  "saved",
  "preparing",
  "applied",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
];
const STATUS_LABELS = {
  saved: ["已收藏", "Saved"],
  preparing: ["准备投递", "Preparing"],
  applied: ["已投递·待回复", "Applied · awaiting reply"],
  assessment: ["笔试 / 测评", "Assessment"],
  interview: ["面试中", "Interviewing"],
  offer: ["收到 Offer", "Offer received"],
  rejected: ["明确未通过", "Rejected"],
  withdrawn: ["已撤回", "Withdrawn"],
};
export function jobStatusLabel(
  status: JobStatus,
  c: (zh: string, en: string) => string,
) {
  const pair = STATUS_LABELS[status];
  return c(pair[0], pair[1]);
}
export function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
