import { useState } from "react";
import type { Job } from "@/api/types";
import { Badge, inputBoxCls } from "@/components/ui";
import { useCopy } from "@/components/workspace";

export default function OpportunityCompare({ jobs }: { jobs: Job[] }) {
  const c = useCopy();
  const [ids, setIds] = useState([
    String(jobs[0]?.id || ""),
    String(jobs[1]?.id || ""),
  ]);
  return (
    <section className="border-b-2 border-ink pb-7 mb-7 space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold">
          {c("对比候选岗位", "Compare opportunities")}
        </h2>
        <p className="text-xs leading-6 text-ink-soft mt-2">
          {c(
            "对照已有材料与准备成本选择方向。这里不排名、不预测录用概率；没有分析的岗位会保留为空。",
            "Compare evidence and preparation needs to choose a direction. Opportunities are not ranked and hiring outcomes are not predicted.",
          )}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-6">
        {ids.map((id, index) => {
          const job = jobs.find((item) => item.id === Number(id));
          const analysis = job?.analysis_json;
          const requirements = analysis?.requirements || [];
          return (
            <article
              key={index}
              className="border-l-2 border-rule-strong pl-5 space-y-4"
            >
              <select
                aria-label={c(
                  `对比岗位 ${index + 1}`,
                  `Comparison opportunity ${index + 1}`,
                )}
                className={inputBoxCls}
                value={id}
                onChange={(e) =>
                  setIds((previous) =>
                    previous.map((value, slot) =>
                      slot === index ? e.target.value : value,
                    ),
                  )
                }
              >
                <option value="">
                  {c("选择岗位", "Select an opportunity")}
                </option>
                {jobs
                  .filter(
                    (item) =>
                      !ids.some(
                        (value, slot) =>
                          slot !== index && Number(value) === item.id,
                      ),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.company} · {item.target_role} · {item.city}
                    </option>
                  ))}
              </select>
              {job && (
                <>
                  <p className="text-sm text-ink-soft">
                    {[
                      job.city,
                      job.batch,
                      job.deadline &&
                        c(`截止 ${job.deadline}`, `Closes ${job.deadline}`),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {job.analysis_stale ? (
                    <Badge tone="amber">
                      {c(
                        "材料已变化，请重新分析",
                        "Evidence changed · reanalyze",
                      )}
                    </Badge>
                  ) : analysis?.summary ? (
                    <>
                      <p className="text-sm leading-7">{analysis.summary}</p>
                      <div className="border-t border-rule pt-3">
                        <h3 className="font-bold text-sm mb-2">
                          {c(
                            "现有材料能支撑什么",
                            "What the evidence supports",
                          )}
                        </h3>
                        {requirements
                          .filter((item) => item.status === "supported")
                          .map((item, i) => (
                            <p key={i} className="text-sm leading-7 text-moss">
                              {item.requirement}
                            </p>
                          ))}
                        {!requirements.some(
                          (item) => item.status === "supported",
                        ) && (
                          <p className="text-sm leading-7 text-ink-soft">
                            {c(
                              "尚无明确支撑的要求",
                              "No requirements explicitly supported yet",
                            )}
                          </p>
                        )}
                      </div>
                      <div className="border-t border-rule pt-3">
                        <h3 className="font-bold text-sm mb-2">
                          {c(
                            "需要补充或确认",
                            "Needs evidence or clarification",
                          )}
                        </h3>
                        {requirements
                          .filter((item) => item.status !== "supported")
                          .map((item, i) => (
                            <p key={i} className="text-sm leading-7">
                              {item.requirement}
                            </p>
                          ))}
                      </div>
                      <div className="border-t border-rule pt-3">
                        <h3 className="font-bold text-sm mb-2">
                          {c("主要准备行动", "Main preparation steps")}
                        </h3>
                        {analysis.preparation?.slice(0, 3).map((item, i) => (
                          <p
                            key={i}
                            className="text-sm leading-7 text-ink-soft"
                          >
                            {i + 1}. {item}
                          </p>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm leading-7 text-ink-soft">
                      {c(
                        "先在岗位档案完成要求分析，再进行材料对照。",
                        "Analyze the requirements in this opportunity before comparing the evidence.",
                      )}
                    </p>
                  )}
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
