import type { ResumeDraft, ResumeRaw } from "@/api/types";
import { Button, Field, inputBoxCls } from "@/components/ui";
import { useCopy } from "@/components/workspace";

export function ResumeEditor<T extends ResumeRaw | ResumeDraft>({
  value,
  onChange,
  baseline,
}: {
  value: T;
  onChange: (value: T) => void;
  baseline?: ResumeRaw | ResumeDraft;
}) {
  const c = useCopy();
  const patch = (values: Partial<ResumeRaw & ResumeDraft>) =>
    onChange({ ...value, ...values });
  const section = (
    title: string,
    key: "education" | "skills" | "internships" | "projects" | "awards",
    children: React.ReactNode,
  ) => (
    <section className="border-t border-rule-strong pt-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-lg">{title}</h3>
        {baseline && (
          <button
            type="button"
            className="text-xs text-seal underline underline-offset-4"
            onClick={() =>
              patch({ [key]: structuredClone(baseline[key]) } as Partial<
                ResumeRaw & ResumeDraft
              >)
            }
          >
            {c("恢复原材料本节", "Restore this source section")}
          </button>
        )}
      </div>
      {children}
    </section>
  );
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {(["name", "phone", "email", "target_role"] as const).map((key, i) => (
          <Field
            key={key}
            label={
              [
                c("姓名", "Name"),
                c("手机", "Phone"),
                c("邮箱", "Email"),
                c("求职意向", "Target role"),
              ][i]
            }
          >
            <input
              className={inputBoxCls}
              value={value[key]}
              onChange={(e) =>
                patch({ [key]: e.target.value } as Partial<
                  ResumeRaw & ResumeDraft
                >)
              }
            />
          </Field>
        ))}
      </div>
      {"summary" in value && (
        <Field label={c("个人总结", "Summary")}>
          <textarea
            rows={3}
            className={inputBoxCls}
            value={value.summary}
            onChange={(e) =>
              patch({ summary: e.target.value } as Partial<
                ResumeRaw & ResumeDraft
              >)
            }
          />
        </Field>
      )}
      {section(
        c("教育背景", "Education"),
        "education",
        <>
          {value.education.map((item, index) => (
            <div key={index} className="border-l-2 border-rule pl-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {(["school", "major", "degree", "start", "end"] as const).map(
                  (key, i) => (
                    <Field
                      key={key}
                      label={
                        [
                          c("学校", "School"),
                          c("专业", "Major"),
                          c("学历", "Degree"),
                          c("开始时间", "Start"),
                          c("结束时间", "End"),
                        ][i]
                      }
                    >
                      <input
                        className={inputBoxCls}
                        value={item[key]}
                        onChange={(e) =>
                          patch({
                            education: value.education.map((row, n) =>
                              n === index
                                ? { ...row, [key]: e.target.value }
                                : row,
                            ),
                          } as Partial<ResumeRaw & ResumeDraft>)
                        }
                      />
                    </Field>
                  ),
                )}
              </div>
              <Lines
                label={c("亮点（每行一条）", "Highlights (one per line)")}
                value={item.highlights}
                onChange={(highlights) =>
                  patch({
                    education: value.education.map((row, n) =>
                      n === index ? { ...row, highlights } : row,
                    ),
                  } as Partial<ResumeRaw & ResumeDraft>)
                }
              />
              <Remove
                onClick={() =>
                  patch({
                    education: value.education.filter((_, n) => n !== index),
                  } as Partial<ResumeRaw & ResumeDraft>)
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              patch({
                education: [
                  ...value.education,
                  {
                    school: "",
                    major: "",
                    degree: "",
                    start: "",
                    end: "",
                    highlights: [],
                  },
                ],
              } as Partial<ResumeRaw & ResumeDraft>)
            }
          >
            {c("添加教育经历", "Add education")}
          </Button>
        </>,
      )}
      {section(
        c("专业技能", "Skills"),
        "skills",
        <Lines
          label={c("每行一项真实技能", "One actual skill per line")}
          value={value.skills}
          onChange={(skills) =>
            patch({ skills } as Partial<ResumeRaw & ResumeDraft>)
          }
        />,
      )}
      {section(
        c("实习经历", "Internships"),
        "internships",
        <>
          {value.internships.map((item, index) => (
            <div key={index} className="border-l-2 border-rule pl-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {(["org", "role", "start", "end"] as const).map((key, i) => (
                  <Field
                    key={key}
                    label={
                      [
                        c("单位", "Organization"),
                        c("角色", "Role"),
                        c("开始时间", "Start"),
                        c("结束时间", "End"),
                      ][i]
                    }
                  >
                    <input
                      className={inputBoxCls}
                      value={item[key]}
                      onChange={(e) =>
                        patch({
                          internships: value.internships.map((row, n) =>
                            n === index
                              ? { ...row, [key]: e.target.value }
                              : row,
                          ),
                        } as Partial<ResumeRaw & ResumeDraft>)
                      }
                    />
                  </Field>
                ))}
              </div>
              <Lines
                label={c(
                  "具体贡献（每行一条）",
                  "Contributions (one per line)",
                )}
                value={item.bullets}
                onChange={(bullets) =>
                  patch({
                    internships: value.internships.map((row, n) =>
                      n === index ? { ...row, bullets } : row,
                    ),
                  } as Partial<ResumeRaw & ResumeDraft>)
                }
              />
              <Remove
                onClick={() =>
                  patch({
                    internships: value.internships.filter(
                      (_, n) => n !== index,
                    ),
                  } as Partial<ResumeRaw & ResumeDraft>)
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              patch({
                internships: [
                  ...value.internships,
                  { org: "", role: "", start: "", end: "", bullets: [] },
                ],
              } as Partial<ResumeRaw & ResumeDraft>)
            }
          >
            {c("添加实习经历", "Add internship")}
          </Button>
        </>,
      )}
      {section(
        c("项目经历", "Projects"),
        "projects",
        <>
          {value.projects.map((item, index) => (
            <div key={index} className="border-l-2 border-rule pl-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={c("项目名称", "Project name")}>
                  <input
                    className={inputBoxCls}
                    value={item.name}
                    onChange={(e) =>
                      patch({
                        projects: value.projects.map((row, n) =>
                          n === index ? { ...row, name: e.target.value } : row,
                        ),
                      } as Partial<ResumeRaw & ResumeDraft>)
                    }
                  />
                </Field>
                <Field label={c("我的角色", "My role")}>
                  <input
                    className={inputBoxCls}
                    value={item.role}
                    onChange={(e) =>
                      patch({
                        projects: value.projects.map((row, n) =>
                          n === index ? { ...row, role: e.target.value } : row,
                        ),
                      } as Partial<ResumeRaw & ResumeDraft>)
                    }
                  />
                </Field>
              </div>
              <Lines
                label={c(
                  "具体贡献（每行一条）",
                  "Contributions (one per line)",
                )}
                value={item.bullets}
                onChange={(bullets) =>
                  patch({
                    projects: value.projects.map((row, n) =>
                      n === index ? { ...row, bullets } : row,
                    ),
                  } as Partial<ResumeRaw & ResumeDraft>)
                }
              />
              <Remove
                onClick={() =>
                  patch({
                    projects: value.projects.filter((_, n) => n !== index),
                  } as Partial<ResumeRaw & ResumeDraft>)
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              patch({
                projects: [
                  ...value.projects,
                  { name: "", role: "", bullets: [] },
                ],
              } as Partial<ResumeRaw & ResumeDraft>)
            }
          >
            {c("添加项目", "Add project")}
          </Button>
        </>,
      )}
      {section(
        c("获奖情况", "Awards"),
        "awards",
        <Lines
          label={c("每行一条", "One per line")}
          value={value.awards}
          onChange={(awards) =>
            patch({ awards } as Partial<ResumeRaw & ResumeDraft>)
          }
        />,
      )}
      {"other" in value && (
        <Lines
          label={
            "target_gaps" in value
              ? c(
                  "其他经历与作品（每行一条）",
                  "Other experience & work (one per line)",
                )
              : c(
                  "其他原始材料（每行一条）",
                  "Other source material (one per line)",
                )
          }
          value={value.other || []}
          onChange={(other) =>
            patch({ other } as Partial<ResumeRaw & ResumeDraft>)
          }
        />
      )}
      {"target_gaps" in value && (
        <div className="annotate p-4">
          <Lines
            label={c(
              "待补齐能力（不计入投递正文或关键词覆盖）",
              "Skill gaps (excluded from exported content and keyword coverage)",
            )}
            value={value.target_gaps}
            onChange={(target_gaps) =>
              patch({ target_gaps } as Partial<ResumeRaw & ResumeDraft>)
            }
          />
        </div>
      )}
    </div>
  );
}

function Lines({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <Field label={label}>
      <textarea
        className={`${inputBoxCls} leading-7`}
        rows={Math.max(3, Math.min(7, value.length + 1))}
        value={value.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
      />
    </Field>
  );
}
function Remove({ onClick }: { onClick: () => void }) {
  const c = useCopy();
  return (
    <button
      type="button"
      className="text-xs text-ink-soft hover:text-seal"
      onClick={onClick}
    >
      {c("移除此项", "Remove entry")}
    </button>
  );
}
