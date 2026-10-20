import { useState } from "react";
import { api } from "@/api/client";
import { Button, Card, Field, inputBoxCls } from "@/components/ui";
import { ErrorNotice, useCopy } from "@/components/workspace";

export default function DataManagement() {
  const c = useCopy();
  const [confirmation, setConfirmation] = useState("");
  const [showErase, setShowErase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Card className="lg:col-span-2 p-6 space-y-5">
      <h2 className="font-display text-xl font-bold">
        {c("数据与模型使用", "Data and model use")}
      </h2>
      <p className="text-sm text-ink-soft leading-7">
        {c(
          "岗位、简历、面试和训练记录保存在本机。使用解析、优化、分析或评分时，相关材料会发送给你配置的模型服务；扫描件解析会发送页面图像。生成简历正文和岗位分析前，会隐藏姓名、手机号与邮箱。",
          "Opportunities, resumes, interviews and practice are stored locally. Extraction, drafting, analysis and scoring send relevant material to your configured model services; scan extraction sends page images. Names, phone numbers and email addresses are removed before resume drafting and opportunity analysis.",
        )}
      </p>
      <p className="text-xs text-ink-soft leading-6">
        {c(
          "可导出结构化工作区记录。清空操作会移除本工作区的记录、原文件、导出文件、长期记忆和面试恢复数据；不删除第三方服务保留的数据。",
          "Export structured workspace records. Erasing removes this workspace’s records, original files, exports, memory and interview recovery data. It does not delete data retained by external services.",
        )}
      </p>
      <div className="flex items-center gap-5">
        <a
          className="text-sm text-seal underline underline-offset-4"
          href="/api/privacy/export"
        >
          {c("导出工作区记录 JSON", "Export workspace records (JSON)")}
        </a>
        <button
          className="text-sm text-ink-soft underline underline-offset-4 hover:text-seal"
          onClick={() => setShowErase(!showErase)}
        >
          {c("清空本地工作区…", "Erase local workspace…")}
        </button>
      </div>
      {showErase && (
        <form
          className="annotate p-4 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api.post("/api/privacy/erase", { confirmation });
              for (const key of Object.keys(sessionStorage))
                if (key.startsWith("jc_")) sessionStorage.removeItem(key);
              window.location.assign("/");
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-sm leading-7 text-seal">
            {c(
              "此操作不可撤销，请先导出需要保留的记录，并等待所有生成任务结束。",
              "This cannot be undone. Export any records you need and wait for generation tasks to finish first.",
            )}
          </p>
          <Field label={c("输入 DELETE 确认", "Type DELETE to confirm")}>
            <input
              autoComplete="off"
              className={inputBoxCls}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          <ErrorNotice message={error} />
          <Button variant="danger" disabled={busy || confirmation !== "DELETE"}>
            {busy
              ? c("清空中…", "Erasing…")
              : c("确认清空此工作区", "Erase this workspace")}
          </Button>
        </form>
      )}
    </Card>
  );
}
