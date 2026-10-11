import { useEffect, useState } from "react";

import { api } from "@/api/client";
import type { MemoryItem } from "@/api/types";
import { Badge, Button, Card, Field, inputCls } from "@/components/ui";

const PROFILE_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: "school", label: "学校", placeholder: "如：某某大学" },
  { key: "major", label: "专业", placeholder: "如：软件工程" },
  { key: "grade", label: "年级", placeholder: "如：大三" },
  { key: "target_role", label: "目标岗位", placeholder: "如：Java 后端开发工程师" },
  { key: "target_city", label: "目标城市", placeholder: "如：杭州" },
  { key: "skills", label: "技能", placeholder: "如：Java、Spring Boot、MySQL" },
];

const TYPE_META: Record<string, { label: string; tone: "green" | "amber" | "blue" | "neutral" }> = {
  profile: { label: "档案", tone: "blue" },
  weakness: { label: "弱点", tone: "amber" },
  general: { label: "普通", tone: "neutral" },
};

export default function ProfilePage() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loadingMem, setLoadingMem] = useState(false);

  useEffect(() => {
    api
      .get<{ profile: Record<string, string> }>("/api/profile")
      .then((r) => setForm(r.profile || {}))
      .catch(() => {});
    refreshMemories();
  }, []);

  function refreshMemories() {
    setLoadingMem(true);
    api
      .get<{ memories: MemoryItem[] }>("/api/memories")
      .then((r) => setMemories(r.memories))
      .catch(() => {})
      .finally(() => setLoadingMem(false));
  }

  async function save() {
    setSaving(true);
    try {
      const patch = Object.fromEntries(
        Object.entries(form).filter(([, v]) => String(v).trim() !== ""),
      );
      await api.put("/api/profile", { patch });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setTimeout(refreshMemories, 5000); // 记忆提取是后台任务
    } finally {
      setSaving(false);
    }
  }

  async function removeMemory(id: string) {
    await api.del(`/api/memories/${id}`);
    setMemories((ms) => ms.filter((m) => m.id !== id));
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-bold">我的档案</h2>
          <p className="text-xs text-neutral-500 mt-1">档案会写入长期记忆：面试出题与简历优化都会参考它。</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {PROFILE_FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <input
                className={inputCls}
                placeholder={f.placeholder}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存档案"}
          </Button>
          {saved && <span className="text-sm text-emerald-400">已保存，记忆同步中…</span>}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">长期记忆</h2>
            <p className="text-xs text-neutral-500 mt-1">跨会话生效；可删除单条。</p>
          </div>
          <Button variant="ghost" onClick={refreshMemories} disabled={loadingMem}>
            {loadingMem ? "刷新中…" : "刷新"}
          </Button>
        </div>
        <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
          {memories.map((m) => {
            const t = String((m.metadata?.type as string) ?? "general");
            const meta = TYPE_META[t] ?? TYPE_META.general;
            return (
              <div key={m.id} className="flex items-start gap-2 rounded-lg border border-neutral-800 p-3 text-sm">
                <Badge tone={meta.tone}>{meta.label}</Badge>
                <span className="flex-1 leading-snug">{m.memory}</span>
                <button
                  className="text-neutral-500 hover:text-red-400 text-xs shrink-0"
                  onClick={() => removeMemory(m.id)}
                >
                  删除
                </button>
              </div>
            );
          })}
          {!memories.length && !loadingMem && (
            <p className="text-sm text-neutral-500">暂无记忆：去聊一场面试或保存档案试试。</p>
          )}
        </div>
      </Card>
    </div>
  );
}
