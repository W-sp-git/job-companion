import { useEffect, useRef, useState } from "react";

import { api } from "@/api/client";
import { createSSEStream } from "@/api/sse";
import type { ResumeDraft, ResumeRaw, ResumeVersion, ReviewReport } from "@/api/types";
import VersionDiff from "@/components/VersionDiff";
import { Badge, Button, Card, Field, Spinner, inputCls } from "@/components/ui";

const SEVERITY_TONE: Record<string, "red" | "amber" | "neutral"> = {
  high: "red",
  medium: "amber",
  low: "neutral",
};

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
    <div className="space-y-6 max-w-5xl mx-auto">
      <Card className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">简历解析</h2>
          <p className="text-xs text-neutral-500 mt-1">
            支持 PDF（文本层自动识别；扫描件/照片走视觉模型）与图片；解析结果忠实原文，不加工。
          </p>
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
        <div className="flex items-center gap-3">
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <>
                <Spinner /> 解析中…
              </>
            ) : (
              "上传简历文件"
            )}
          </Button>
          {route && <Badge tone={route === "vision" ? "blue" : "green"}>解析路线：{route}</Badge>}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </Card>

      {raw && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="space-y-3">
            <h3 className="font-semibold text-sm">解析结果（{raw.name || "未识别姓名"}）</h3>
            <div className="text-sm space-y-2 text-neutral-300">
              <p className="text-neutral-500 text-xs">
                {[raw.phone, raw.email].filter(Boolean).join(" ｜ ") || "无联系方式"}
              </p>
              <div>
                <span className="text-neutral-500 text-xs">技能：</span>
                {(raw.skills || []).join("、") || "—"}
              </div>
              <div>
                <span className="text-neutral-500 text-xs">教育：</span>
                {(raw.education || []).map((e) => `${e.school}${e.major ? " · " + e.major : ""}`).join("；") || "—"}
              </div>
              <div>
                <span className="text-neutral-500 text-xs">实习：</span>
                {(raw.internships || []).map((e) => e.org || "（未识别单位）").join("；") || "—"}
              </div>
              <div>
                <span className="text-neutral-500 text-xs">项目：</span>
                {(raw.projects || []).map((p) => p.name).join("；") || "—"}
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <h3 className="font-semibold text-sm">目标岗位与 JD</h3>
            <Field label="目标岗位">
              <input className={inputCls} value={targetRole} onChange={(e) => setTargetRole(e.target.value)} />
            </Field>
            <Field label="公司名（可选，会真实联网调研）">
              <input
                className={inputCls}
                placeholder="如：字节跳动"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </Field>
            <Field label="岗位 JD（可选，填了做 ATS 关键词对齐）">
              <textarea
                className={`${inputCls} resize-none`}
                rows={4}
                placeholder="粘贴招聘描述…"
                value={jd}
                onChange={(e) => setJd(e.target.value)}
              />
            </Field>
            <Button className="w-full" onClick={optimize} disabled={optimizing}>
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

      {(stages.length > 0 || optimizing) && (
        <Card>
          <h3 className="font-semibold text-sm mb-3">优化过程</h3>
          <div className="space-y-1.5">
            {stages.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-neutral-300">
                <span className="text-emerald-400">✓</span>
                {s}
              </div>
            ))}
            {optimizing && (
              <div className="flex items-center gap-2 text-sm text-neutral-400">
                <Spinner />
                {stages[stages.length - 1] ? "处理中…" : "启动中…"}
              </div>
            )}
          </div>
        </Card>
      )}

      {draft && (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">优化后简历</h3>
              {downloadUrl && (
                <a href={downloadUrl}>
                  <Button>下载 .docx</Button>
                </a>
              )}
            </div>
            <div className="text-sm leading-relaxed space-y-3 text-neutral-200">
              <div>
                <div className="text-base font-bold">{draft.name}</div>
                <div className="text-xs text-neutral-500">{[draft.phone, draft.email].filter(Boolean).join(" ｜ ")}</div>
                {draft.target_role && <div className="text-xs text-emerald-400 mt-0.5">求职意向：{draft.target_role}</div>}
              </div>
              {draft.summary && (
                <p className="text-neutral-300">
                  <span className="text-neutral-500 text-xs block mb-0.5">个人总结</span>
                  {draft.summary}
                </p>
              )}
              {!!draft.skills?.length && (
                <div>
                  <span className="text-neutral-500 text-xs block mb-0.5">专业技能</span>
                  {draft.skills.map((s, i) => (
                    <div key={i}>· {s}</div>
                  ))}
                </div>
              )}
              {!!draft.internships?.length && (
                <div>
                  <span className="text-neutral-500 text-xs block mb-0.5">实习经历</span>
                  {draft.internships.map((it, i) => (
                    <div key={i} className="mb-1.5">
                      <div className="font-medium">{[it.org, it.role].filter(Boolean).join(" | ")}</div>
                      {it.bullets.map((b, j) => (
                        <div key={j}>· {b}</div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {!!draft.projects?.length && (
                <div>
                  <span className="text-neutral-500 text-xs block mb-0.5">项目经历</span>
                  {draft.projects.map((p, i) => (
                    <div key={i} className="mb-1.5">
                      <div className="font-medium">{[p.name, p.role].filter(Boolean).join(" | ")}</div>
                      {p.bullets.map((b, j) => (
                        <div key={j}>· {b}</div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {!!draft.target_gaps?.length && (
                <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 p-2.5">
                  <span className="text-amber-400 text-xs font-medium">待补齐（JD 要求但暂未具备，诚实标注）</span>
                  <div className="mt-1 text-amber-200/90 text-xs">{draft.target_gaps.join("、")}</div>
                </div>
              )}
            </div>
          </Card>

          <div className="space-y-6">
            {review && (
              <Card className="space-y-3">
                <h3 className="font-semibold text-sm">独立评审意见</h3>
                {showingFirstRound && (
                  <p className="text-xs text-neutral-500">以下为首轮评审发现的问题，已由修订循环处理：</p>
                )}
                {review.overall && <p className="text-xs text-neutral-400 leading-relaxed">{review.overall}</p>}
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {displayIssues.map((issue, i) => (
                    <div key={i} className="rounded-lg border border-neutral-800 p-2.5 text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge tone={SEVERITY_TONE[issue.severity] ?? "neutral"}>{issue.severity}</Badge>
                        <span className="text-neutral-500 truncate">{issue.location}</span>
                      </div>
                      <p className="text-neutral-300">{issue.problem}</p>
                      <p className="text-emerald-300/90">→ {issue.suggestion}</p>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-neutral-500 pt-1 border-t border-neutral-800 space-y-1">
                  {!!displayAtsMissing.length && <p>ATS 缺失关键词：{displayAtsMissing.join("、")}</p>}
                  {!!displayViolations.length && (
                    <p className="text-amber-400">防虚构拦截：{displayViolations.map((v) => v.value).join("、")}</p>
                  )}
                </div>
              </Card>
            )}

            {versions.length > 0 && (
              <Card className="space-y-2">
                <h3 className="font-semibold text-sm">历史版本</h3>
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between text-xs rounded-lg border border-neutral-800 px-3 py-2"
                  >
                    <span>
                      v{v.version_no} · {new Date(v.created_at).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-2">
                      <button className="text-emerald-400 hover:underline" onClick={() => openDiff(v)}>
                        对比
                      </button>
                      <a className="text-neutral-400 hover:underline" href={`/api/resume-versions/${v.id}/docx`}>
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
