import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { api } from "@/api/client";
import type { CreatePayload, SessionInfo } from "@/api/types";
import ChatBubble from "@/components/ChatBubble";
import ReportDrawer from "@/components/ReportDrawer";
import ScorePanel from "@/components/ScorePanel";
import StageIndicator from "@/components/StageIndicator";
import {
  Badge,
  Button,
  Card,
  CountNumber,
  Field,
  LeaderRow,
  Stamp,
  inputBoxCls,
  inputCls,
} from "@/components/ui";
import { modeLabel, useT } from "@/i18n";
import type { MessageKey } from "@/i18n/messages";
import { useInterviewStore } from "@/stores/interviewStore";

const MODES: MessageKey[] = ["mode.behavioral", "mode.technical", "mode.project", "mode.pressure"];
const MODE_KEYS = ["behavioral", "technical", "project", "pressure"];

export default function InterviewPage() {
  const { sid } = useParams();
  const store = useInterviewStore();

  useEffect(() => {
    if (sid && store.sessionId !== sid) {
      store.loadSession(sid).catch((e) => console.error(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  if (!store.sessionId) return <SetupView />;
  return <ChatView />;
}

/* ==================== 面试登记表 ==================== */
function SetupView() {
  const store = useInterviewStore();
  const navigate = useNavigate();
  const { t } = useT();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState("technical");
  const [rounds, setRounds] = useState(6);
  const [role, setRole] = useState(searchParams.get("role") ?? "");
  const [company, setCompany] = useState(searchParams.get("company") ?? "");
  const [jd, setJd] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    api.get<SessionInfo[]>("/api/interview/sessions").then(setSessions).catch(() => {});
  }, []);

  async function start() {
    if (!role.trim()) {
      setError(t("interview.setup.need_role"));
      return;
    }
    setStarting(true);
    setError("");
    try {
      const payload: CreatePayload = {
        mode,
        max_rounds: rounds,
        target_role: role.trim(),
        company: company.trim(),
        jd_text: jd,
      };
      await store.createAndStart(payload);
      const newSid = useInterviewStore.getState().sessionId;
      if (newSid) navigate(`/interview/${newSid}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 max-w-4xl mx-auto">
      <Card className="p-6 space-y-6 animate-ink-up">
        <div>
          <div className="eyebrow mb-2">{t("interview.setup.eyebrow")}</div>
          <h2 className="font-display text-2xl font-black tracking-wide">{t("interview.setup.title")}</h2>
          <p className="font-kai text-xs text-ink-soft mt-2 leading-5">{t("interview.setup.desc")}</p>
        </div>

        <div className="space-y-2">
          <span className="flex items-baseline gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">
            <span className="text-seal">▪</span>
            {t("interview.setup.mode")}
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MODE_KEYS.map((k, i) => (
              <button
                key={k}
                type="button"
                onClick={() => setMode(k)}
                className={`border rounded-[2px] px-2 py-2.5 text-sm tracking-wide transition-all duration-150 ${
                  mode === k
                    ? "border-seal bg-seal-wash text-seal font-semibold shadow-print"
                    : "border-rule-strong text-ink-soft hover:border-ink-soft hover:text-ink"
                }`}
              >
                {t(MODES[i])}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="flex items-baseline gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">
            <span className="text-seal">▪</span>
            {t("interview.setup.rounds")}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="h-9 w-9 border border-rule-strong rounded-[2px] font-mono text-lg leading-none text-ink-soft hover:border-seal hover:text-seal transition-colors"
              onClick={() => setRounds((r) => Math.max(3, r - 1))}
            >
              −
            </button>
            <span className="font-latin text-3xl text-seal w-14 text-center tabular-nums">
              <CountNumber value={rounds} duration={260} />
            </span>
            <button
              type="button"
              className="h-9 w-9 border border-rule-strong rounded-[2px] font-mono text-lg leading-none text-ink-soft hover:border-seal hover:text-seal transition-colors"
              onClick={() => setRounds((r) => Math.min(12, r + 1))}
            >
              ＋
            </button>
            <span className="font-kai text-xs text-ink-faint">
              {t("interview.setup.rounds.unit")} · {t("interview.setup.rounds.range")}
            </span>
          </div>
        </div>

        <Field label={`${t("interview.setup.role")} *`}>
          <input
            className={`${inputCls} text-[15px]`}
            placeholder={t("interview.setup.role.placeholder")}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        </Field>

        <Field label={t("interview.setup.company")}>
          <input
            className={`${inputCls} text-[15px]`}
            placeholder={t("interview.setup.company.placeholder")}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </Field>

        <Field label={t("interview.setup.jd")}>
          <textarea
            className={`${inputBoxCls} resize-none font-kai text-sm leading-6`}
            rows={5}
            placeholder={t("interview.setup.jd.placeholder")}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
          />
        </Field>

        {error && <p className="font-kai text-sm text-seal">✗ {error}</p>}

        <Button className="w-full py-3 text-base tracking-[0.3em]" onClick={start} disabled={starting}>
          {starting ? t("interview.setup.starting") : t("interview.setup.start")}
        </Button>
      </Card>

      <div className="space-y-3">
        <div className="flex items-end justify-between border-b-2 border-ink pb-2">
          <h3 className="font-display text-base font-bold tracking-wide">{t("interview.setup.logbook")}</h3>
          <span className="font-mono text-[10px] tracking-[0.22em] text-ink-faint">LOGBOOK</span>
        </div>
        {sessions.length === 0 && (
          <p className="font-kai text-xs text-ink-faint">{t("interview.setup.logbook.empty")}</p>
        )}
        <div className="space-y-2 stagger">
          {sessions.slice(0, 8).map((s) => (
            <a key={s.id} href={`/interview/${s.id}`} className="block group">
              <div className="border border-rule-strong bg-sheet rounded-[2px] px-3 py-2.5 transition-all duration-150 group-hover:border-seal/60 group-hover:-translate-x-[1px] group-hover:-translate-y-[1px] group-hover:shadow-print">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-ink-soft group-hover:text-ink transition-colors">
                    {modeLabel(t, s.mode)} · {s.target_role || t("interview.setup.logbook.untitled")}
                  </span>
                  <span className="font-latin text-base text-seal shrink-0">
                    {s.total_score != null
                      ? t("interview.setup.logbook.score", { score: Math.round(Number(s.total_score)) })
                      : t("interview.setup.logbook.running")}
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ==================== 面试房间 ==================== */
function ChatView() {
  const store = useInterviewStore();
  const navigate = useNavigate();
  const { t } = useT();
  const [input, setInput] = useState("");
  const [showReport, setShowReport] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const prevReport = useRef(store.report);

  useEffect(() => {
    if (store.report && store.report !== prevReport.current) setShowReport(true);
    prevReport.current = store.report;
  }, [store.report]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [store.messages.length, store.stage, store.messages[store.messages.length - 1]?.content]);

  function send() {
    const txt = input.trim();
    if (!txt) return;
    store.answer(txt);
    setInput("");
  }

  const session = store.session;
  const maxRounds = session?.max_rounds ?? store.scores.length + 1;
  const finished = !!store.report;

  return (
    <>
      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_250px] gap-4 h-[calc(100vh-9rem)]">
        {/* 左：本场档案 */}
        <div className="space-y-3 hidden lg:block overflow-y-auto">
          <Card className="p-4">
            <Stamp size="sm" tone={finished ? "moss" : "seal"} className="absolute right-3 top-3">
              {finished ? t("chat.dossier.stamp.done") : t("chat.dossier.stamp.live")}
            </Stamp>
            <div className="eyebrow mb-1.5">Dossier</div>
            <h3 className="font-display text-base font-bold mb-4">{t("chat.dossier")}</h3>
            <div className="space-y-2.5 text-xs">
              <LeaderRow label={t("chat.dossier.mode")}>
                {session ? modeLabel(t, session.mode) : "…"}
              </LeaderRow>
              <LeaderRow label={t("chat.dossier.role")}>{session?.target_role || "—"}</LeaderRow>
              {session?.company && (
                <LeaderRow label={t("chat.dossier.company")}>{session.company}</LeaderRow>
              )}
              <LeaderRow label={t("chat.dossier.rounds")}>{session?.max_rounds ?? "—"}</LeaderRow>
              <LeaderRow label={t("chat.dossier.status")}>
                {finished ? (
                  <Badge tone="green">{t("chat.dossier.finished")}</Badge>
                ) : (
                  <Badge tone="blue">{t("chat.dossier.running")}</Badge>
                )}
              </LeaderRow>
            </div>
            <div className="mt-5 space-y-2">
              {store.report && (
                <Button className="w-full" onClick={() => setShowReport(true)}>
                  {t("chat.dossier.viewReport")}
                </Button>
              )}
              <Button
                variant="danger"
                className="w-full"
                onClick={() => store.finish()}
                disabled={store.isStreaming || finished}
              >
                {t("chat.dossier.finish")}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  store.reset();
                  navigate("/interview");
                }}
                disabled={store.isStreaming}
              >
                {t("chat.dossier.restart")}
              </Button>
            </div>
          </Card>
        </div>

        {/* 中：面试记录（稿纸） */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-end justify-between border-b-2 border-ink pb-2 mb-3 shrink-0">
            <span className="font-display text-sm font-bold tracking-[0.14em]">{t("chat.transcript")}</span>
            <span className="font-mono text-[10px] tracking-[0.22em] text-ink-faint">TRANSCRIPT</span>
          </div>
          <div ref={chatRef} className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1 manuscript pl-4">
            {store.messages.map((m, i) => (
              <ChatBubble
                key={i}
                message={m}
                streaming={
                  store.isStreaming && i === store.messages.length - 1 && m.role === "assistant"
                }
              />
            ))}
            {store.stage && <StageIndicator label={store.stage.label} />}
            {store.messages.length === 0 && !store.stage && (
              <p className="font-kai text-sm text-ink-faint">{t("chat.transcript.preparing")}</p>
            )}
          </div>

          <div className="pt-4 flex gap-2 items-end shrink-0">
            <textarea
              className={`${inputBoxCls} resize-none font-kai text-[15px] leading-7`}
              rows={2}
              placeholder={
                finished ? t("chat.input.placeholder.finished") : t("chat.input.placeholder")
              }
              value={input}
              disabled={store.isStreaming || finished}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {store.isStreaming ? (
              <Button variant="ghost" onClick={() => store.stop()}>
                {t("chat.stop")}
              </Button>
            ) : (
              <Button onClick={send} disabled={finished || !input.trim()}>
                {t("chat.send")}
              </Button>
            )}
          </div>
        </div>

        {/* 右：红笔批改 */}
        <div className="hidden lg:block min-h-0 overflow-y-auto">
          <Card className="p-4">
            <div className="flex items-end justify-between border-b border-rule pb-2 mb-4">
              <h3 className="font-display text-base font-bold">{t("chat.scores")}</h3>
              <span className="font-mono text-[10px] tracking-[0.18em] text-ink-faint">SCORES</span>
            </div>
            <ScorePanel scores={store.scores} maxRounds={maxRounds} />
          </Card>
        </div>
      </div>

      {showReport && store.report && (
        <ReportDrawer report={store.report} onClose={() => setShowReport(false)} />
      )}
    </>
  );
}
