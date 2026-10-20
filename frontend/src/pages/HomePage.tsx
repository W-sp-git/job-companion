import { Link } from "react-router-dom";
import type { Job, PracticeTask, SessionInfo } from "@/api/types";
import { Badge, Button, Card } from "@/components/ui";
import {
  EmptyState,
  ErrorNotice,
  LoadingRows,
  PageHeading,
  jobStatusLabel,
  localDay,
  useCopy,
  useResource,
} from "@/components/workspace";

export default function HomePage() {
  const c = useCopy();
  const jobs = useResource<Job[]>("/api/jobs", []);
  const practice = useResource<PracticeTask[]>("/api/practice", []);
  const sessions = useResource<SessionInfo[]>("/api/interview/sessions", []);
  const today = localDay();
  const active = jobs.data.filter(
    (job) => !["rejected", "withdrawn"].includes(job.status),
  );
  const actions = active
    .flatMap((job) => [
      ...(job.next_action
        ? [
            {
              title: job.next_action,
              context: `${job.company} · ${job.target_role}`,
              date: job.action_date,
              to: `/jobs/${job.id}`,
              kind: c("下一步", "Next action"),
            },
          ]
        : []),
      ...(["saved", "preparing"].includes(job.status) && job.deadline
        ? [
            {
              title: c(
                "完成申请并确认投递记录",
                "Submit application and record it",
              ),
              context: `${job.company} · ${job.target_role}`,
              date: job.deadline,
              to: `/jobs/${job.id}`,
              kind: c("申请截止", "Deadline"),
            },
          ]
        : []),
    ])
    .concat(
      practice.data
        .filter((task) => task.status !== "completed")
        .map((task) => ({
          title: task.skill,
          context: c("十分钟专项练习", "10-minute focused practice"),
          date: task.due_date,
          to: `/practice?task=${task.id}`,
          kind: c("训练", "Practice"),
        })),
    )
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const due = actions.filter((action) => action.date && action.date <= today);
  return (
    <div className="space-y-8 pb-4">
      <PageHeading
        index={`${today.replaceAll("-", ".")} / Your preparation`}
        title={c("今天，往前走一步。", "One concrete step today.")}
        description={c(
          "先处理有时间要求的事，再练一个具体问题。你的求职材料和每次准备都会保留在这里。",
          "Start with time-sensitive actions, then work on one specific skill. Your materials and preparation stay organized here.",
        )}
        action={
          <Link to="/jobs/new">
            <Button>{c("保存一个岗位", "Save an opportunity")}</Button>
          </Link>
        }
      />
      <ErrorNotice
        message={jobs.error || practice.error}
        retry={() => {
          void jobs.refresh();
          void practice.refresh();
        }}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-8">
        <section>
          <div className="flex justify-between items-end border-b-2 border-ink pb-3">
            <h2 className="font-display text-xl font-bold">
              {c("接下来要做的事", "Next actions")}
            </h2>
            <span className="text-xs text-ink-soft">
              {due.length
                ? c(
                    `${due.length} 项今天或已到期`,
                    `${due.length} due today or overdue`,
                  )
                : c("按安排日期排序", "Ordered by planned date")}
            </span>
          </div>
          {jobs.loading || practice.loading ? (
            <LoadingRows />
          ) : actions.length ? (
            <div className="divide-y divide-rule">
              {actions.slice(0, 8).map((action, i) => (
                <Link
                  key={`${action.to}:${action.kind}:${i}`}
                  to={action.to}
                  className="group grid grid-cols-[36px_minmax(0,1fr)_100px] gap-3 py-5 items-start hover:bg-sheet transition-colors"
                >
                  <span className="font-latin text-2xl text-seal">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-medium leading-7 group-hover:text-seal">
                      {action.title}
                    </h3>
                    <p className="text-xs leading-6 text-ink-soft mt-1">
                      {action.context} · {action.kind}
                    </p>
                  </div>
                  <span
                    className={`text-xs pt-1 text-right ${action.date && action.date <= today ? "text-seal" : "text-ink-soft"}`}
                  >
                    {action.date || c("待安排", "Unscheduled")}
                    {action.date && action.date < today && (
                      <span className="block mt-1">
                        {c("请更新安排", "Update schedule")}
                      </span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title={c("给下一步留个位置", "Make room for your next step")}
              to="/jobs/new"
              action={c("从真实岗位开始", "Start with a real opportunity")}
            >
              {c(
                "保存正在考虑的岗位，写下下一步行动和日期。面试复盘里的短板也可以直接变成训练。",
                "Save an opportunity and give its next action a date. Weaknesses from interview reviews can become focused practice.",
              )}
            </EmptyState>
          )}
        </section>
        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-lg font-bold border-b border-rule pb-3">
              {c("我的求职档案", "My application desk")}
            </h2>
            <dl className="divide-y divide-rule text-sm">
              {[
                [
                  c("在关注的岗位", "Active opportunities"),
                  active.length,
                  "/jobs",
                ],
                [
                  c("等待回复", "Awaiting reply"),
                  jobs.data.filter((j) => j.status === "applied").length,
                  "/jobs",
                ],
                [
                  c("待练习的能力点", "Practice in queue"),
                  practice.data.filter((t) => t.status !== "completed").length,
                  "/practice",
                ],
              ].map(([label, count, to]) => (
                <div key={label} className="flex justify-between py-3">
                  <dt>
                    <Link to={String(to)} className="hover:text-seal">
                      {label}
                    </Link>
                  </dt>
                  <dd className="font-mono">{count}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <div className="border-t border-ink pt-4">
            <h3 className="font-display font-bold mb-2">
              {c("先积累真实经历", "Build on actual experience")}
            </h3>
            <p className="text-sm leading-7 text-ink-soft">
              {c(
                "做过什么、为什么这样做、结果怎样——确认一次，简历和面试都能复用。",
                "What you did, why you chose it, and what changed. Confirm it once, then reuse it in resumes and interviews.",
              )}
            </p>
            <Link
              className="inline-block mt-3 text-sm text-seal underline underline-offset-4"
              to="/experiences"
            >
              {c("整理经历素材", "Organize experiences")}
            </Link>
          </div>
        </aside>
      </div>
      {active.length > 0 && (
        <section>
          <div className="flex justify-between border-b-2 border-ink pb-3">
            <h2 className="font-display text-xl font-bold">
              {c("正在推进的岗位", "Active opportunities")}
            </h2>
            <Link to="/jobs" className="text-sm text-seal">
              {c("查看全部 →", "View all →")}
            </Link>
          </div>
          <div className="divide-y divide-rule">
            {active.slice(0, 5).map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                className="flex items-center justify-between gap-5 py-4 hover:text-seal"
              >
                <span className="font-display font-bold w-44">
                  {job.company}
                </span>
                <span className="text-sm flex-1">
                  {job.target_role}{" "}
                  <span className="text-ink-soft ml-3 text-xs">{job.city}</span>
                </span>
                <Badge>{jobStatusLabel(job.status, c)}</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}
      {sessions.data.length > 0 && (
        <section>
          <div className="flex justify-between border-b border-rule-strong pb-3">
            <h2 className="font-display text-lg font-bold">
              {c("最近的模拟面试", "Recent mock interviews")}
            </h2>
            <Link to="/interview" className="text-sm text-seal">
              {c("开始一次面试 →", "Start an interview →")}
            </Link>
          </div>
          {sessions.data.slice(0, 3).map((session) => (
            <Link
              key={session.id}
              to={`/interview/${session.id}`}
              className="flex justify-between gap-4 py-3 border-b border-rule text-sm"
            >
              <span>
                {session.company} · {session.target_role}
              </span>
              <span className="text-ink-soft">
                {session.total_score != null
                  ? `${Math.round(session.total_score)} / 100`
                  : c("继续准备", "Continue")}
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
