import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "@/api/client";
import { MODE_LABELS, type CreatePayload, type SessionInfo } from "@/api/types";
import ChatBubble from "@/components/ChatBubble";
import ReportDrawer from "@/components/ReportDrawer";
import ScorePanel from "@/components/ScorePanel";
import StageIndicator from "@/components/StageIndicator";
import { Badge, Button, Card, Field, inputCls } from "@/components/ui";
import { useInterviewStore } from "@/stores/interviewStore";

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

function SetupView() {
  const store = useInterviewStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState("technical");
  const [rounds, setRounds] = useState(6);
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [jd, setJd] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    api.get<SessionInfo[]>("/api/interview/sessions").then(setSessions).catch(() => {});
  }, []);

  async function start() {
    if (!role.trim()) {
      setError("请填写目标岗位");
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
      <Card className="space-y-5">
        <div>
          <h2 className="text-lg font-bold">开始一场模拟面试</h2>
          <p className="text-xs text-neutral-500 mt-1">
            面试官会先播报契约并出第 1 题；回答含糊时会被追问，全程自动评分。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="面试模式">
            <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}>
              {Object.entries(MODE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`主题目数量：${rounds}`}>
            <input
              type="range"
              min={3}
              max={12}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              className="w-full accent-emerald-600"
            />
          </Field>
        </div>

        <Field label="目标岗位 *">
          <input
            className={inputCls}
            placeholder="如：Java 后端开发工程师"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        </Field>

        <Field label="公司名（可选，填了会联网调研公司背景与面经）">
          <input
            className={inputCls}
            placeholder="如：字节跳动"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </Field>

        <Field label="岗位 JD（可选，粘贴后出题更贴近岗位）">
          <textarea
            className={`${inputCls} resize-none`}
            rows={5}
            placeholder="粘贴目标岗位的招聘描述…"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button className="w-full" onClick={start} disabled={starting}>
          {starting ? "正在安排面试官…" : "开始面试"}
        </Button>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-400">历史面试</h3>
        {sessions.length === 0 && <p className="text-xs text-neutral-600">暂无记录</p>}
        {sessions.slice(0, 8).map((s) => (
          <a key={s.id} href={`/interview/${s.id}`} className="block">
            <Card className="py-2.5 px-3 hover:border-neutral-700">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate">
                  {MODE_LABELS[s.mode] ?? s.mode} · {s.target_role || "未指定"}
                </span>
                <span className="text-neutral-500 shrink-0 ml-2">
                  {s.total_score != null ? `${Math.round(Number(s.total_score))} 分` : "进行中"}
                </span>
              </div>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}

function ChatView() {
  const store = useInterviewStore();
  const navigate = useNavigate();
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
    const t = input.trim();
    if (!t) return;
    store.answer(t);
    setInput("");
  }

  const session = store.session;
  const maxRounds = session?.max_rounds ?? store.scores.length + 1;
  const finished = !!store.report;

  return (
    <>
      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_250px] gap-4 h-[calc(100vh-9rem)]">
        <div className="space-y-3 hidden lg:block overflow-y-auto">
          <Card>
            <h3 className="font-semibold text-sm mb-3">面试信息</h3>
            <div className="space-y-2 text-xs text-neutral-400">
              <div>模式：{session ? (MODE_LABELS[session.mode] ?? session.mode) : "…"}</div>
              <div>岗位：{session?.target_role || "—"}</div>
              {session?.company && <div>公司：{session.company}</div>}
              <div>契约题数：{session?.max_rounds ?? "—"}</div>
              <div className="pt-1">
                {finished ? <Badge tone="green">已结束</Badge> : <Badge tone="blue">进行中</Badge>}
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {store.report && (
                <Button className="w-full" onClick={() => setShowReport(true)}>
                  查看复盘报告
                </Button>
              )}
              <Button
                variant="danger"
                className="w-full"
                onClick={() => store.finish()}
                disabled={store.isStreaming || finished}
              >
                提前结束并出报告
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
                重新开始
              </Button>
            </div>
          </Card>
        </div>

        <div className="flex flex-col min-h-0">
          <div ref={chatRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
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
              <p className="text-sm text-neutral-500">面试官准备中…</p>
            )}
          </div>

          <div className="pt-3 flex gap-2 items-end">
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              placeholder={finished ? "面试已结束，可查看复盘报告" : "输入你的回答（Enter 发送，Shift+Enter 换行）"}
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
                停止
              </Button>
            ) : (
              <Button onClick={send} disabled={finished || !input.trim()}>
                发送
              </Button>
            )}
          </div>
        </div>

        <div className="hidden lg:block min-h-0 overflow-y-auto">
          <Card>
            <h3 className="font-semibold text-sm mb-3">实时评分</h3>
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
