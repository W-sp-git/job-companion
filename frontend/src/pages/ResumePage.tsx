import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { createSSEStream } from "@/api/sse";
import type {
  FactualityViolation,
  Job,
  ResumeDraft,
  ResumeFile,
  ResumeRaw,
  ResumeVersion,
  ReviewReport,
} from "@/api/types";
import { ResumeEditor } from "@/components/ResumeEditor";
import VersionDiff from "@/components/VersionDiff";
import { Badge, Button, Card, Field, inputBoxCls } from "@/components/ui";
import {
  EmptyState,
  ErrorNotice,
  LoadingRows,
  PageHeading,
  useCopy,
  useResource,
} from "@/components/workspace";
import { stageLabel, useT } from "@/i18n";

export default function ResumePage() {
  const c = useCopy();
  const { locale } = useT();
  const [params, setParams] = useSearchParams();
  const library = useResource<ResumeFile[]>("/api/resume-library", []);
  const jobs = useResource<Job[]>("/api/jobs", []);
  const [resumeId, setResumeId] = useState<number | null>(null);
  const [raw, setRaw] = useState<ResumeRaw | null>(null);
  const [rawDirty, setRawDirty] = useState(false);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [versionId, setVersionId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ResumeDraft | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [review, setReview] = useState<ReviewReport | null>(null);
  const [issues, setIssues] = useState<FactualityViolation[]>([]);
  const [jobId, setJobId] = useState(params.get("job") || "");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [jd, setJd] = useState("");
  const [label, setLabel] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(false);
  const [stages, setStages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"source" | "draft">("source");
  const [diff, setDiff] = useState<{
    current: ResumeVersion;
    previous: ResumeVersion | null;
  } | null>(null);
  const loadSequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const selectedJob = jobs.data.find((job) => job.id === Number(jobId));
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    setJobId(params.get("job") || "");
  }, [params.get("job")]);
  useEffect(() => {
    if (selectedJob) {
      setRole(selectedJob.target_role);
      setCompany(selectedJob.company);
      setJd(selectedJob.jd_text);
    }
  }, [selectedJob?.id]);
  useEffect(() => {
    if (!resumeId && library.data.length) {
      const requested = Number(
        params.get("resume") || sessionStorage.getItem("jc_active_resume"),
      );
      const file =
        library.data.find((file) => file.id === requested) || library.data[0];
      void loadResume(file, Number(params.get("version")) || undefined);
    }
  }, [library.data, resumeId]);

  function showVersion(version: ResumeVersion) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set("resume", String(version.resume_id));
        next.set("version", String(version.id));
        return next;
      },
      { replace: true },
    );
    let restored: ResumeDraft | null = null;
    try {
      restored = JSON.parse(
        sessionStorage.getItem(`jc_draft_${version.id}`) || "null",
      );
    } catch {
      /* Ignore an invalid browser draft. */
    }
    setVersionId(version.id);
    setDraft(restored || { other: [], ...structuredClone(version.draft_json) });
    setDraftDirty(!!restored);
    setReview(version.review_json);
    setIssues(version.export_issues || []);
    setLabel(version.context?.label || "");
    setAcknowledged(false);
    if (!selectedJob) {
      setRole(version.context?.target_role || version.draft_json.target_role);
      setCompany(version.context?.company || "");
      setJd(version.context?.jd_text || "");
    }
  }
  async function loadResume(file: ResumeFile, requestedVersion?: number) {
    const token = ++loadSequence.current;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const savedVersions = await api.get<ResumeVersion[]>(
        `/api/resumes/${file.id}/versions`,
      );
      if (token !== loadSequence.current) return;
      let sourceDraft: ResumeRaw | null = null;
      try {
        sourceDraft = JSON.parse(
          sessionStorage.getItem(`jc_raw_${file.id}`) || "null",
        );
      } catch {
        /* Ignore an invalid browser draft. */
      }
      setResumeId(file.id);
      setRaw(sourceDraft || structuredClone(file.raw_json));
      setRawDirty(!!sourceDraft);
      setVersions(savedVersions);
      sessionStorage.setItem("jc_active_resume", String(file.id));
      const nextParams = new URLSearchParams(params);
      nextParams.set("resume", String(file.id));
      nextParams.delete("version");
      if (!savedVersions.length) setParams(nextParams, { replace: true });
      if (savedVersions.length) {
        showVersion(
          savedVersions.find((version) => version.id === requestedVersion) ||
            savedVersions[0],
        );
        setTab("draft");
      } else {
        setDraft(null);
        setVersionId(null);
        setReview(null);
        setIssues([]);
        setTab("source");
        if (!selectedJob) setRole(file.raw_json.target_role);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      if (token === loadSequence.current) setLoading(false);
    }
  }
  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setError(c("文件不能超过 10MB", "File must be 10MB or smaller"));
      return;
    }
    setBusy("upload");
    setError("");
    setStages([]);
    try {
      const result = await api.upload<{
        resume_id: number;
        raw_json: ResumeRaw;
      }>("/api/resumes", file);
      await library.refresh();
      await loadResume({
        id: result.resume_id,
        filename: file.name,
        raw_json: result.raw_json,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }
  async function saveSource() {
    if (!resumeId || !raw) return;
    setBusy("source");
    setError("");
    try {
      await api.put(`/api/resumes/${resumeId}`, raw);
      sessionStorage.removeItem(`jc_raw_${resumeId}`);
      setRawDirty(false);
      await library.refresh();
      setNotice(
        c(
          "解析校正已保存；历史版本仍保留生成时的材料快照。",
          "Source corrections saved. Historical versions retain the evidence used when created.",
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }
  function optimize() {
    if (!resumeId || busy || rawDirty) return;
    setBusy("optimize");
    setError("");
    setNotice("");
    setStages([]);
    controller.current = createSSEStream(
      `/api/resumes/${resumeId}/optimize`,
      {
        target_role: role,
        company,
        jd_text: jd,
        max_iterations: 2,
        job_id: Number(jobId) || null,
        locale,
      },
      {
        onEvent(event, value) {
          const data = value as Record<string, unknown>;
          if (event === "stage")
            setStages((previous) => [...previous, stageLabel(data)]);
          if (event === "error") setError(String(data.message));
          if (event === "result") {
            const version = {
              id: Number(data.version_id),
              resume_id: resumeId!,
              version_no: versions.length + 1,
              draft_json: data.draft as ResumeDraft,
              review_json: data.review as ReviewReport,
              export_issues: data.export_issues as FactualityViolation[],
              context: {
                label: selectedJob
                  ? `${selectedJob.company} · ${selectedJob.target_role}`
                  : c("AI 优化", "AI revision"),
                company,
                target_role: role,
                jd_text: jd,
              },
              docx_path: null,
              created_at: new Date().toISOString(),
            };
            showVersion(version);
            setTab("draft");
            void api
              .get<ResumeVersion[]>(`/api/resumes/${resumeId}/versions`)
              .then(setVersions)
              .catch((e) => setError(String(e)));
            void library.refresh();
          }
          if (event === "done") setBusy("");
        },
        onClose: () => setBusy(""),
        onError: (e) => {
          setError(String(e));
          setBusy("");
        },
      },
    );
  }
  async function createBaseline() {
    if (!resumeId || rawDirty || busy) return;
    setBusy("baseline");
    setError("");
    setNotice("");
    try {
      const saved = await api.post<ResumeVersion>(
        `/api/resumes/${resumeId}/baseline`,
        {
          target_role: role,
          company,
          jd_text: jd,
          job_id: Number(jobId) || null,
          locale,
        },
      );
      showVersion(saved);
      setTab("draft");
      setVersions(
        await api.get<ResumeVersion[]>(`/api/resumes/${resumeId}/versions`),
      );
      await library.refresh();
      setNotice(
        c(
          "已从原材料建立可编辑版本，没有调用生成模型。",
          "Editable version created from source facts without a generation-model call.",
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }
  async function saveDraft() {
    if (!resumeId || !draft) return;
    setBusy("draft");
    setError("");
    setNotice("");
    try {
      const saved = await api.post<ResumeVersion>(
        `/api/resumes/${resumeId}/versions`,
        {
          draft,
          parent_version_id: versionId,
          label,
          review_acknowledged: acknowledged,
        },
      );
      if (versionId) sessionStorage.removeItem(`jc_draft_${versionId}`);
      if (selectedJob)
        await api.put(`/api/jobs/${selectedJob.id}`, {
          ...selectedJob,
          resume_version_id: saved.id,
        });
      showVersion(saved);
      setVersions(
        await api.get<ResumeVersion[]>(`/api/resumes/${resumeId}/versions`),
      );
      await library.refresh();
      setNotice(
        saved.export_issues?.length
          ? c(
              "版本已保存，仍有待核对问题。请修正事实材料或正文后再导出。",
              "Version saved with review issues. Correct the evidence or content before exporting.",
            )
          : c(
              "新版本已保存，可以预览或导出。",
              "New version saved and ready to preview or export.",
            ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <div>
      <PageHeading
        index="04 / Resume workshop"
        title={c("简历工作室", "Resume workshop")}
        description={c(
          "校正解析结果，结合确认过的经历按岗位准备。每次编辑保存为新版本，保留当时的事实依据。",
          "Correct extracted content and prepare for a specific role using confirmed experiences. Edits create new versions with their evidence snapshots.",
        )}
      />
      <div className="grid grid-cols-[250px_minmax(0,1fr)] gap-7 items-start">
        <aside className="sticky top-24 space-y-5">
          <label className="block border border-dashed border-seal p-5 bg-seal-wash cursor-pointer">
            <span className="font-display font-bold">
              {busy === "upload"
                ? c("正在解析…", "Extracting…")
                : c("上传一份简历", "Upload a resume")}
            </span>
            <span className="block text-xs text-ink-soft mt-2 leading-6">
              PDF / PNG / JPG · ≤ 10MB
            </span>
            <input
              aria-label={c("上传简历文件", "Upload resume file")}
              className="mt-3 text-xs w-full"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              disabled={!!busy}
              onChange={(e) => {
                if (e.target.files?.[0]) void upload(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </label>
          <p className="text-xs leading-6 text-ink-soft">
            {c(
              "文件保存在本机。解析与优化会调用配置的模型服务；扫描件或图片会发送页面图像。正文生成前会隐藏姓名、手机号和邮箱。",
              "Files are saved locally. Extraction and optimization use configured model services; scans send page images. Name, phone and email are removed before drafting.",
            )}
          </p>
          <h2 className="font-display font-bold border-b-2 border-ink pb-2">
            {c("我的简历库", "Resume library")}
          </h2>
          <ErrorNotice
            message={library.error}
            retry={() => void library.refresh()}
          />
          {library.loading && !library.data.length ? (
            <LoadingRows />
          ) : (
            library.data.map((file) => (
              <button
                key={file.id}
                disabled={!!busy}
                className={`block w-full text-left px-3 py-3 border-l-2 border-b border-b-rule ${resumeId === file.id ? "border-l-seal bg-sheet" : "border-l-transparent"}`}
                onClick={() => void loadResume(file)}
              >
                <span className="text-sm break-all">{file.filename}</span>
                <span className="block text-xs text-ink-soft mt-1">
                  {new Date(file.created_at).toLocaleDateString()} ·{" "}
                  {file.versions?.length || 0} {c("个版本", "versions")}
                </span>
              </button>
            ))
          )}
          <Link
            className="block text-sm text-seal underline underline-offset-4"
            to="/experiences"
          >
            {c("补充真实经历素材 →", "Add experience facts →")}
          </Link>
        </aside>
        <section className="min-w-0 space-y-6">
          <ErrorNotice message={error} />
          {notice && (
            <p
              role="status"
              className="border-l-2 border-moss bg-moss/5 p-3 text-sm leading-7"
            >
              {notice}
            </p>
          )}
          {loading ? (
            <LoadingRows />
          ) : raw ? (
            <>
              <Card className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label={c("为哪个岗位准备", "Prepare for an opportunity")}
                  >
                    <select
                      className={inputBoxCls}
                      value={jobId}
                      disabled={!!busy}
                      onChange={(e) => {
                        setJobId(e.target.value);
                        const next = new URLSearchParams(params);
                        if (e.target.value) next.set("job", e.target.value);
                        else next.delete("job");
                        setParams(next, { replace: true });
                      }}
                    >
                      <option value="">
                        {c("通用 / 手动填写 JD", "General / enter a JD")}
                      </option>
                      {jobs.data.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.company} · {job.target_role} · {job.city}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={c("目标岗位", "Target role")}>
                    <input
                      className={inputBoxCls}
                      value={selectedJob?.target_role ?? role}
                      disabled={!!selectedJob || !!busy}
                      onChange={(e) => setRole(e.target.value)}
                    />
                  </Field>
                </div>
                {!selectedJob && (
                  <>
                    <Field label={c("公司（可选）", "Company (optional)")}>
                      <input
                        className={inputBoxCls}
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                      />
                    </Field>
                    <Field label={c("岗位 JD", "Job description")}>
                      <textarea
                        rows={4}
                        className={inputBoxCls}
                        value={jd}
                        onChange={(e) => setJd(e.target.value)}
                      />
                    </Field>
                  </>
                )}
                <div className="flex items-center gap-4">
                  <Button disabled={!!busy || rawDirty} onClick={optimize}>
                    {busy === "optimize"
                      ? c("生成与评审中…", "Drafting and reviewing…")
                      : c("生成一版岗位简历", "Draft a targeted version")}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!!busy || rawDirty}
                    onClick={createBaseline}
                  >
                    {busy === "baseline"
                      ? c("创建中…", "Creating…")
                      : c("从原材料手动准备", "Edit from source")}
                  </Button>
                  {rawDirty && (
                    <span className="text-xs text-seal">
                      {c(
                        "请先保存原始材料校正",
                        "Save source corrections first",
                      )}
                    </span>
                  )}
                </div>
              </Card>
              {stages.length > 0 && (
                <div className="border-l border-rule-strong pl-4 space-y-2">
                  {stages.map((stage, i) => (
                    <p key={i} className="text-xs leading-6 text-ink-soft">
                      {String(i + 1).padStart(2, "0")} · {stage}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex gap-6 border-b border-rule-strong">
                {(["source", "draft"] as const).map((name, i) => (
                  <button
                    key={name}
                    className={`pb-3 text-sm border-b-2 ${tab === name ? "border-seal text-seal" : "border-transparent"}`}
                    onClick={() => setTab(name)}
                  >
                    {
                      [
                        c("原始材料与解析校正", "Source & corrections"),
                        c("优化版本与编辑", "Versions & editing"),
                      ][i]
                    }
                  </button>
                ))}
              </div>
              {tab === "source" ? (
                <div className="space-y-5">
                  <p className="text-xs leading-6 text-ink-soft">
                    {c(
                      "对照原文件检查姓名、教育、日期和项目内容。补充新的经历建议先存入素材库并确认。",
                      "Check names, education, dates and projects against the source. Add new experiences to the archive and confirm them first.",
                    )}
                  </p>
                  <ResumeEditor
                    value={raw}
                    onChange={(next) => {
                      setRaw(next);
                      setRawDirty(true);
                      sessionStorage.setItem(
                        `jc_raw_${resumeId}`,
                        JSON.stringify(next),
                      );
                    }}
                  />
                  <Button disabled={!!busy || !rawDirty} onClick={saveSource}>
                    {busy === "source"
                      ? c("保存中…", "Saving…")
                      : c("保存解析校正", "Save source corrections")}
                  </Button>
                </div>
              ) : draft ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label={c("查看已保存版本", "Saved version")}>
                      <select
                        className={inputBoxCls}
                        value={versionId || ""}
                        disabled={!!busy}
                        onChange={(e) => {
                          const version = versions.find(
                            (v) => v.id === Number(e.target.value),
                          );
                          if (version) showVersion(version);
                        }}
                      >
                        <option value="" disabled>
                          {c("请选择", "Select")}
                        </option>
                        {versions.map((version) => (
                          <option key={version.id} value={version.id}>
                            v{version.version_no} ·{" "}
                            {version.context?.label || c("未命名", "Untitled")}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={c("新版本名称", "Version label")}>
                      <input
                        className={inputBoxCls}
                        maxLength={120}
                        value={label}
                        onChange={(e) => {
                          setLabel(e.target.value);
                          setDraftDirty(true);
                        }}
                      />
                    </Field>
                  </div>
                  {review && (
                    <details
                      open={!!issues.length}
                      className="border border-rule-strong p-4"
                    >
                      <summary className="font-display font-bold cursor-pointer">
                        {c("评审意见与修改依据", "Review and revision notes")}
                      </summary>
                      <p className="text-sm leading-7 mt-3">{review.overall}</p>
                      {review.issues?.map((issue, i) => (
                        <div
                          key={i}
                          className="text-sm leading-7 border-t border-rule mt-3 pt-3"
                        >
                          <Badge
                            tone={issue.severity === "high" ? "red" : "amber"}
                          >
                            {issue.location}
                          </Badge>
                          <p>{issue.problem}</p>
                          <p className="text-seal">{issue.suggestion}</p>
                        </div>
                      ))}
                      {!!review.ats_missing?.length && (
                        <p className="text-xs leading-7 text-ink-soft mt-3">
                          {c(
                            "正文尚未覆盖的关键词：",
                            "Keywords absent from exported content: ",
                          )}
                          {review.ats_missing.join("、")}
                        </p>
                      )}
                    </details>
                  )}
                  {!!issues.length && (
                    <div className="annotate p-4">
                      <p className="font-bold text-sm text-seal">
                        {c(
                          "此版本暂不可导出，请核对以下问题",
                          "Export paused until these issues are resolved",
                        )}
                      </p>
                      {issues.map((issue, i) => (
                        <p key={i} className="text-sm leading-7 mt-2">
                          {issue.reason}
                        </p>
                      ))}
                    </div>
                  )}
                  <ResumeEditor
                    value={draft}
                    baseline={raw}
                    onChange={(next) => {
                      setDraft(next);
                      setDraftDirty(true);
                      setAcknowledged(false);
                      if (versionId)
                        sessionStorage.setItem(
                          `jc_draft_${versionId}`,
                          JSON.stringify(next),
                        );
                    }}
                  />
                  <label className="flex items-start gap-3 text-sm leading-7 bg-sheet p-4 border border-rule-strong">
                    <input
                      type="checkbox"
                      className="mt-2"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                    />
                    <span>
                      {c(
                        "我已逐项核对正文与高风险评审意见。保存后仍会检查数字和事实依据；发现缺失时继续暂停导出。",
                        "I reviewed the content and high-risk feedback. Saving still checks factual and numerical evidence; unresolved issues continue to block export.",
                      )}
                    </span>
                  </label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button
                      disabled={!!busy || (!draftDirty && !acknowledged)}
                      onClick={saveDraft}
                    >
                      {busy === "draft"
                        ? c("保存中…", "Saving…")
                        : c("保存为新版本", "Save as a new version")}
                    </Button>
                    {versionId && !draftDirty && !issues.length && (
                      <>
                        <a
                          className="border border-rule-strong px-3 py-2 text-sm hover:text-seal"
                          href={`/api/resume-versions/${versionId}/docx`}
                        >
                          {c("下载 DOCX", "Download DOCX")}
                        </a>
                        <Link
                          className="border border-rule-strong px-3 py-2 text-sm hover:text-seal"
                          to={`/resume/print/${versionId}`}
                        >
                          {c("预览 / 另存 PDF", "Preview / save PDF")}
                        </Link>
                      </>
                    )}
                    {draftDirty && (
                      <span className="text-xs text-ochre">
                        {c(
                          "编辑已保留为会话草稿，请保存版本后导出",
                          "Edits retained as a session draft; save a version before export",
                        )}
                      </span>
                    )}
                  </div>
                  {versions.length > 1 && (
                    <div className="border-t border-rule pt-5">
                      <h3 className="font-display font-bold mb-3">
                        {c("版本对比", "Version comparisons")}
                      </h3>
                      <div className="flex flex-wrap gap-3">
                        {versions.map((version, index) => (
                          <button
                            key={version.id}
                            className="text-xs text-seal underline underline-offset-4"
                            onClick={() =>
                              setDiff({
                                current: version,
                                previous: versions[index + 1] || null,
                              })
                            }
                          >
                            v{version.version_no} ·{" "}
                            {c("查看差异", "View changes")}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  title={c("还没有优化版本", "No targeted version yet")}
                >
                  {c(
                    "确认原始材料后，选择岗位并生成第一版。素材库里已确认的经历会自动参与。",
                    "Review the source, choose an opportunity and create a version. Confirmed experiences are included automatically.",
                  )}
                </EmptyState>
              )}
            </>
          ) : (
            <EmptyState
              title={c("先上传你正在使用的简历", "Upload your current resume")}
            >
              {c(
                "解析后可以纠错，优化后可以逐段编辑；刷新页面后从左侧简历库继续。",
                "Correct extraction errors, edit revisions section by section, and resume from your saved library after refreshing.",
              )}
            </EmptyState>
          )}
        </section>
      </div>
      {diff && (
        <VersionDiff
          current={diff.current}
          previous={diff.previous}
          onClose={() => setDiff(null)}
        />
      )}
    </div>
  );
}
