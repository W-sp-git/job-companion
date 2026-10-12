import { useNavigate } from "react-router-dom";

import type { IntelReportPayload, IntelSource } from "@/api/types";
import { Badge, Button, Card, Stamp } from "@/components/ui";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function RefChips({ sources }: { sources: IntelSource[] }) {
  if (!sources?.length) return null;
  return (
    <span className="inline-flex gap-0.5 ml-1">
      {sources.map((s) => (
        <a
          key={s.sid}
          href={`#intel-src-${s.sid}`}
          title={s.title}
          className="font-mono text-[9px] text-ink-faint hover:text-seal transition-colors"
        >
          [S{s.sid}]
        </a>
      ))}
    </span>
  );
}

function UnverifiedBadge({ status }: { status: string }) {
  if (status !== "unverified") return null;
  return (
    <Badge tone="amber" className="shrink-0">
      未经佐证
    </Badge>
  );
}

function SectionTitle({ no, title, en }: { no: string; title: string; en: string }) {
  return (
    <div className="flex items-end justify-between border-b border-ink pb-1.5 mb-3">
      <span className="font-display text-sm font-bold tracking-[0.1em]">
        <span className="font-latin text-seal mr-1.5">{no}</span>
        {title}
      </span>
      <span className="font-mono text-[9px] tracking-[0.22em] text-ink-faint">{en}</span>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="font-kai text-xs text-ink-faint">{text}</p>;
}

export default function IntelReportCard({
  payload,
  onNew,
}: {
  payload: IntelReportPayload;
  onNew: () => void;
}) {
  const navigate = useNavigate();
  const { report, verification, sources, company, target_role, report_id, created_at } = payload;
  const dateStr = created_at ? created_at.slice(0, 10).replace(/-/g, "") : "00000000";
  const coveragePct = Math.round(verification.coverage * 100);

  return (
    <Card className="p-6 space-y-7 animate-ink-up" fold>
      {/* 刊头 */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow mb-2">Intelligence Brief · 情报简报</div>
          <h2 className="font-display text-2xl font-black tracking-wide truncate">{company}</h2>
          <div className="font-mono text-[10px] tracking-[0.14em] text-ink-faint mt-2 space-x-3">
            <span>
              NO. INTEL-{dateStr}-{String(report_id).padStart(3, "0")}
            </span>
            {target_role && <span>岗位 {target_role}</span>}
            <span>来源 {sources.length} 条</span>
          </div>
        </div>
        <Stamp size="lg" className="shrink-0">
          情报
        </Stamp>
      </div>

      {/* 核要 */}
      <div className="border border-rule-strong bg-sheet-bright rounded-[2px] p-4">
        <p className="font-kai text-sm leading-7">
          {report.summary || "（核要生成失败）"}
          <RefChips sources={report.summary_sources} />
        </p>
        <div className="flex items-center pt-2.5 mt-2.5 border-t border-dotted border-rule-strong">
          <Badge tone={coveragePct >= 90 ? "green" : "amber"}>
            防虚构校验 {verification.verified}/{verification.total_claims} 条有公开来源佐证
          </Badge>
        </div>
      </div>

      {/* 一 · 基本面 */}
      <section>
        <SectionTitle no="一" title="公司基本面" en="BASICS" />
        <div className="space-y-2.5">
          {report.basics.map((b, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 text-sm leading-6 ${b.status === "unverified" ? "opacity-60" : ""}`}
            >
              <span className="text-seal mt-0.5 shrink-0">▪</span>
              <p className="flex-1">
                {b.text}
                <RefChips sources={b.sources} />
              </p>
              <UnverifiedBadge status={b.status} />
            </div>
          ))}
          {!report.basics.length && <EmptyNote text="未找到可靠的公司基本面信息。" />}
        </div>
      </section>

      {/* 二 · 在招岗位 */}
      <section>
        <SectionTitle no="二" title="在招岗位与趋势" en="HIRING" />
        <div className="space-y-2">
          {report.hiring.map((h, i) => (
            <div
              key={i}
              className={`border border-rule bg-sheet-bright rounded-[2px] px-3 py-2 ${h.status === "unverified" ? "opacity-60" : ""}`}
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-medium">{h.position}</span>
                {h.location && <Badge tone="blue">{h.location}</Badge>}
                <span className="ml-auto">
                  <UnverifiedBadge status={h.status} />
                </span>
              </div>
              {h.trend && (
                <p className="font-kai text-xs text-ink-soft leading-5 mt-1">
                  {h.trend}
                  <RefChips sources={h.sources} />
                </p>
              )}
            </div>
          ))}
          {!report.hiring.length && <EmptyNote text="未检索到明确的在招岗位信息。" />}
        </div>
      </section>

      {/* 三 · 薪资 */}
      <section>
        <SectionTitle no="三" title="薪资待遇" en="SALARY" />
        <div className="space-y-3.5">
          {report.salary.map((s, i) => (
            <div key={i} className={s.status === "unverified" ? "opacity-60" : ""}>
              {s.role_hint && (
                <div className="font-mono text-[10px] tracking-[0.14em] text-ink-faint mb-1">
                  {s.role_hint}
                </div>
              )}
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-latin text-2xl leading-tight text-seal">{s.range_text}</span>
                <UnverifiedBadge status={s.status} />
                <RefChips sources={s.sources} />
              </div>
              {s.notes && (
                <p className="font-kai text-xs text-ink-soft leading-5 mt-1">{s.notes}</p>
              )}
            </div>
          ))}
          {!report.salary.length && <EmptyNote text="公开来源中没有可引用的薪资数据。" />}
        </div>
      </section>

      {/* 四 · 面试流程 */}
      <section>
        <SectionTitle no="四" title="面试流程与真题风格" en="PROCESS" />
        <div className="space-y-3">
          {report.process.map((p, i) => (
            <div key={i} className={`flex gap-3 ${p.status === "unverified" ? "opacity-60" : ""}`}>
              <span className="font-latin text-lg text-seal leading-6 shrink-0 w-5 text-right">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{p.stage}</span>
                  <UnverifiedBadge status={p.status} />
                </div>
                <p className="font-kai text-xs text-ink-soft leading-6 mt-0.5">
                  {p.detail}
                  <RefChips sources={p.sources} />
                </p>
              </div>
            </div>
          ))}
          {!report.process.length && <EmptyNote text="未检索到面试流程与面经信息。" />}
        </div>
      </section>

      {/* 五 · 风险信号 */}
      <section className="border-l-4 border-seal bg-seal-wash/60 rounded-[2px] p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-display text-sm font-bold tracking-[0.1em] text-seal">五 · 风险信号</span>
          <Stamp size="sm">红线</Stamp>
        </div>
        {report.risks.length ? (
          <div className="space-y-3">
            {report.risks.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm leading-6">
                <Badge tone="red" className="shrink-0 mt-0.5">
                  {r.category}
                </Badge>
                <p className="flex-1">
                  {r.text}
                  <RefChips sources={r.sources} />
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="font-kai text-sm leading-6 text-ink-soft">
            本次检索未发现公开负面信号（不代表该公司无相关风险）。
          </p>
        )}
        <p className="font-mono text-[10px] text-ink-faint mt-3 pt-2 border-t border-seal/20">
          本节仅为公开信息摘录，不构成任何评价或建议。
        </p>
      </section>

      {/* 参考来源 */}
      <section>
        <SectionTitle no="附" title="参考来源" en="SOURCES" />
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          {sources.map((s) => (
            <div
              key={s.sid}
              id={`intel-src-${s.sid}`}
              className="flex items-baseline gap-2 text-xs leading-5 scroll-mt-28"
            >
              <span className="font-mono text-[10px] text-seal shrink-0">[S{s.sid}]</span>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                title={s.title}
                className="flex-1 min-w-0 truncate text-ink-soft hover:text-seal transition-colors"
              >
                {s.title || s.url}
              </a>
              <span className="font-mono text-[9px] text-ink-faint shrink-0">
                {hostOf(s.url)}
                {s.date ? ` · ${s.date}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 校验摘要 */}
      <div className="border-t border-rule pt-3 space-y-1.5">
        <p className="font-mono text-[10px] tracking-[0.14em] text-ink-faint">
          防虚构校验 {verification.verified}/{verification.total_claims} 条 · 检索来源{" "}
          {verification.evidence_total} 条
          {verification.dropped_risk > 0 && ` · 剔除 ${verification.dropped_risk} 条无来源风险线索`}
        </p>
        {verification.notes.map((n, i) => (
          <p key={i} className="font-kai text-[11px] text-ink-faint">
            · {n}
          </p>
        ))}
      </div>

      {/* 底部动作 */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() =>
            navigate(
              `/interview?company=${encodeURIComponent(company)}&role=${encodeURIComponent(target_role)}`,
            )
          }
          disabled={!target_role}
          title={target_role ? "" : "背调时未指定岗位，无法带情报去面试"}
        >
          带这份情报去模拟面试
        </Button>
        <Button variant="ghost" onClick={onNew}>
          重新背调
        </Button>
      </div>
    </Card>
  );
}
