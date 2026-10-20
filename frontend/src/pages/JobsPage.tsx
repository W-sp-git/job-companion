import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import type { IntelReportMeta, Job, JobStatus, ResumeFile } from "@/api/types";
import { Badge, Button, Card, Field, inputBoxCls } from "@/components/ui";
import OpportunityCompare from "@/components/OpportunityCompare";
import {
  EmptyState,
  ErrorNotice,
  JOB_STATUSES,
  LoadingRows,
  PageHeading,
  jobStatusLabel,
  useCopy,
  useResource,
} from "@/components/workspace";

type JobForm = Omit<
  Job,
  | "id"
  | "analysis_json"
  | "analysis_stale"
  | "activities"
  | "sessions"
  | "updated_at"
>;
const blank: JobForm = {
  company: "",
  target_role: "",
  city: "",
  batch: "",
  jd_text: "",
  source_url: "",
  deadline: "",
  status: "saved",
  next_action: "",
  action_date: "",
  notes: "",
  resume_version_id: null,
  intel_report_id: null,
};

export default function JobsPage() {
  const c = useCopy();
  const { jid } = useParams();
  const navigate = useNavigate();
  const [showCompare, setShowCompare] = useState(false);
  const jobs = useResource<Job[]>("/api/jobs", []);
  const detail = useResource<Job | null>(
    jid && jid !== "new" ? `/api/jobs/${jid}` : "/api/jobs",
    null,
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const shown = jobs.data.filter(
    (j) =>
      (!filter || j.status === filter) &&
      `${j.company} ${j.target_role} ${j.city} ${j.batch}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const selected =
    jid &&
    jid !== "new" &&
    detail.data &&
    !Array.isArray(detail.data) &&
    detail.data.id === Number(jid)
      ? detail.data
      : null;
  const refresh = async (id?: number) => {
    await jobs.refresh();
    if (id) navigate(`/jobs/${id}`);
    await detail.refresh();
  };
  return (
    <div>
      <PageHeading
        index="01 / Opportunity desk"
        title={c("岗位工作台", "Opportunity desk")}
        description={c(
          "把岗位要求、投递进展、简历和面试准备放在同一份档案里。未回复的申请会保留为待回复。",
          "Keep requirements, applications, resume versions and interview preparation together. Silence remains an unknown outcome.",
        )}
        action={
          <div className="flex gap-3">
            <Button
              variant="ghost"
              disabled={jobs.data.length < 2}
              title={
                jobs.data.length < 2
                  ? c(
                      "保存至少两个岗位后可对比",
                      "Save at least two opportunities to compare",
                    )
                  : ""
              }
              onClick={() => setShowCompare((value) => !value)}
            >
              {showCompare
                ? c("收起对比", "Close comparison")
                : c("对比候选岗位", "Compare opportunities")}
            </Button>
            <Link to="/jobs/new">
              <Button>{c("保存新岗位", "Add opportunity")}</Button>
            </Link>
          </div>
        }
      />
      <ErrorNotice
        message={jobs.error || (jid ? detail.error : "")}
        retry={() => {
          void jobs.refresh();
          if (jid) void detail.refresh();
        }}
      />
      {showCompare && <OpportunityCompare jobs={jobs.data} />}
      <div className="grid grid-cols-[290px_minmax(0,1fr)] gap-7 items-start">
        <aside className="sticky top-24 space-y-4">
          <input
            aria-label={c("搜索岗位", "Search opportunities")}
            className={inputBoxCls}
            placeholder={c("公司、岗位或城市", "Company, role or city")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label={c("筛选进度", "Filter by status")}
            className={inputBoxCls}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">
              {c("全部进度", "All stages")} · {jobs.data.length}
            </option>
            {JOB_STATUSES.map((status) => (
              <option key={status} value={status}>
                {jobStatusLabel(status, c)}
              </option>
            ))}
          </select>
          {jobs.loading ? (
            <LoadingRows />
          ) : (
            <div className="divide-y divide-rule max-h-[65vh] overflow-y-auto">
              {shown.map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className={`block py-4 px-3 border-l-2 transition-colors ${Number(jid) === job.id ? "border-seal bg-seal-wash" : "border-transparent hover:bg-sheet"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display font-bold text-lg">
                      {job.company}
                    </span>
                    <span className="font-mono text-[10px] text-ink-faint">
                      {String(job.id).padStart(3, "0")}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{job.target_role}</p>
                  <p className="text-xs text-ink-soft mt-1">
                    {[job.city, job.batch].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-3">
                    <Badge
                      tone={
                        job.status === "offer"
                          ? "green"
                          : job.status === "interview"
                            ? "red"
                            : "neutral"
                      }
                    >
                      {jobStatusLabel(job.status, c)}
                    </Badge>
                  </div>
                </Link>
              ))}
              {!shown.length && (
                <p className="text-sm leading-6 text-ink-soft py-5">
                  {c(
                    "还没有符合条件的岗位。",
                    "No opportunities match this filter.",
                  )}
                </p>
              )}
            </div>
          )}
          <p className="text-xs leading-6 text-ink-soft border-t border-rule pt-3">
            {c(
              "先保存真实 JD，再对照你的材料准备。岗位进度由你更新，系统不会根据等待时长推断拒绝。",
              "Save the actual JD before preparing. You maintain application status; elapsed time never implies rejection.",
            )}
          </p>
        </aside>
        <section className="min-w-0">
          {jid === "new" ? (
            <JobEditor key="new" onSave={refresh} />
          ) : detail.loading && jid && !selected ? (
            <LoadingRows />
          ) : selected ? (
            <JobEditor key={selected.id} job={selected} onSave={refresh} />
          ) : (
            <>
              <ErrorNotice
                message={jid ? detail.error : ""}
                retry={() => void detail.refresh()}
              />
              <EmptyState
                title={c(
                  "从一份具体岗位开始",
                  "Start with a specific opportunity",
                )}
                to="/jobs/new"
                action={c("保存第一份岗位", "Save your first opportunity")}
              >
                {c(
                  "粘贴招聘页面里的岗位描述，记录城市、招聘批次和截止时间。再把简历、训练和真实面试记录关联起来。",
                  "Paste a job description, record its city, hiring batch and deadline, then link the resume and practice you use for it.",
                )}
              </EmptyState>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function JobEditor({
  job,
  onSave,
}: {
  job?: Job;
  onSave: (id?: number) => Promise<void>;
}) {
  const c = useCopy();
  const navigate = useNavigate();
  const [form, setForm] = useState<JobForm>(() =>
    job
      ? (Object.fromEntries(
          Object.keys(blank).map((key) => [key, job[key as keyof Job]]),
        ) as JobForm)
      : { ...blank },
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"details" | "analysis" | "timeline">(
    "details",
  );
  const [note, setNote] = useState("");
  const [real, setReal] = useState(false);
  const [questions, setQuestions] = useState("");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const library = useResource<ResumeFile[]>("/api/resume-library", []);
  const intel = useResource<IntelReportMeta[]>("/api/intel/reports", []);
  function field<K extends keyof JobForm>(key: K, value: JobForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError("");
    try {
      const result = job
        ? await api.put<Job>(`/api/jobs/${job.id}`, form)
        : await api.post<Job>("/api/jobs", form);
      setDirty(false);
      await onSave(result.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }
  async function analyze() {
    if (!job) return;
    setBusy("analyze");
    setError("");
    try {
      await api.post(`/api/jobs/${job.id}/analyze`);
      await onSave();
      setTab("analysis");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }
  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!job) return;
    setBusy("note");
    setError("");
    try {
      await api.post(`/api/jobs/${job.id}/activities`, {
        kind: real ? "real_interview" : "note",
        content: note,
        questions,
        answer,
        explicit_feedback: feedback,
        reflection: real ? note : "",
      });
      setNote("");
      setQuestions("");
      setAnswer("");
      setFeedback("");
      await onSave();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }
  const analysis = job?.analysis_json;
  return (
    <div className="space-y-6">
      {job && (
        <div className="flex justify-between items-start gap-4 border-b border-rule-strong pb-4">
          <div>
            <h2 className="font-display text-2xl font-bold">
              {job.company} <span className="text-ink-faint mx-1">/</span>{" "}
              {job.target_role}
            </h2>
            <p className="text-xs text-ink-soft mt-2">
              {[job.city, job.batch].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Badge>{jobStatusLabel(job.status, c)}</Badge>
        </div>
      )}
      {job && (
        <div className="flex gap-5 text-sm border-b border-rule">
          {(["details", "analysis", "timeline"] as const).map((value, i) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`pb-3 border-b-2 ${tab === value ? "border-seal text-seal" : "border-transparent text-ink-soft"}`}
            >
              {
                [
                  c("岗位与进度", "Details & progress"),
                  c("要求与准备", "Requirements"),
                  c("求职记录", "Activity"),
                ][i]
              }
            </button>
          ))}
        </div>
      )}
      <ErrorNotice message={error} />
      {tab === "details" && (
        <form onSubmit={save} className="space-y-6">
          <div className="grid grid-cols-2 gap-5">
            <Field label={c("公司 *", "Company *")}>
              <input
                required
                maxLength={160}
                className={inputBoxCls}
                value={form.company}
                onChange={(e) => field("company", e.target.value)}
              />
            </Field>
            <Field label={c("具体岗位 *", "Role *")}>
              <input
                required
                maxLength={160}
                className={inputBoxCls}
                value={form.target_role}
                onChange={(e) => field("target_role", e.target.value)}
              />
            </Field>
            <Field label={c("工作城市", "City")}>
              <input
                className={inputBoxCls}
                value={form.city}
                onChange={(e) => field("city", e.target.value)}
              />
            </Field>
            <Field label={c("招聘批次 / 部门", "Hiring batch / team")}>
              <input
                className={inputBoxCls}
                placeholder={c(
                  "如：2027 秋招 · 基础架构",
                  "e.g. 2027 campus · infrastructure",
                )}
                value={form.batch}
                onChange={(e) => field("batch", e.target.value)}
              />
            </Field>
            <Field label={c("招聘原始链接", "Source URL")}>
              <input
                type="url"
                className={inputBoxCls}
                value={form.source_url}
                onChange={(e) => field("source_url", e.target.value)}
              />
            </Field>
            <Field label={c("申请截止日期", "Application deadline")}>
              <input
                type="date"
                className={inputBoxCls}
                value={form.deadline}
                onChange={(e) => field("deadline", e.target.value)}
              />
            </Field>
          </div>
          <Field label={c("岗位描述 JD", "Job description")}>
            <textarea
              className={`${inputBoxCls} leading-7`}
              rows={9}
              maxLength={20000}
              value={form.jd_text}
              onChange={(e) => field("jd_text", e.target.value)}
              placeholder={c(
                "保留任职要求、毕业时间、实习到岗安排等原文。",
                "Include requirements, graduation eligibility and availability details.",
              )}
            />
          </Field>
          <div className="border-t border-rule pt-5 grid grid-cols-2 gap-5">
            <Field label={c("当前进度", "Application status")}>
              <select
                className={inputBoxCls}
                value={form.status}
                onChange={(e) => field("status", e.target.value as JobStatus)}
              >
                {JOB_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {jobStatusLabel(status, c)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={c("下一步安排日期", "Next action date")}>
              <input
                type="date"
                className={inputBoxCls}
                value={form.action_date}
                onChange={(e) => field("action_date", e.target.value)}
              />
            </Field>
            <div className="col-span-2">
              <Field label={c("下一步具体做什么", "Next action")}>
                <input
                  className={inputBoxCls}
                  placeholder={c(
                    "例如：准备缓存项目的三次追问",
                    "e.g. Prepare follow-up answers on my caching project",
                  )}
                  value={form.next_action}
                  onChange={(e) => field("next_action", e.target.value)}
                />
              </Field>
            </div>
            <Field label={c("关联简历版本", "Linked resume version")}>
              <select
                className={inputBoxCls}
                value={form.resume_version_id ?? ""}
                onChange={(e) =>
                  field("resume_version_id", Number(e.target.value) || null)
                }
              >
                <option value="">{c("尚未选择", "Not selected")}</option>
                {library.data.flatMap((file) =>
                  (file.versions ?? []).map((version) => (
                    <option key={version.id} value={version.id}>
                      {file.filename} · v{version.version_no} ·{" "}
                      {version.context?.label || ""}
                    </option>
                  )),
                )}
              </select>
            </Field>
            <Field label={c("关联公司情报", "Linked company research")}>
              <select
                className={inputBoxCls}
                value={form.intel_report_id ?? ""}
                onChange={(e) =>
                  field("intel_report_id", Number(e.target.value) || null)
                }
              >
                <option value="">{c("尚未选择", "Not selected")}</option>
                {intel.data
                  .filter(
                    (r) => r.company === form.company && r.status === "done",
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.company} · {r.target_role} ·{" "}
                      {r.created_at.slice(0, 10)}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <Field label={c("备注与待确认事项", "Notes & open questions")}>
            <textarea
              rows={3}
              className={inputBoxCls}
              value={form.notes}
              onChange={(e) => field("notes", e.target.value)}
            />
          </Field>
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={!!busy}>
              {busy === "save"
                ? c("保存中…", "Saving…")
                : c("保存岗位档案", "Save opportunity")}
            </Button>
            {dirty && (
              <span className="text-xs text-ochre">
                {c(
                  "有未保存修改，切换岗位前请先保存",
                  "Unsaved changes · save before switching opportunities",
                )}
              </span>
            )}
          </div>
        </form>
      )}
      {job && tab === "analysis" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-4">
            <p className="text-xs leading-6 text-ink-soft">
              {c(
                "依据 JD 原文和所选简历、已确认素材逐项对照。分析会调用配置的大模型。",
                "Compare the actual JD with the selected resume facts and confirmed experiences using the configured model.",
              )}
            </p>
            <Button
              disabled={!!busy || dirty || !job.jd_text.trim()}
              onClick={analyze}
            >
              {busy === "analyze"
                ? c("分析中…", "Analyzing…")
                : c("分析岗位要求", "Analyze requirements")}
            </Button>
          </div>
          {job.analysis_stale && (
            <ErrorNotice
              message={c(
                "材料或岗位已更新，以下是旧分析，请重新分析后使用。",
                "The JD or candidate facts have changed. Reanalyze before using these results.",
              )}
            />
          )}
          {analysis?.summary ? (
            <>
              <p className="font-display text-lg leading-8">
                {analysis.summary}
              </p>
              <div className="divide-y divide-rule">
                {analysis.requirements?.map((requirement, index) => (
                  <article key={index} className="py-5 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="font-mono text-xs text-ink-faint pt-1">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <p className="flex-1 font-medium leading-7">
                        {requirement.requirement}
                      </p>
                      <Badge
                        tone={
                          requirement.status === "supported" ? "green" : "amber"
                        }
                      >
                        {requirement.status === "supported"
                          ? c("材料有依据", "Evidence found")
                          : requirement.status === "gap"
                            ? c("明确差距", "Explicit gap")
                            : c("待确认", "Needs confirmation")}
                      </Badge>
                    </div>
                    <p className="text-sm leading-7 text-ink-soft pl-7">
                      {requirement.explanation}
                    </p>
                    {requirement.evidence_quote && (
                      <blockquote className="ml-7 pl-3 border-l-2 border-moss text-sm leading-7">
                        <span className="block text-[11px] text-ink-soft">
                          {requirement.evidence_label}
                        </span>
                        {(requirement.evidence_quotes?.length
                          ? requirement.evidence_quotes
                          : [requirement.evidence_quote]
                        ).map((quote, quoteIndex) => (
                          <p key={quoteIndex}>{quote}</p>
                        ))}
                      </blockquote>
                    )}
                    <p className="text-sm text-seal pl-7">
                      {requirement.next_action}
                    </p>
                  </article>
                ))}
              </div>
              <Card className="p-5">
                <h3 className="font-display font-bold mb-3">
                  {c("准备清单", "Preparation checklist")}
                </h3>
                {analysis.preparation?.map((item, i) => (
                  <p key={i} className="text-sm leading-8">
                    {i + 1}. {item}
                  </p>
                ))}
                <h3 className="font-display font-bold mt-5 mb-3">
                  {c("面试时值得确认的问题", "Questions worth asking")}
                </h3>
                {analysis.questions_to_ask?.map((item, i) => (
                  <p key={i} className="text-sm leading-8">
                    {i + 1}. {item}
                  </p>
                ))}
              </Card>
            </>
          ) : (
            <EmptyState
              title={c(
                "先看清要求，再安排准备",
                "Understand the requirements first",
              )}
            >
              {c(
                "保存 JD，并选择简历或补充确认素材后，分析会列出有依据、明确差距和待确认的要求。",
                "Save a JD and select a resume or confirm experience facts. Analysis will distinguish evidence, explicit gaps and unknowns.",
              )}
            </EmptyState>
          )}
        </div>
      )}
      {job && tab === "timeline" && (
        <div className="space-y-6">
          <form onSubmit={addNote} className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={real}
                onChange={(e) => setReal(e.target.checked)}
              />
              {c("记录一次真实面试", "Record a real interview")}
            </label>
            {real && (
              <>
                <Field label={c("面试官问了什么", "Interview questions")}>
                  <textarea
                    rows={3}
                    className={inputBoxCls}
                    value={questions}
                    onChange={(e) => setQuestions(e.target.value)}
                  />
                </Field>
                <Field label={c("我当时怎样回答", "My answers")}>
                  <textarea
                    rows={3}
                    className={inputBoxCls}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                </Field>
                <Field
                  label={c(
                    "面试官明确说出的反馈",
                    "Explicit interviewer feedback",
                  )}
                >
                  <textarea
                    rows={2}
                    className={inputBoxCls}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                  />
                </Field>
              </>
            )}
            <Field
              label={
                real
                  ? c(
                      "我的复盘与推测（区别于明确反馈）",
                      "My reflections (separate from explicit feedback)",
                    )
                  : c("补充一条求职记录", "Add an activity note")
              }
            >
              <textarea
                required
                rows={3}
                className={inputBoxCls}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <Button disabled={!!busy || !note.trim()}>
              {busy === "note"
                ? c("保存中…", "Saving…")
                : c("保存记录", "Save note")}
            </Button>
          </form>
          <div className="border-l border-rule-strong pl-5 space-y-5">
            {job.activities?.map((activity) => (
              <article key={activity.id} className="border-b border-rule pb-4">
                <p className="font-mono text-[11px] text-ink-soft mb-2">
                  {new Date(activity.created_at).toLocaleString()}
                </p>
                <p className="text-sm leading-7 whitespace-pre-wrap">
                  {activity.content}
                </p>
                {activity.kind === "real_interview" && (
                  <>
                    <p className="text-sm leading-7 whitespace-pre-wrap mt-2">
                      {c("问题：", "Questions: ")}
                      {activity.details_json.questions}
                    </p>
                    <p className="text-sm leading-7 whitespace-pre-wrap">
                      {c("我的回答：", "My answers: ")}
                      {activity.details_json.answer}
                    </p>
                    <p className="text-sm leading-7 text-moss whitespace-pre-wrap">
                      {c("明确反馈：", "Explicit feedback: ")}
                      {activity.details_json.explicit_feedback}
                    </p>
                    <Link
                      className="text-sm text-seal underline underline-offset-4"
                      to={`/practice?job=${job.id}&source=${encodeURIComponent([activity.details_json.questions, activity.details_json.answer, activity.details_json.explicit_feedback, activity.content].filter(Boolean).join("\n"))}`}
                    >
                      {c(
                        "根据这次复盘创建训练",
                        "Create practice from this interview",
                      )}
                    </Link>
                  </>
                )}
                {activity.details_json.session_id && (
                  <Link
                    className="text-sm text-seal underline"
                    to={`/interview/${activity.details_json.session_id}`}
                  >
                    {c("查看模拟面试", "View mock interview")}
                  </Link>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
      {job && (
        <div className="border-t-2 border-ink pt-5 flex flex-wrap items-center gap-3">
          <Link to={`/resume?job=${job.id}`}>
            <Button variant="ghost">
              {c("准备岗位简历", "Prepare resume")}
            </Button>
          </Link>
          <Link to={`/interview?job=${job.id}`}>
            <Button variant="ghost">
              {c("按此岗位模拟面试", "Practice interview")}
            </Button>
          </Link>
          <Link
            to={`/practice?job=${job.id}`}
            className="text-sm text-seal underline underline-offset-4"
          >
            {c("创建专项训练", "Create focused practice")}
          </Link>
          <button
            className="ml-auto text-xs text-ink-soft hover:text-seal"
            disabled={!!busy}
            onClick={async () => {
              if (
                !window.confirm(
                  c(
                    "移除此岗位及其求职记录？简历、模拟面试和训练仍会保留。",
                    "Remove this opportunity and its activity? Resumes, mock interviews and practice will remain.",
                  ),
                )
              )
                return;
              setBusy("delete");
              try {
                await api.del(`/api/jobs/${job.id}`);
                navigate("/jobs");
                await onSave();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy("");
              }
            }}
          >
            {c("移除岗位", "Remove opportunity")}
          </button>
        </div>
      )}
    </div>
  );
}
