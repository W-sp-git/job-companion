import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/api/client";
import type { InterviewStats, WeaknessClusters } from "@/api/types";
import { Badge, Card, CountNumber, Spinner, Stamp } from "@/components/ui";
import { modeLabel, useT } from "@/i18n";
import { useCopy } from "@/components/workspace";
import { inputBoxCls } from "@/components/ui";

const TOTAL = "__total__";
const AXIS_FONT = "PingFang SC, Hiragino Sans GB, sans-serif";
const SEAL = "#b23a24";

function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(5, 10);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ChartPoint = {
  idx: string;
  day: string;
  tipDate: string;
  mode: string;
  who: string;
  value: number | null;
};

function ChartTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload: unknown }[];
}) {
  const { t } = useT();
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as ChartPoint;
  return (
    <div className="rounded-[2px] border border-rule-strong bg-sheet px-3 py-2 space-y-1 shadow-print">
      <div className="font-mono text-[10px] tracking-wider text-ink-faint">
        {p.tipDate} · {modeLabel(t, p.mode)}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-latin text-xl leading-none text-seal">
          {p.value === null ? "—" : p.value.toFixed(1)}
        </span>
        <span className="text-xs text-ink-soft max-w-40 truncate">{p.who}</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="font-mono text-[10px] tracking-[0.18em] text-ink-faint">
        {label}
      </div>
      <div
        className={`font-latin text-3xl leading-none ${accent ? "text-seal" : "text-ink"}`}
      >
        {value}
        {unit && (
          <span className="font-kai text-xs text-ink-soft ml-1">{unit}</span>
        )}
      </div>
    </div>
  );
}

function MetricChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded-[2px] border text-xs tracking-wide transition-colors ${
        active
          ? "bg-seal text-sheet border-seal"
          : "border-rule-strong text-ink-soft hover:bg-paper-deep/70"
      }`}
    >
      {children}
    </button>
  );
}

export default function StatsPanel() {
  const { t } = useT();
  const c = useCopy();
  const [stats, setStats] = useState<InterviewStats | null>(null);
  const [clusters, setClusters] = useState<WeaknessClusters | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState(TOTAL);
  const [roleFilter, setRoleFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");

  useEffect(() => {
    api
      .get<InterviewStats>("/api/interview/stats")
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
    api
      .get<WeaknessClusters>("/api/interview/weakness-clusters")
      .then(setClusters)
      .catch(() => {});
  }, []);

  const trend = useMemo(
    () =>
      (stats?.trend ?? []).filter(
        (item) =>
          (!roleFilter || item.target_role === roleFilter) &&
          (!modeFilter || item.mode === modeFilter),
      ),
    [stats, roleFilter, modeFilter],
  );

  const chartData = useMemo<ChartPoint[]>(
    () =>
      trend.map((p, i) => ({
        idx: String(i + 1),
        day: fmtDay(p.date),
        tipDate: `${fmtDay(p.date)} ${p.date.slice(11, 16)}`,
        mode: p.mode,
        who: [p.target_role || t("home.recent.norole"), p.company]
          .filter(Boolean)
          .join(" · "),
        value: metric === TOTAL ? p.score : (p.dimensions[metric] ?? null),
      })),
    [trend, metric, t],
  );
  const dayBy = useMemo(
    () => new Map(chartData.map((d) => [d.idx, d.day])),
    [chartData],
  );
  const ov = stats?.overview;

  return (
    <Card className="lg:col-span-2 p-6 space-y-6 animate-ink-up [animation-delay:180ms]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">{t("stats.eyebrow")}</div>
          <h2 className="font-display text-2xl font-black tracking-wide">
            {t("stats.title")}
          </h2>
        </div>
        <Stamp size="md" className="shrink-0">
          {t("stats.stamp")}
        </Stamp>
      </div>

      {!!stats?.trend.length && (
        <div className="space-y-3">
          <div className="flex gap-4">
            <select
              aria-label={c("按岗位筛选趋势", "Filter trend by role")}
              className={inputBoxCls}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">{c("全部岗位", "All roles")}</option>
              {[...new Set(stats.trend.map((item) => item.target_role))]
                .filter(Boolean)
                .map((role) => (
                  <option key={role}>{role}</option>
                ))}
            </select>
            <select
              aria-label={c(
                "按面试模式筛选趋势",
                "Filter trend by interview mode",
              )}
              className={inputBoxCls}
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
            >
              <option value="">
                {c("全部面试模式", "All interview modes")}
              </option>
              {[...new Set(stats.trend.map((item) => item.mode))].map(
                (mode) => (
                  <option key={mode} value={mode}>
                    {modeLabel(t, mode)}
                  </option>
                ),
              )}
            </select>
          </div>
          <p className="text-xs text-ink-soft leading-6">
            {c(
              "下方趋势按所选岗位与模式筛选。题目难度不同，分数仅供复盘参考；固定题目的专项训练更适合观察变化。",
              "The trend follows these role and mode filters. Question difficulty varies; fixed-question practice is more useful for comparing attempts.",
            )}
          </p>
        </div>
      )}

      {loading && (
        <div className="py-10 flex items-center justify-center gap-3 font-kai text-sm text-ink-faint">
          <Spinner /> {t("stats.loading")}
        </div>
      )}

      {!loading && ov?.session_count === 0 && (
        <p className="font-kai text-sm leading-6 text-ink-faint py-6 text-center">
          {t("stats.empty")}
        </p>
      )}

      {!loading && ov && ov.session_count > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-y border-rule-strong py-4">
            <Stat
              label={t("stats.sessions")}
              value={<CountNumber value={ov.session_count} />}
              unit={t("stats.sessions.unit")}
            />
            <Stat
              label={t("stats.questions")}
              value={<CountNumber value={ov.question_count} />}
              unit={t("stats.questions.unit")}
            />
            <Stat
              label={t("stats.avg")}
              value={<CountNumber value={ov.avg_score} decimals={1} />}
              accent
            />
            <Stat
              label={t("stats.best")}
              value={<CountNumber value={ov.best_score} decimals={1} />}
              accent
            />
          </div>

          <div className="grid lg:grid-cols-5 gap-7">
            <div className="lg:col-span-3 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <MetricChip
                  active={metric === TOTAL}
                  onClick={() => setMetric(TOTAL)}
                >
                  {t("stats.metric.total")}
                </MetricChip>
                {stats.dimension_names.map((name) => (
                  <MetricChip
                    key={name}
                    active={metric === name}
                    onClick={() => setMetric(name)}
                  >
                    {name}
                  </MetricChip>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={210}>
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 10, bottom: 0, left: -16 }}
                >
                  <CartesianGrid
                    stroke="rgb(36 31 23 / 0.12)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="idx"
                    interval={0}
                    tickFormatter={(v: string) => {
                      const day = dayBy.get(v) ?? v;
                      // 同一天多场时只在首个 tick 显示日期，避免重复标签
                      return dayBy.get(String(Number(v) - 1)) === day
                        ? ""
                        : day;
                    }}
                    tick={{
                      fill: "#a79b83",
                      fontSize: 10,
                      fontFamily: AXIS_FONT,
                    }}
                    axisLine={{ stroke: "rgb(36 31 23 / 0.34)" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={metric === TOTAL ? [0, 100] : [0, 10]}
                    tick={{
                      fill: "#a79b83",
                      fontSize: 10,
                      fontFamily: AXIS_FONT,
                    }}
                    axisLine={false}
                    tickLine={false}
                    width={34}
                  />
                  <Tooltip
                    content={<ChartTip />}
                    cursor={{ stroke: "rgb(36 31 23 / 0.25)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={SEAL}
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: SEAL, strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="font-mono text-[10px] tracking-[0.14em] text-ink-faint">
                {metric === TOTAL
                  ? t("stats.scale.total")
                  : t("stats.scale.dim")}{" "}
                · {t("stats.byTime")}
                {trend.length === 1 && ` · ${t("stats.singleHint")}`}
              </p>
            </div>

            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[11px] tracking-[0.16em] text-ink-soft">
                  {t("stats.weakness.title")}
                </span>
                <span className="font-mono text-[10px] tracking-[0.14em] text-ink-faint">
                  WEAKNESS LEDGER
                </span>
              </div>
              {clusters === null ? (
                <p className="flex items-center gap-2 font-kai text-sm text-ink-faint">
                  <Spinner /> {t("stats.weakness.clustering")}
                </p>
              ) : !clusters.clustered ? (
                <p className="font-kai text-sm text-ink-faint">
                  {t("stats.weakness.unavailable")}
                </p>
              ) : clusters.themes.length === 0 ? (
                <p className="font-kai text-sm text-ink-faint">
                  {t("stats.weakness.empty")}
                </p>
              ) : (
                <div className="space-y-2">
                  {clusters.themes.slice(0, 8).map((theme) => (
                    <div
                      key={theme.theme}
                      className="flex items-center gap-2 border border-rule bg-sheet-bright rounded-[2px] px-2.5 py-1.5"
                    >
                      <span className="flex-1 text-sm leading-5">
                        {theme.theme}
                      </span>
                      {theme.count >= 2 && (
                        <Badge tone={theme.count >= 3 ? "red" : "amber"}>
                          {theme.count >= 3
                            ? t("stats.weakness.high")
                            : t("stats.weakness.recur")}{" "}
                          ×{theme.count}
                        </Badge>
                      )}
                      <span className="font-mono text-[10px] text-ink-faint shrink-0">
                        {theme.last_seen.slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
              <span className="font-mono text-[11px] tracking-[0.16em] text-ink-soft">
                {t("stats.archive.title")}
              </span>
              <span className="font-mono text-[10px] tracking-[0.14em] text-ink-faint">
                ARCHIVE
              </span>
            </div>
            <div className="max-h-72 overflow-y-auto pr-1">
              {[...trend].reverse().map((p) => (
                <div
                  key={p.session_id}
                  className="flex items-center gap-3 border-b border-rule last:border-0 py-2.5 px-1"
                >
                  <span className="font-mono text-[10px] text-ink-faint w-10 shrink-0">
                    {fmtDay(p.date)}
                  </span>
                  <Badge tone="blue" className="shrink-0">
                    {modeLabel(t, p.mode)}
                  </Badge>
                  <span className="flex-1 min-w-0 truncate text-sm">
                    {p.target_role || t("home.recent.norole")}
                    {p.company && (
                      <span className="text-ink-soft"> · {p.company}</span>
                    )}
                  </span>
                  <span className="font-mono text-[10px] text-ink-faint shrink-0">
                    {t("stats.archive.questions", { n: p.questions })}
                  </span>
                  <span className="font-latin text-xl leading-none text-seal w-11 text-right shrink-0">
                    {p.score.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
