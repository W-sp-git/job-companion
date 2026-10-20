import { useNavigate } from "react-router-dom";

import type { IntelReportPayload, IntelSource } from "@/api/types";
import { Badge, Button, Card, Stamp } from "@/components/ui";
import { useT } from "@/i18n";
import type { MessageKey } from "@/i18n/messages";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function RefChips({
  sources,
  quote,
}: {
  sources: IntelSource[];
  quote?: string;
}) {
  if (!sources?.length) return null;
  return (
    <span className="inline-flex gap-0.5 ml-1">
      {sources.map((s) => (
        <a
          key={s.sid}
          href={`#intel-src-${s.sid}`}
          title={quote ? `${s.title}\n${quote}` : s.title}
          className="font-mono text-[9px] text-ink-faint hover:text-seal transition-colors"
        >
          [S{s.sid}]
        </a>
      ))}
    </span>
  );
}

function UnverifiedBadge({ status }: { status: string }) {
  const { t } = useT();
  if (status !== "unverified") return null;
  return (
    <Badge tone="amber" className="shrink-0">
      {t("intel.brief.unverified")}
    </Badge>
  );
}

function SectionTitle({ titleKey, en }: { titleKey: MessageKey; en: string }) {
  const { t } = useT();
  return (
    <div className="flex items-end justify-between border-b border-ink pb-1.5 mb-3">
      <span className="font-display text-sm font-bold tracking-[0.1em]">
        {t(titleKey)}
      </span>
      <span className="font-mono text-[9px] tracking-[0.22em] text-ink-faint">
        {en}
      </span>
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
  const { t } = useT();
  const navigate = useNavigate();
  const {
    report,
    verification,
    sources,
    company,
    target_role,
    report_id,
    created_at,
  } = payload;
  const dateStr = created_at
    ? created_at.slice(0, 10).replace(/-/g, "")
    : "00000000";
  const coveragePct = Math.round(verification.coverage * 100);

  return (
    <Card className="p-6 space-y-7 animate-ink-up" fold>
      {/* 刊头 */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow mb-2">{t("intel.brief.eyebrow")}</div>
          <h2 className="font-display text-2xl font-black tracking-wide truncate">
            {company}
          </h2>
          <div className="font-mono text-[10px] tracking-[0.14em] text-ink-faint mt-2 space-x-3">
            <span>
              {t("intel.brief.no", {
                date: dateStr,
                id: String(report_id).padStart(3, "0"),
              })}
            </span>
            {target_role && (
              <span>{t("intel.brief.role", { role: target_role })}</span>
            )}
            <span>{t("intel.brief.sources", { n: sources.length })}</span>
          </div>
        </div>
        <Stamp size="lg" className="shrink-0">
          {t("intel.brief.stamp")}
        </Stamp>
      </div>

      {/* 核要 */}
      <div className="border border-rule-strong bg-sheet-bright rounded-[2px] p-4">
        <p className="font-kai text-sm leading-7">
          {report.summary || t("intel.brief.summaryEmpty")}
          <RefChips sources={report.summary_sources} />
        </p>
        <div className="flex items-center pt-2.5 mt-2.5 border-t border-dotted border-rule-strong">
          <Badge tone={coveragePct >= 90 ? "green" : "amber"}>
            {t("intel.brief.verified", {
              ok: verification.verified,
              total: verification.total_claims,
            })}
          </Badge>
        </div>
      </div>

      {/* 一 · 基本面 */}
      <section>
        <SectionTitle titleKey="intel.brief.s1" en="BASICS" />
        <div className="space-y-2.5">
          {report.basics.map((b, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 text-sm leading-6 ${b.status === "unverified" ? "opacity-60" : ""}`}
            >
              <span className="text-seal mt-0.5 shrink-0">▪</span>
              <p className="flex-1">
                {b.text}
                <RefChips sources={b.sources} quote={b.evidence_quote} />
              </p>
              <UnverifiedBadge status={b.status} />
            </div>
          ))}
          {!report.basics.length && (
            <EmptyNote text={t("intel.brief.noBasics")} />
          )}
        </div>
      </section>

      {/* 二 · 在招岗位 */}
      <section>
        <SectionTitle titleKey="intel.brief.s2" en="HIRING" />
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
                  <RefChips sources={h.sources} quote={h.evidence_quote} />
                </p>
              )}
            </div>
          ))}
          {!report.hiring.length && (
            <EmptyNote text={t("intel.brief.noHiring")} />
          )}
        </div>
      </section>

      {/* 三 · 薪资 */}
      <section>
        <SectionTitle titleKey="intel.brief.s3" en="SALARY" />
        <div className="space-y-3.5">
          {report.salary.map((s, i) => (
            <div
              key={i}
              className={s.status === "unverified" ? "opacity-60" : ""}
            >
              {s.role_hint && (
                <div className="font-mono text-[10px] tracking-[0.14em] text-ink-faint mb-1">
                  {s.role_hint}
                </div>
              )}
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-latin text-2xl leading-tight text-seal">
                  {s.range_text}
                </span>
                <UnverifiedBadge status={s.status} />
                <RefChips sources={s.sources} quote={s.evidence_quote} />
              </div>
              {s.notes && (
                <p className="font-kai text-xs text-ink-soft leading-5 mt-1">
                  {s.notes}
                </p>
              )}
            </div>
          ))}
          {!report.salary.length && (
            <EmptyNote text={t("intel.brief.noSalary")} />
          )}
        </div>
      </section>

      {/* 四 · 面试流程 */}
      <section>
        <SectionTitle titleKey="intel.brief.s4" en="PROCESS" />
        <div className="space-y-3">
          {report.process.map((p, i) => (
            <div
              key={i}
              className={`flex gap-3 ${p.status === "unverified" ? "opacity-60" : ""}`}
            >
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
                  <RefChips sources={p.sources} quote={p.evidence_quote} />
                </p>
              </div>
            </div>
          ))}
          {!report.process.length && (
            <EmptyNote text={t("intel.brief.noProcess")} />
          )}
        </div>
      </section>

      {/* 五 · 风险信号 */}
      <section className="border-l-4 border-seal bg-seal-wash/60 rounded-[2px] p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-display text-sm font-bold tracking-[0.1em] text-seal">
            {t("intel.brief.s5")}
          </span>
          <Stamp size="sm">{t("intel.brief.redline")}</Stamp>
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
                  <RefChips sources={r.sources} quote={r.evidence_quote} />
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="font-kai text-sm leading-6 text-ink-soft">
            {t("intel.brief.noRisk")}
          </p>
        )}
        <p className="font-mono text-[10px] text-ink-faint mt-3 pt-2 border-t border-seal/20">
          {t("intel.brief.disclaimer")}
        </p>
      </section>

      {/* 参考来源 */}
      <section>
        <SectionTitle titleKey="intel.brief.appendix" en="SOURCES" />
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          {sources.map((s) => (
            <div
              key={s.sid}
              id={`intel-src-${s.sid}`}
              className="flex items-baseline gap-2 text-xs leading-5 scroll-mt-28"
            >
              <span className="font-mono text-[10px] text-seal shrink-0">
                [S{s.sid}]
              </span>
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
          {t("intel.brief.verifyLine", {
            ok: verification.verified,
            total: verification.total_claims,
            evidence: verification.evidence_total,
          })}
          {verification.dropped_risk > 0 &&
            t("intel.brief.verifyDropped", { n: verification.dropped_risk })}
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
              `/interview?company=${encodeURIComponent(company)}&role=${encodeURIComponent(target_role)}&intel=${report_id}`,
            )
          }
          disabled={!target_role}
          title={target_role ? "" : t("intel.brief.toInterviewHint")}
        >
          {t("intel.brief.toInterview")}
        </Button>
        <Button variant="ghost" onClick={onNew}>
          {t("intel.brief.again")}
        </Button>
      </div>
    </Card>
  );
}
