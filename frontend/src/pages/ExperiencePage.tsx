import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { ExperienceFact } from "@/api/types";
import { Badge, Button, Field, inputBoxCls } from "@/components/ui";
import {
  EmptyState,
  ErrorNotice,
  LoadingRows,
  PageHeading,
  useCopy,
  useResource,
} from "@/components/workspace";

type FactForm = Omit<ExperienceFact, "id" | "updated_at">;
const blank: FactForm = {
  title: "",
  kind: "project",
  organization: "",
  role: "",
  situation: "",
  action: "",
  result: "",
  skills: [],
  source: "",
  confirmed: false,
};

export default function ExperiencePage() {
  const c = useCopy();
  const facts = useResource<ExperienceFact[]>("/api/experiences", []);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const current = facts.data.find((fact) => fact.id === selected);
  return (
    <div>
      <PageHeading
        index="02 / Experience archive"
        title={c("真实经历素材库", "Experience archive")}
        description={c(
          "先把做过的事讲清楚。只有你确认过的素材，才会用于岗位分析、简历优化和面试准备。",
          "Clarify what you actually did. Only experiences you confirm are used for job analysis, resume drafting and interview preparation.",
        )}
        action={
          <Button
            onClick={() => {
              setSelected(null);
              setCreating(true);
            }}
          >
            {c("补充一段经历", "Add an experience")}
          </Button>
        }
      />
      <ErrorNotice message={facts.error} retry={() => void facts.refresh()} />
      <div className="grid grid-cols-[290px_minmax(0,1fr)] gap-8 items-start">
        <aside className="sticky top-24">
          <div className="flex justify-between items-center border-b-2 border-ink pb-3 text-sm">
            <span>{c("素材索引", "Archive index")}</span>
            <span className="font-mono text-ink-soft">
              {facts.data.filter((f) => f.confirmed).length} /{" "}
              {facts.data.length}
            </span>
          </div>
          {facts.loading ? (
            <LoadingRows />
          ) : (
            <div className="divide-y divide-rule">
              {facts.data.map((fact) => (
                <button
                  key={fact.id}
                  className={`w-full text-left py-5 px-3 border-l-2 ${selected === fact.id ? "border-seal bg-seal-wash" : "border-transparent hover:bg-sheet"}`}
                  onClick={() => {
                    setSelected(fact.id);
                    setCreating(false);
                  }}
                >
                  <h2 className="font-display text-lg font-bold">
                    {fact.title}
                  </h2>
                  <p className="text-xs text-ink-soft mt-2 mb-3">
                    {[fact.organization, fact.role].filter(Boolean).join(" · ")}
                  </p>
                  <Badge tone={fact.confirmed ? "green" : "amber"}>
                    {fact.confirmed
                      ? c("用户已确认", "Confirmed by you")
                      : c(
                          "草稿 · 不参与生成",
                          "Draft · excluded from generation",
                        )}
                  </Badge>
                </button>
              ))}
            </div>
          )}
          <p className="text-xs leading-6 text-ink-soft mt-5">
            {c(
              "“用户确认”表示你核对过这段陈述，并非第三方核验。请保留原始记录、作品链接或数据来源。",
              "Confirmation means you reviewed the statement; it is not independent verification. Keep original records, work samples or data sources.",
            )}
          </p>
        </aside>
        <section>
          {creating || current ? (
            <FactEditor
              key={current ? `${current.id}:${current.updated_at}` : "new"}
              fact={current}
              onSave={async (id) => {
                await facts.refresh();
                setSelected(id);
                setCreating(false);
              }}
              onDelete={async () => {
                await facts.refresh();
                setSelected(null);
              }}
            />
          ) : (
            <EmptyState
              title={c(
                "从一个你亲手解决的问题开始",
                "Start with a problem you solved",
              )}
            >
              {c(
                "课程项目、实习、社团活动都可以。记录你负责的部分、关键选择和真实结果。没有量化数据时，也可以清楚描述交付内容与验证方式。",
                "Coursework, internships and activities all count. Describe your own contribution, choices and actual outcome. Concrete deliverables and validation are useful even without numerical metrics.",
              )}
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}

function FactEditor({
  fact,
  onSave,
  onDelete,
}: {
  fact?: ExperienceFact;
  onSave: (id: number) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const c = useCopy();
  const [form, setForm] = useState<FactForm>(fact ? { ...fact } : { ...blank });
  const [skills, setSkills] = useState(fact?.skills.join("、") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function field<K extends keyof FactForm>(key: K, value: FactForm[K]) {
    setForm((old) => ({
      ...old,
      [key]: value,
      confirmed: key === "confirmed" ? Boolean(value) : false,
    }));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = {
      ...form,
      skills: skills
        .split(/[、,，\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      source: form.source || c("用户补充", "Added by user"),
    };
    try {
      const result = fact
        ? await api.put<ExperienceFact>(`/api/experiences/${fact.id}`, body)
        : await api.post<ExperienceFact>("/api/experiences", body);
      await onSave(result.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="space-y-6" onSubmit={save}>
      <ErrorNotice message={error} />
      <div className="grid grid-cols-2 gap-5">
        <Field label={c("经历名称 *", "Experience title *")}>
          <input
            required
            className={inputBoxCls}
            maxLength={200}
            value={form.title}
            onChange={(e) => field("title", e.target.value)}
          />
        </Field>
        <Field label={c("经历类型", "Type")}>
          <select
            className={inputBoxCls}
            value={form.kind}
            onChange={(e) => field("kind", e.target.value as FactForm["kind"])}
          >
            <option value="project">{c("项目", "Project")}</option>
            <option value="internship">{c("实习", "Internship")}</option>
            <option value="education">
              {c("课程 / 学习", "Course / learning")}
            </option>
            <option value="activity">
              {c("活动 / 其他", "Activity / other")}
            </option>
          </select>
        </Field>
        <Field label={c("组织 / 单位", "Organization")}>
          <input
            className={inputBoxCls}
            value={form.organization}
            onChange={(e) => field("organization", e.target.value)}
          />
        </Field>
        <Field label={c("我的角色", "My role")}>
          <input
            className={inputBoxCls}
            value={form.role}
            onChange={(e) => field("role", e.target.value)}
          />
        </Field>
      </div>
      <div className="border-t border-rule pt-5 space-y-5">
        <div>
          <Field
            label={c(
              "01 · 当时要解决什么问题？",
              "01 · What problem needed solving?",
            )}
          >
            <textarea
              rows={3}
              className={inputBoxCls}
              value={form.situation}
              onChange={(e) => field("situation", e.target.value)}
            />
          </Field>
          <p className="text-xs leading-6 text-ink-soft mt-2">
            {c(
              "项目目标是什么？原来的做法有什么问题？哪些约束影响了选择？",
              "What was the goal? What was wrong with the original approach? What constraints shaped your choices?",
            )}
          </p>
        </div>
        <div>
          <Field
            label={c(
              "02 · 你本人具体做了什么？",
              "02 · What did you personally do?",
            )}
          >
            <textarea
              rows={5}
              className={inputBoxCls}
              value={form.action}
              onChange={(e) => field("action", e.target.value)}
            />
          </Field>
          <p className="text-xs leading-6 text-ink-soft mt-2">
            {c(
              "区分团队成果和个人贡献。写出方法、一次关键取舍，以及遇到的问题如何解决。",
              "Separate team outcomes from your contribution. Describe your method, a key trade-off and how you handled a difficulty.",
            )}
          </p>
        </div>
        <div>
          <Field
            label={c(
              "03 · 结果如何，怎样验证？",
              "03 · What changed, and how did you validate it?",
            )}
          >
            <textarea
              rows={4}
              className={inputBoxCls}
              value={form.result}
              onChange={(e) => field("result", e.target.value)}
            />
          </Field>
          <p className="text-xs leading-6 text-ink-soft mt-2">
            {c(
              "有数据时保留指标、单位、测试条件和来源。没有数据时，说明交付内容、测试或使用反馈即可。",
              "For metrics, retain units, test conditions and sources. Without metrics, describe deliverables, tests or feedback.",
            )}
          </p>
        </div>
      </div>
      <Field
        label={c(
          "实际使用的技能（用逗号或顿号分隔）",
          "Skills actually used (comma-separated)",
        )}
      >
        <input
          className={inputBoxCls}
          value={skills}
          onChange={(e) => {
            setSkills(e.target.value);
            field("confirmed", false);
          }}
        />
      </Field>
      <Field label={c("依据来自哪里？", "Where is the supporting record?")}>
        <input
          className={inputBoxCls}
          placeholder={c(
            "如：项目仓库、验收记录、实验报告，或注明个人回忆",
            "Repository, acceptance record, lab report, or personal recollection",
          )}
          value={form.source}
          onChange={(e) => field("source", e.target.value)}
        />
      </Field>
      <label className="flex items-start gap-3 border border-rule-strong bg-sheet p-4 text-sm leading-7">
        <input
          type="checkbox"
          className="mt-2"
          checked={form.confirmed}
          onChange={(e) => field("confirmed", e.target.checked)}
        />
        <span>
          {c(
            "我已核对以上内容，确认属于我的真实经历，可以用于求职材料。修改内容后需要重新确认。",
            "I reviewed these statements and confirm they describe my actual experience and may be used in application materials. Editing requires confirmation again.",
          )}
        </span>
      </label>
      <div className="flex items-center gap-4">
        <Button disabled={busy}>
          {busy
            ? c("保存中…", "Saving…")
            : form.confirmed
              ? c("保存并用于求职准备", "Save for application preparation")
              : c("保存草稿", "Save draft")}
        </Button>
        <Link
          to="/resume"
          className="text-sm text-seal underline underline-offset-4"
        >
          {c("去准备简历", "Prepare a resume")}
        </Link>
        {fact && (
          <button
            type="button"
            disabled={busy}
            className="ml-auto text-xs text-ink-soft hover:text-seal"
            onClick={async () => {
              if (
                !window.confirm(
                  c(
                    "删除这段素材？已生成的历史版本仍会保留当时的材料快照。",
                    "Delete this experience? Existing resume versions retain their original evidence snapshots.",
                  ),
                )
              )
                return;
              setBusy(true);
              try {
                await api.del(`/api/experiences/${fact.id}`);
                await onDelete();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {c("删除素材", "Delete experience")}
          </button>
        )}
      </div>
    </form>
  );
}
