import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import type { Job, PracticeTask } from "@/api/types";
import { Badge, Button, Card, Field, inputBoxCls } from "@/components/ui";
import {
  EmptyState,
  ErrorNotice,
  LoadingRows,
  PageHeading,
  useCopy,
  useResource,
} from "@/components/workspace";

export default function PracticePage() {
  const c = useCopy();
  const [params, setParams] = useSearchParams();
  const tasks = useResource<PracticeTask[]>("/api/practice", []);
  const [create, setCreate] = useState(
    params.has("source") || params.has("skill") || params.has("job"),
  );
  const selected = tasks.data.find(
    (task) => task.id === Number(params.get("task")),
  );
  return (
    <div>
      <PageHeading
        index="03 / Deliberate practice"
        title={c("专项训练", "Focused practice")}
        description={c(
          "一次练一个能力点。围绕固定题目和评分标准重复作答，保留每一次的回答与具体依据。",
          "Practice one skill at a time. Repeat the same question against fixed criteria, with a record of each answer and its evidence.",
        )}
        action={
          <Button onClick={() => setCreate(true)}>
            {c("新建十分钟训练", "New 10-minute practice")}
          </Button>
        }
      />
      <ErrorNotice message={tasks.error} retry={() => void tasks.refresh()} />
      <div className="grid grid-cols-[290px_minmax(0,1fr)] gap-8 items-start">
        <aside className="sticky top-24">
          <div className="border-b-2 border-ink pb-3 text-sm flex justify-between">
            <span>{c("训练清单", "Practice queue")}</span>
            <span className="font-mono text-ink-soft">{tasks.data.length}</span>
          </div>
          {tasks.loading ? (
            <LoadingRows />
          ) : (
            tasks.data.map((task) => (
              <button
                key={task.id}
                onClick={() => {
                  setParams({ task: String(task.id) });
                  setCreate(false);
                }}
                className={`w-full text-left px-3 py-5 border-b border-rule border-l-2 ${selected?.id === task.id && !create ? "border-l-seal bg-seal-wash" : "border-l-transparent hover:bg-sheet"}`}
              >
                <h2 className="font-display text-lg font-bold">{task.skill}</h2>
                <p className="text-xs text-ink-soft mt-2 leading-6 line-clamp-2">
                  {task.question}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <Badge
                    tone={task.status === "completed" ? "green" : "neutral"}
                  >
                    {task.status === "completed"
                      ? c("本题达到练习目标", "Target met on this question")
                      : task.attempts.length
                        ? c("继续练习", "In progress")
                        : c("待开始", "Pending")}
                  </Badge>
                  {task.attempts.length > 0 && (
                    <span className="font-mono text-xs text-seal">
                      {task.attempts.at(-1)?.score} / 10
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </aside>
        <section>
          {create ? (
            <CreatePractice
              key={params.toString()}
              onSaved={async (id) => {
                await tasks.refresh();
                setParams({ task: String(id) });
                setCreate(false);
              }}
            />
          ) : selected ? (
            <PracticeEditor
              key={selected.id}
              task={selected}
              refresh={async () => {
                await tasks.refresh();
              }}
              onDeleted={() => setParams({})}
            />
          ) : (
            <EmptyState
              title={c(
                "把一个短板变成一次练习",
                "Turn one weakness into a practice session",
              )}
              to="/interview"
              action={c("从模拟面试复盘开始", "Start with an interview review")}
            >
              {c(
                "可以从面试复盘一键建题，也可以手动写下想练习的能力点。评分用于比较同题表现，不代表录用概率。",
                "Create practice from an interview review or name a skill you want to work on. Scores compare attempts on this question; they do not predict hiring outcomes.",
              )}
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}

function CreatePractice({
  onSaved,
}: {
  onSaved: (id: number) => Promise<void>;
}) {
  const c = useCopy();
  const [params] = useSearchParams();
  const jobs = useResource<Job[]>("/api/jobs", []);
  const [skill, setSkill] = useState(params.get("skill") || "");
  const [job, setJob] = useState(params.get("job") || "");
  const [question, setQuestion] = useState("");
  const [source, setSource] = useState(params.get("source") || "");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const task = await api.post<PracticeTask>("/api/practice", {
            skill,
            question,
            job_id: Number(job) || null,
            session_id: params.get("session") || "",
            source_text: source,
            due_date: date,
          });
          await onSaved(task.id);
        } catch (e) {
          setError(String(e));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-5"
    >
      <h2 className="font-display text-2xl font-bold">
        {c("设计一次具体练习", "Design one focused session")}
      </h2>
      <ErrorNotice message={error} />
      <Field label={c("要练习的能力点 *", "Skill to practice *")}>
        <input
          required
          maxLength={200}
          className={inputBoxCls}
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          placeholder={c(
            "例如：解释缓存一致性的取舍",
            "e.g. Explain cache consistency trade-offs",
          )}
        />
      </Field>
      <div className="grid grid-cols-2 gap-5">
        <Field label={c("关联岗位", "Related opportunity")}>
          <select
            className={inputBoxCls}
            value={job}
            onChange={(e) => setJob(e.target.value)}
          >
            <option value="">{c("通用能力练习", "General practice")}</option>
            {jobs.data.map((j) => (
              <option key={j.id} value={j.id}>
                {j.company} · {j.target_role}
              </option>
            ))}
          </select>
        </Field>
        <Field label={c("计划练习日期", "Practice date")}>
          <input
            type="date"
            className={inputBoxCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </div>
      <Field label={c("已有的题目（可选）", "Existing question (optional)")}>
        <textarea
          rows={3}
          className={inputBoxCls}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
      </Field>
      <Field label={c("复盘依据 / 上次回答", "Review notes / previous answer")}>
        <textarea
          rows={6}
          maxLength={10000}
          className={inputBoxCls}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
      </Field>
      <p className="text-xs leading-6 text-ink-soft">
        {c(
          "生成会调用配置的大模型，产出一道题和 3–5 项带行为锚点的固定标准。个人经历不足时会要求补充。",
          "The configured model creates one question and 3–5 fixed criteria with behavioral anchors. Missing personal experience should be supplied by you.",
        )}
      </p>
      <Button disabled={busy || !skill.trim()}>
        {busy
          ? c("正在设计题目与标准…", "Designing the question and rubric…")
          : c("生成训练题与评分标准", "Create question and rubric")}
      </Button>
    </form>
  );
}

function PracticeEditor({
  task,
  refresh,
  onDeleted,
}: {
  task: PracticeTask;
  refresh: () => Promise<void>;
  onDeleted: () => void;
}) {
  const c = useCopy();
  const storageKey = `jc_practice_answer_${task.id}`;
  const [answer, setAnswer] = useState(
    () => sessionStorage.getItem(storageKey) || "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attemptId, setAttemptId] = useState<number | null>(null);
  useEffect(() => {
    sessionStorage.setItem(storageKey, answer);
  }, [answer, storageKey]);
  const current =
    task.attempts.find((attempt) => attempt.id === attemptId) ||
    task.attempts.at(-1);
  const previous = current
    ? task.attempts[task.attempts.indexOf(current) - 1]
    : undefined;
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-5">
        <div>
          <h2 className="font-display text-2xl font-bold">{task.skill}</h2>
          <p className="text-xs text-ink-soft mt-2">
            {c(
              "同一道题 · 同一组标准 · 每次独立评价",
              "Same question · same criteria · independently evaluated attempts",
            )}
          </p>
        </div>
        {task.job_id && (
          <Link
            className="text-sm text-seal underline shrink-0"
            to={`/jobs/${task.job_id}`}
          >
            {c("返回岗位", "Back to opportunity")}
          </Link>
        )}
      </div>
      <p className="text-lg leading-9 border-y border-rule-strong py-5 whitespace-pre-wrap">
        {task.question}
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer text-seal">
          {c(
            "查看固定评分标准（每项 0–2 分）",
            "Fixed scoring criteria (0–2 per criterion)",
          )}
        </summary>
        <ol className="mt-3 space-y-3 list-decimal pl-5 leading-7 text-ink-soft">
          {task.rubric_json.map((criterion, i) => (
            <li key={i}>{criterion}</li>
          ))}
        </ol>
      </details>
      <ErrorNotice message={error} />
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api.post(`/api/practice/${task.id}/attempts`, { answer });
            setAttemptId(null);
            await refresh();
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={c("本次回答", "Your answer")}>
          <textarea
            className={`${inputBoxCls} leading-8`}
            rows={8}
            required
            maxLength={15000}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-4">
          <Button disabled={busy || !answer.trim()}>
            {busy
              ? c("正在按标准逐项评价…", "Evaluating each criterion…")
              : task.attempts.length
                ? c("提交一次复测", "Submit another attempt")
                : c("提交本次回答", "Submit answer")}
          </Button>
          <span className="text-xs text-ink-soft">
            {c(
              "回答草稿保留在当前浏览器会话中",
              "Draft retained for this browser session",
            )}
          </span>
        </div>
      </form>
      {current && (
        <Card className="p-6 space-y-5">
          <div className="flex items-end justify-between border-b border-rule pb-4">
            <div>
              <span className="eyebrow">
                {c("本题评价", "Question review")}
              </span>
              <p className="font-mono text-[11px] text-ink-soft mt-2">
                {new Date(current.created_at).toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <span className="font-latin text-4xl text-seal">
                {current.score}
              </span>
              <span className="font-mono text-xs text-ink-soft"> / 10</span>
              {previous && (
                <p className="text-xs text-ink-soft mt-1">
                  {c("较前一次", "vs previous")}{" "}
                  {current.score - previous.score > 0 ? "+" : ""}
                  {(current.score - previous.score).toFixed(1)}
                </p>
              )}
            </div>
          </div>
          {current.evaluation_json.criteria.map((criterion, i) => (
            <div key={i} className="border-b border-rule pb-4">
              <div className="flex items-start justify-between gap-5">
                <p className="text-sm leading-7">{criterion.criterion}</p>
                <Badge>{criterion.score} / 2</Badge>
              </div>
              {criterion.evidence_quote && (
                <blockquote className="border-l-2 border-moss pl-3 text-sm leading-7 mt-3 text-ink-soft">
                  {criterion.evidence_quote}
                </blockquote>
              )}
              <p className="text-sm leading-7 mt-2">{criterion.feedback}</p>
            </div>
          ))}
          <div>
            <h3 className="font-display font-bold text-seal mb-2">
              {c("下一次具体改什么", "Next improvement")}
            </h3>
            <p className="text-sm leading-7 whitespace-pre-wrap">
              {current.evaluation_json.next_step}
            </p>
          </div>
          <details>
            <summary className="cursor-pointer text-sm text-ink-soft">
              {c("参考思路", "Reference outline")}
            </summary>
            <p className="text-sm leading-7 whitespace-pre-wrap mt-3">
              {current.evaluation_json.reference_outline}
            </p>
          </details>
        </Card>
      )}
      {task.attempts.length > 0 && (
        <div className="border-t border-rule pt-5">
          <h3 className="font-display font-bold mb-3">
            {c("历次回答", "Attempt history")}
          </h3>
          <div className="flex flex-wrap gap-3">
            {task.attempts.map((attempt, i) => (
              <button
                key={attempt.id}
                className={`border px-3 py-2 text-sm ${current?.id === attempt.id ? "border-seal text-seal bg-seal-wash" : "border-rule-strong"}`}
                onClick={() => setAttemptId(attempt.id)}
              >
                {c("第", "#")}
                {i + 1}
                {c("次", "")} · {attempt.score}
              </button>
            ))}
          </div>
          {current && (
            <details className="mt-4">
              <summary className="text-sm cursor-pointer text-ink-soft">
                {c("查看当时的原始回答", "View original answer")}
              </summary>
              <p className="mt-3 text-sm leading-8 whitespace-pre-wrap">
                {current.answer}
              </p>
            </details>
          )}
        </div>
      )}
      <p className="text-xs text-ink-soft leading-6">
        {c(
          "分数由各项标准得分计算，8 分表示本题达到练习目标。模型评价可能有偏差，请结合原始回答核对。",
          "Scores are calculated from criterion results. Eight points meets this question’s practice target. Model feedback can be imperfect; compare it with the original answer.",
        )}
      </p>
      <button
        className="text-xs text-ink-soft hover:text-seal"
        disabled={busy}
        onClick={async () => {
          if (
            !window.confirm(
              c(
                "删除此训练及全部作答记录？",
                "Delete this practice and all its attempts?",
              ),
            )
          )
            return;
          setBusy(true);
          try {
            await api.del(`/api/practice/${task.id}`);
            sessionStorage.removeItem(storageKey);
            onDeleted();
            await refresh();
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {c("删除这项训练", "Delete practice")}
      </button>
    </div>
  );
}
