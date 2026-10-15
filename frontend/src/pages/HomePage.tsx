import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "@/api/client";
import type { SessionInfo } from "@/api/types";
import { Badge, Card, Stamp } from "@/components/ui";
import { modeLabel, useT } from "@/i18n";
import type { MessageKey } from "@/i18n/messages";

const ENTRIES: { to: string; title: MessageKey; desc: MessageKey; en: MessageKey }[] = [
  { to: "/interview", title: "home.entry1.title", desc: "home.entry1.desc", en: "home.entry1.en" },
  { to: "/resume", title: "home.entry2.title", desc: "home.entry2.desc", en: "home.entry2.en" },
  { to: "/profile", title: "home.entry3.title", desc: "home.entry3.desc", en: "home.entry3.en" },
];

export default function HomePage() {
  const { t } = useT();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    api
      .get<SessionInfo[]>("/api/interview/sessions")
      .then(setSessions)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-12 pb-4">
      {/* ============ 封面 ============ */}
      <section className="relative pt-10 pb-10 text-center overflow-hidden">
        <span
          className="pointer-events-none select-none absolute left-1/2 top-[-30px] -translate-x-1/2 font-display font-black text-[300px] leading-none text-ink/[0.035]"
          aria-hidden="true"
        >
          录
        </span>
        <Stamp size="xl" animate className="hidden md:inline-flex absolute right-[6%] top-8">
          {t("home.stamp.landed")}
        </Stamp>
        <Stamp size="md" animate className="hidden lg:inline-flex absolute left-[8%] bottom-10 rotate-[6deg]">
          {t("home.stamp.campus")}
        </Stamp>

        <div className="relative">
          <div className="flex items-center justify-center gap-4 font-mono text-[10px] uppercase tracking-[0.32em] text-ink-faint animate-ink-up">
            <span>{t("home.masthead.a")}</span>
            <span className="h-1.5 w-1.5 bg-seal" />
            <span>{t("home.masthead.b")}</span>
          </div>

          <div className="mt-7 flex items-center gap-4 animate-ink-up [animation-delay:80ms]">
            <span className="h-px flex-1 bg-rule-strong" />
            <span className="font-latin text-xs tracking-[0.4em] text-ink-soft whitespace-nowrap">
              {t("home.banner")}
            </span>
            <span className="h-px flex-1 bg-rule-strong" />
          </div>

          <h1 className="mt-4 font-display font-black text-[52px] md:text-[84px] leading-none tracking-[0.08em] animate-ink-up [animation-delay:150ms]">
            {t("home.title")}
          </h1>

          <p className="mt-6 text-sm leading-7 text-ink-soft animate-ink-up [animation-delay:220ms]">
            {t("home.tagline.a")}
            <br />
            {t("home.tagline.b")}
          </p>
        </div>
      </section>

      {/* ============ 目录 ============ */}
      <section>
        <div className="flex items-end justify-between border-b-2 border-ink pb-2 mb-5">
          <h2 className="font-display text-xl font-bold tracking-[0.1em]">{t("home.contents")}</h2>
          <span className="font-mono text-[10px] tracking-[0.24em] text-ink-faint">
            {t("home.contents.en")}
          </span>
        </div>
        <div className="grid md:grid-cols-3 gap-5 stagger">
          {ENTRIES.map((f, i) => (
            <Link key={f.to} to={f.to} className="group">
              <Card hover fold className="h-full">
                <div className="flex items-start justify-between mb-4">
                  <span className="font-latin text-4xl leading-none text-seal">0{i + 1}</span>
                  <span className="font-mono text-[10px] tracking-[0.2em] text-ink-faint mt-1">
                    {t(f.en)}
                  </span>
                </div>
                <h3 className="font-display text-xl font-bold tracking-wide mb-2.5">{t(f.title)}</h3>
                <p className="text-sm leading-6 text-ink-soft">{t(f.desc)}</p>
                <div className="mt-5 font-mono text-[11px] tracking-[0.2em] text-ink-faint group-hover:text-seal transition-colors">
                  {t("home.enter")}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ============ 近期战绩 ============ */}
      {sessions.length > 0 && (
        <section>
          <div className="flex items-end justify-between border-b-2 border-ink pb-2 mb-1">
            <h2 className="font-display text-xl font-bold tracking-[0.1em]">{t("home.recent")}</h2>
            <span className="font-mono text-[10px] tracking-[0.24em] text-ink-faint">
              {t("home.recent.en")}
            </span>
          </div>
          <div className="divide-y divide-rule stagger">
            {sessions.slice(0, 5).map((s) => (
              <Link key={s.id} to={`/interview/${s.id}`} className="block group">
                <div className="flex items-center gap-3 py-3">
                  <Badge>{modeLabel(t, s.mode)}</Badge>
                  <span className="truncate text-sm group-hover:text-seal transition-colors">
                    {s.target_role || t("home.recent.norole")}
                  </span>
                  <span className="hidden sm:block flex-1 border-b border-dotted border-rule-strong translate-y-[-2px]" />
                  <span className="font-mono text-[10px] text-ink-faint shrink-0 hidden md:inline">
                    {new Date(s.created_at).toLocaleString()}
                  </span>
                  <span className="shrink-0 w-16 text-right">
                    {s.total_score != null ? (
                      <span className="font-latin text-xl text-seal">
                        {Math.round(Number(s.total_score))}
                        <span className="font-mono text-[10px] text-ink-faint ml-1">
                          {t("home.recent.score")}
                        </span>
                      </span>
                    ) : (
                      <Badge tone={s.status === "finished" ? "green" : "blue"}>
                        {s.status === "finished" ? t("home.recent.finished") : t("home.recent.running")}
                      </Badge>
                    )}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
