import { useEffect, useRef, useState } from "react";

import { api } from "@/api/client";
import { createSSEStream } from "@/api/sse";
import type { ResumeDraft, ResumeRaw, ResumeVersion, ReviewReport } from "@/api/types";
import VersionDiff from "@/components/VersionDiff";
import { Badge, Button, Card, Field, Spinner, Stamp, inputBoxCls, inputCls } from "@/components/ui";

const SEVERITY_TONE: Record<string, "red" | "amber" | "neutral"> = {
  high: "red",
  medium: "amber",
  low: "neutral",
};

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-end justify-between border-b-2 border-ink pb-2 mb-4">
      <h3 className="font-display text-base font-bold tracking-[0.08em]">{title}</h3>
      <span className="font-mono text-[10px] tracking-[0.22em] text-ink-faint">{sub}</span>
    </div>
  );
}

/* 简历稿纸里的小节标题：字 + 延伸横线 */
function DraftHeading({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 mb-1.5">
      <span className="font-display font-bold text-sm tracking-wide">{children}</span>
      <span className="h-px flex-1 bg-rule-strong" />
    </div>
  );
}

export default function ResumePage() {
  const [uploading, setUploading] = useState(false);
  const [resumeId, setResumeId] = useState<number | null>(null);
  const [raw, setRaw] = useState<ResumeRaw | null>(null);
  const [route, setRoute] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [company, setCompany] = useState("");
  const [jd, setJd] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [stages, setStages] = useState<string[]>([]);
  const [draft, setDraft] = useState<ResumeDraft | null>(null);
  const [review, setReview] = useState<ReviewReport | null>(null);
  const [reviewHistory, setReviewHistory] = useState<ReviewReport[]>([]);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [diffTarget, setDiffTarget] = useState<{ current: ResumeVersion; previous: ResumeVersion | null } | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError("");
    setRaw(null);
    setDraft(null);
    setReview(null);
    setStages([]);
    setDownloadUrl("");
    try {
      const res = await api.upload<{ resume_id: number; route: string; raw_json: ResumeRaw }>(
        "/api/resumes",
        file,
      );
      setResumeId(res.resume_id);
      setRoute(res.route);
      setRaw(res.raw_json);
      setTargetRole(res.raw_json.target_role || "");
      const vs = await api.get<ResumeVersion[]>(`/api/resumes/${res.resume_id}/versions`);
      setVersions(vs);
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  }

  function optimize() {
    if (!resumeId || optimizing) return;
    setOptimizing(true);
    setStages([]);
    setDraft(null);
    setReview(null);
    setError("");
    createSSEStream(
      `/api/resumes/${resumeId}/optimize`,
      { target_role: targetRole, company, jd_text: jd, max_iterations: 2 },
      {
        onEvent: (event, data) => {
          const d = data as Record<string, unknown>;
          if (event === "stage") setStages((s) => [...s, String(d.label ?? "")]);
          else if (event === "result") {
            setDraft(d.draft as ResumeDraft);
            setReview((d.review as ReviewReport) ?? null);
            setReviewHistory((d.review_history as ReviewReport[]) ?? []);
            setDownloadUrl(String(d.download_url ?? ""));
          } else if (event === "error") setError(String(d.message ?? "优化失败"));
          else if (event === "done") setOptimizing(false);
        },
        onClose: () => setOptimizing(false),
        onError: (e) => {
          setError(String(e));
          setOptimizing(false);
        },
      },
    );
  }

  useEffect(() => {
    if (draft && resumeId) {
      api
        .get<ResumeVersion[]>(`/api/resumes/${resumeId}/versions`)
        .then(setVersions)
        .catch(() => {});
    }
  }, [draft, resumeId]);

  function openDiff(v: ResumeVersion) {
    const idx = versions.findIndex((x) => x.id === v.id);
    const previous = idx >= 0 && idx + 1 < versions.length ? versions[idx + 1] : null;
    setDiffTarget({ current: v, previous });
  }

  const firstReview = reviewHistory[0] ?? null;
  const displayIssues = (review?.issues?.length ? review.issues : firstReview?.issues) ?? [];
  const displayAtsMissing = (review?.ats_missing?.length ? review.ats_missing : firstReview?.ats_missing) ?? [];
  const displayViolations =
    (review?.factuality_violations?.length ? review.factuality_violations : firstReview?.factuality_violations) ??
    [];
  const showingFirstRound = !review?.issues?.length && displayIssues.length > 0;

  return (
    <div className="space-y-7 max-w-5xl mx-auto">
      {/* ============ 投递口 ============ */}
      <Card className="p-5 space-y-4 animate-ink-up">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow mb-2">Resume Intake · 投递口</div>
            <h2 className="font-display text-2xl font-black tracking-wide">简历解析</h2>
            <p className="font-kai text-xs text-ink-soft mt-2 leading-5">
              支持 PDF（文本层自动识别；扫描件/照片走视觉模型）与图片；解析结果忠实原文，不加工。
            </p>
          </div>
          <Stamp size="md" className="hidden sm:inline-flex shrink-0">
            解档
          </Stamp>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <div className="border border-dashed border-rule-strong rounded-[2px] bg-sheet-bright/60 p-4 flex flex-wrap items-center gap-4">
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <>
                <Spinner /> 解析中…
              </>
            ) : (
              "上传简历文件"
            )}
          </Button>
          <span className="font-mono text-[10px] tracking-[0.18em] text-ink-faint">PDF / JPG / PNG / WEBP / TXT / MD</span>
          {route && <Badge tone={route === "vision" ? "blue" : "green"}>解析路线：{route}</Badge>}
        </div>
        {error && <p className="font-kai text-sm text-seal">✗ {error}</p>}
      </Card>

      {raw && (
        <div className="grid lg:grid-cols-2 gap-7">
          {/* 档案摘要 */}
          <Card className="p-5 space-y-4 animate-ink-up">
            <SectionTitle title="解析结果" sub="ARCHIVED" />
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-display text-2xl font-black tracking-wide">{raw.name || "未识别姓名"}</p>
                <p className="font-mono text-[11px] text-ink-faint mt-1.5">
                  {[raw.phone, raw.email].filter(Boolean).join("　｜　") || "无联系方式"}
                </p>
              </div>
              <div className="space-y-3 border-t border-rule pt-3.5 leading-6">
                <div>
                  <span className="block font-mono text-[10px] tracking-[0.2em] text-ink-faint mb-0.5">技能</span>
                  {(raw.skills || []).join("、") || "—"}
                </div>
                <div>
                  <span className="block font-mono text-[10px] tracking-[0.2em] text-ink-faint mb-0.5">教育</span>
                  {(raw.education || []).map((e) => `${e.school}${e.major ? " · " + e.major : ""}`).join("；") || "—"}
                </div>
                <div>
                  <span className="block font-mono text-[10px] tracking-[0.2em] text-ink-faint mb-0.5">实习</span>
                  {(raw.internships || []).map((e) => e.org || "（未识别单位）").join("；") || "—"}
                </div>
                <div>
                  <span className="block font-mono text-[10px] tracking-[0.2em] text-ink-faint mb-0.5">项目</span>
                  {(raw.projects || []).map((p) => p.name).join("；") || "—"}
                </div>
              </div>
            </div>
          </Card>

          {/* 目标岗位与 JD */}
          <Card className="p-5 space-y-5 animate-ink-up [animation-delay:90ms]">
            <SectionTitle title="目标岗位与 JD" sub="TARGETING" />
            <Field label="目标岗位">
              <input
                className={`${inputCls} text-[15px]`}
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
              />
            </Field>
            <Field label="公司名（可选，会真实联网调研）">
              <input
                className={`${inputCls} text-[15px]`}
                placeholder="如：字节跳动"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </Field>
            <Field label="岗位 JD（可选，填了做 ATS 关键词对齐）">
              <textarea
                className={`${inputBoxCls} resize-none font-kai text-sm leading-6`}
                rows={4}
                placeholder="粘贴招聘描述…"
                value={jd}
                onChange={(e) => setJd(e.target.value)}
              />
            </Field>
            <Button className="w-full py-2.5 tracking-[0.2em]" onClick={optimize} disabled={optimizing}>
              {optimizing ? (
                <>
                  <Spinner /> 优化中（起草 → 独立评审 → 修订）…
                </>
              ) : (
                "开始优化简历"
              )}
            </Button>
          </Card>
        </div>
      )}

      {/* 印厂流水线 */}
      {(stages.length > 0 || optimizing) && (
        <Card className="p-5 animate-ink-up">
          <SectionTitle title="优化过程" sub="PIPELINE" />
          <div className="space-y-2">
            {stages.map((s, i) => (
              <div key={i} className="flex items-center gap-3 text-sm animate-ink-up">
                <span className="font-mono text-[11px] text-ink-faint w-6">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-seal font-bold">✓</span>
                <span className="text-ink-soft">{s}</span>
              </div>
            ))}
            {optimizing && (
              <div className="flex items-center gap-3 text-sm text-ink-faint">
                <span className="font-mono text-[11px] w-6">{String(stages.length + 1).padStart(2, "0")}</span>
                <Spinner />
                <span className="font-kai">{stages[stages.length - 1] ? "处理中…" : "启动中…"}</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {draft && (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-7">
          {/* 校样：优化后简历 */}
          <Card className="p-6 space-y-4 animate-ink-up">
            <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-2 mb-4">
              <div className="flex items-baseline gap-3">
                <h3 className="font-display text-base font-bold tracking-[0.08em]">优化后简历</h3>
                <span className="font-mono text-[10px] tracking-[0.22em] text-ink-faint">PROOF</span>
              </div>
              {downloadUrl && (
                <a href={downloadUrl} className="shrink-0">
                  <Button>下载 .docx</Button>
                </a>
              )}
            </div>
            <div className="text-sm leading-relaxed space-y-4">
              <div>
                <div className="font-display text-2xl font-black tracking-wide">{draft.name}</div>
                <div className="font-mono text-[11px] text-ink-faint mt-1.5">
                  {[draft.phone, draft.email].filter(Boolean).join("　｜　")}
                </div>
                {draft.target_role && (
                  <div className="font-kai text-xs text-seal mt-1.5">求职意向：{draft.target_role}</div>
                )}
              </div>

              {draft.summary && (
                <div>
                  <DraftHeading>个人总结</DraftHeading>
                  <p className="text-ink-soft leading-7">{draft.summary}</p>
                </div>
              )}

              {!!draft.skills?.length && (
                <div>
                  <DraftHeading>专业技能</DraftHeading>
                  {draft.skills.map((s, i) => (
                    <div key={i} className="flex gap-2 leading-7">
                      <span className="text-seal shrink-0">·</span>
                      <span className="text-ink-soft">{s}</span>
                    </div>
                  ))}
                </div>
              )}

              {!!draft.internships?.length && (
                <div>
                  <DraftHeading>实习经历</DraftHeading>
                  {draft.internships.map((it, i) => (
                    <div key={i} className="mb-2.5">
                      <div className="font-medium font-display">
                        {[it.org, it.role].filter(Boolean).join(" ｜ ")}
                      </div>
                      {it.bullets.map((b, j) => (
                        <div key={j} className="flex gap-2 leading-7">
                          <span className="text-seal shrink-0">·</span>
                          <span className="text-ink-soft">{b}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {!!draft.projects?.length && (
                <div>
                  <DraftHeading>项目经历</DraftHeading>
                  {draft.projects.map((p, i) => (
                    <div key={i} className="mb-2.5">
                      <div className="font-medium font-display">
                        {[p.name, p.role].filter(Boolean).join(" ｜ ")}
                      </div>
                      {p.bullets.map((b, j) => (
                        <div key={j} className="flex gap-2 leading-7">
                          <span className="text-seal shrink-0">·</span>
                          <span className="text-ink-soft">{b}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {!!draft.target_gaps?.length && (
                <div className="annotate rounded-[2px] p-3">
                  <span className="font-mono text-[10px] tracking-[0.18em] text-seal font-bold">
                    待补齐（JD 要求但暂未具备，诚实标注）
                  </span>
                  <div className="mt-1.5 font-kai text-xs leading-6 text-ink-soft">
                    {draft.target_gaps.join("、")}
                  </div>
                </div>
              )}
            </div>
          </Card>

          <div className="space-y-7">
            {/* 独立评审意见（红笔批注） */}
            {review && (
              <Card className="p-5 space-y-4 animate-ink-up">
                <SectionTitle title="独立评审意见" sub="REVIEW" />
                {showingFirstRound && (
                  <p className="font-kai text-xs text-ink-faint">以下为首轮评审发现的问题，已由修订循环处理：</p>
                )}
                {review.overall && (
                  <p className="font-kai text-xs leading-6 text-ink-soft border-l-2 border-rule-strong pl-3">
                    {review.overall}
                  </p>
                )}
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {displayIssues.map((issue, i) => (
                    <div key={i} className="border border-rule-strong bg-sheet-bright rounded-[2px] p-3 text-xs space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Badge tone={SEVERITY_TONE[issue.severity] ?? "neutral"}>{issue.severity}</Badge>
                        <span className="font-mono text-[10px] text-ink-faint truncate">{issue.location}</span>
                      </div>
                      <p className="text-ink leading-5">{issue.problem}</p>
                      <p className="text-seal leading-5">→ {issue.suggestion}</p>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-ink-faint pt-3 border-t border-rule space-y-1.5 font-kai">
                  {!!displayAtsMissing.length && <p>ATS 缺失关键词：{displayAtsMissing.join("、")}</p>}
                  {!!displayViolations.length && (
                    <p className="text-seal">防虚构拦截：{displayViolations.map((v) => v.value).join("、")}</p>
                  )}
                </div>
              </Card>
            )}

            {/* 历史版本台账 */}
            {versions.length > 0 && (
              <Card className="p-5 space-y-3 animate-ink-up [animation-delay:90ms]">
                <SectionTitle title="历史版本" sub="VERSIONS" />
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-2 text-xs border-b border-dotted border-rule pb-2 last:border-0 last:pb-0"
                  >
                    <span className="font-mono text-[11px] text-ink-soft">
                      v{v.version_no} · {new Date(v.created_at).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <button className="text-seal hover:underline underline-offset-2" onClick={() => openDiff(v)}>
                        对比
                      </button>
                      <a
                        className="text-ink-soft hover:text-ink hover:underline underline-offset-2 font-mono"
                        href={`/api/resume-versions/${v.id}/docx`}
                      >
                        下载
                      </a>
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </div>
        </div>
      )}

      {diffTarget && (
        <VersionDiff
          current={diffTarget.current}
          previous={diffTarget.previous}
          onClose={() => setDiffTarget(null)}
        />
      )}
    </div>
  );
}
