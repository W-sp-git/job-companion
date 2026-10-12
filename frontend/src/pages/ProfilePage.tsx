import { useEffect, useState } from "react";

import { api } from "@/api/client";
import type { MemoryItem } from "@/api/types";
import StatsPanel from "@/components/StatsPanel";
import { Badge, Button, Card, Field, Stamp, inputCls } from "@/components/ui";

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
    <div className="grid lg:grid-cols-2 gap-7 max-w-5xl mx-auto">
      {/* ============ 人事档案卡 ============ */}
      <Card
        className="p-6 space-y-5 animate-ink-up"
        tapeClass="left-1/2 -translate-x-1/2 -top-2.5 w-24 rotate-[-2deg]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow mb-2">Dossier Card · 人事档案</div>
            <h2 className="font-display text-2xl font-black tracking-wide">我的档案</h2>
          </div>
          <Stamp size="md" className="shrink-0">档案</Stamp>
        </div>
        <p className="font-kai text-xs text-ink-soft leading-5 border-b border-rule pb-4">
          档案会写入长期记忆：面试出题与简历优化都会参考它。
        </p>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
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

        <div className="flex items-center gap-4 pt-1">
          <Button className="tracking-[0.2em]" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存档案"}
          </Button>
          {saved && <span className="font-kai text-sm text-moss animate-pop-in">已保存，记忆同步中…</span>}
        </div>
      </Card>

      {/* ============ 记忆索引卡 ============ */}
      <Card className="p-6 space-y-4 animate-ink-up [animation-delay:90ms]">
        <div className="flex items-end justify-between border-b-2 border-ink pb-2">
          <h2 className="font-display text-xl font-black tracking-wide">长期记忆</h2>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline font-mono text-[10px] tracking-[0.22em] text-ink-faint">
              MEMORY INDEX
            </span>
            <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={refreshMemories} disabled={loadingMem}>
              {loadingMem ? "刷新中…" : "刷新"}
            </Button>
          </div>
        </div>
        <p className="font-kai text-xs text-ink-soft">跨会话生效；可删除单条。</p>

        <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1 stagger">
          {memories.map((m) => {
            const t = String((m.metadata?.type as string) ?? "general");
            const meta = TYPE_META[t] ?? TYPE_META.general;
            return (
              <div
                key={m.id}
                className="flex items-start gap-3 border border-rule-strong bg-sheet-bright rounded-[2px] p-3 text-sm transition-shadow duration-150 hover:shadow-print"
              >
                <Badge tone={meta.tone} className="shrink-0 mt-0.5">
                  {meta.label}
                </Badge>
                <span className="flex-1 leading-6">{m.memory}</span>
                <button
                  className="font-mono text-[10px] tracking-[0.14em] text-ink-faint hover:text-seal transition-colors shrink-0 mt-1"
                  onClick={() => removeMemory(m.id)}
                >
                  删除
                </button>
              </div>
            );
          })}
          {!memories.length && !loadingMem && (
            <p className="font-kai text-sm text-ink-faint">暂无记忆：去聊一场面试或保存档案试试。</p>
          )}
        </div>
      </Card>

      {/* ============ 战绩归档卡 ============ */}
      <StatsPanel />
    </div>
  );
}
