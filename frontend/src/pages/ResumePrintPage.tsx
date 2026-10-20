import { Link, useParams } from "react-router-dom";
import type { ResumeVersion } from "@/api/types";
import { Button } from "@/components/ui";
import {
  ErrorNotice,
  LoadingRows,
  useCopy,
  useResource,
} from "@/components/workspace";

export default function ResumePrintPage() {
  const { vid } = useParams();
  const c = useCopy();
  const version = useResource<ResumeVersion | null>(
    `/api/resume-versions/${vid}`,
    null,
  );
  const draft = version.data?.draft_json;
  const blocked = !!version.data?.export_issues?.length;
  return (
    <div>
      <div className="resume-print-controls flex justify-between items-center mb-6">
        <Link
          className="text-sm text-seal underline"
          to={`/resume?resume=${version.data?.resume_id || ""}&version=${vid}`}
        >
          {c("返回编辑", "Back to editor")}
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs text-ink-soft">
            {c(
              "打印设置：A4，关闭页眉页脚；可选择另存为 PDF",
              "Print: A4, disable headers and footers; choose Save as PDF",
            )}
          </span>
          <Button disabled={!draft || blocked} onClick={() => window.print()}>
            {c("打印 / 另存为 PDF", "Print / save as PDF")}
          </Button>
        </div>
      </div>
      <ErrorNotice
        message={
          version.error ||
          (blocked
            ? c(
                "此版本仍有待核对问题，请返回编辑处理后再导出。",
                "Resolve this version’s review issues before exporting.",
              )
            : "")
        }
      />
      {version.loading ? (
        <LoadingRows />
      ) : draft && !blocked ? (
        <article className="resume-print-document mx-auto bg-white text-black px-12 py-10 max-w-[210mm] min-h-[297mm] shadow-print">
          <header className="text-center border-b border-black pb-4 mb-4">
            <h1 className="text-2xl font-bold">{draft.name}</h1>
            <p className="text-[10pt] mt-2">
              {[draft.phone, draft.email].filter(Boolean).join(" | ")}
            </p>
            {draft.target_role && (
              <p className="text-[11pt] mt-2">{draft.target_role}</p>
            )}
          </header>
          {draft.summary && (
            <PrintSection title={c("个人总结", "Summary")}>
              <p>{draft.summary}</p>
            </PrintSection>
          )}
          {!!draft.education.length && (
            <PrintSection title={c("教育背景", "Education")}>
              {draft.education.map((item, i) => (
                <div key={i} className="mb-3">
                  <div className="flex justify-between gap-4 font-semibold">
                    <span>
                      {[item.school, item.major, item.degree]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="shrink-0">
                      {[item.start, item.end].filter(Boolean).join(" – ")}
                    </span>
                  </div>
                  <Bullets items={item.highlights} />
                </div>
              ))}
            </PrintSection>
          )}
          {!!draft.skills.length && (
            <PrintSection title={c("专业技能", "Skills")}>
              <Bullets items={draft.skills} />
            </PrintSection>
          )}
          {!!draft.internships.length && (
            <PrintSection title={c("实习经历", "Internships")}>
              {draft.internships.map((item, i) => (
                <div key={i} className="mb-3">
                  <div className="flex justify-between gap-4 font-semibold">
                    <span>
                      {[item.org, item.role].filter(Boolean).join(" · ")}
                    </span>
                    <span className="shrink-0">
                      {[item.start, item.end].filter(Boolean).join(" – ")}
                    </span>
                  </div>
                  <Bullets items={item.bullets} />
                </div>
              ))}
            </PrintSection>
          )}
          {!!draft.projects.length && (
            <PrintSection title={c("项目经历", "Projects")}>
              {draft.projects.map((item, i) => (
                <div key={i} className="mb-3">
                  <p className="font-semibold">
                    {[item.name, item.role].filter(Boolean).join(" · ")}
                  </p>
                  <Bullets items={item.bullets} />
                </div>
              ))}
            </PrintSection>
          )}
          {!!draft.awards.length && (
            <PrintSection title={c("获奖情况", "Awards")}>
              <Bullets items={draft.awards} />
            </PrintSection>
          )}
          {!!draft.other?.length && (
            <PrintSection
              title={c("其他经历与作品", "Other experience & work")}
            >
              <Bullets items={draft.other} />
            </PrintSection>
          )}
        </article>
      ) : null}
    </div>
  );
}
function PrintSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 text-[10.5pt] leading-[1.6]">
      <h2 className="font-bold text-[12pt] border-b border-black/30 mb-2 pb-1 break-after-avoid">
        {title}
      </h2>
      {children}
    </section>
  );
}
function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5">
      {items
        .filter((item) => item.trim())
        .map((item, i) => (
          <li key={i} className="break-inside-avoid">
            {item}
          </li>
        ))}
    </ul>
  );
}
