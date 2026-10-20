import { useEffect, useState } from "react";

import { api } from "@/api/client";
import type { MemoryItem } from "@/api/types";
import StatsPanel from "@/components/StatsPanel";
import DataManagement from "@/components/DataManagement";
import { ErrorNotice, useCopy } from "@/components/workspace";
import { Badge, Button, Card, Field, Stamp, inputCls } from "@/components/ui";
import { useT } from "@/i18n";
import type { MessageKey } from "@/i18n/messages";

const PROFILE_FIELDS: {
  key: string;
  label: MessageKey;
  placeholder: MessageKey;
}[] = [
  {
    key: "school",
    label: "profile.field.school",
    placeholder: "profile.field.school.placeholder",
  },
  {
    key: "major",
    label: "profile.field.major",
    placeholder: "profile.field.major.placeholder",
  },
  {
    key: "grade",
    label: "profile.field.grade",
    placeholder: "profile.field.grade.placeholder",
  },
  {
    key: "target_role",
    label: "profile.field.role",
    placeholder: "profile.field.role.placeholder",
  },
  {
    key: "target_city",
    label: "profile.field.city",
    placeholder: "profile.field.city.placeholder",
  },
  {
    key: "skills",
    label: "profile.field.skills",
    placeholder: "profile.field.skills.placeholder",
  },
  {
    key: "graduation",
    label: "profile.field.graduation",
    placeholder: "profile.field.graduation.placeholder",
  },
  {
    key: "availability",
    label: "profile.field.availability",
    placeholder: "profile.field.availability.placeholder",
  },
];

const TYPE_META: Record<
  string,
  { label: MessageKey; tone: "green" | "amber" | "blue" | "neutral" }
> = {
  profile: { label: "profile.memory.type.profile", tone: "blue" },
  weakness: { label: "profile.memory.type.weakness", tone: "amber" },
  general: { label: "profile.memory.type.general", tone: "neutral" },
};

export default function ProfilePage() {
  const { t } = useT();
  const c = useCopy();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loadingMem, setLoadingMem] = useState(false);
  const [memoryError, setMemoryError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<{ profile: Record<string, string> }>("/api/profile")
      .then((r) => setForm(r.profile || {}))
      .catch((e) => setError(String(e)));
    refreshMemories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshMemories() {
    setLoadingMem(true);
    setMemoryError("");
    api
      .get<{ memories: MemoryItem[] }>("/api/memories")
      .then((r) => setMemories(r.memories))
      .catch(() =>
        setMemoryError(
          c(
            "长期记忆暂不可用，档案与经历素材仍可正常使用。",
            "Memory is temporarily unavailable. Profile and experience facts remain available.",
          ),
        ),
      )
      .finally(() => setLoadingMem(false));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api.put("/api/profile", { patch: form });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setTimeout(refreshMemories, 5000); // 记忆提取是后台任务
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeMemory(id: string) {
    try {
      await api.del(`/api/memories/${id}`);
      setMemories((ms) => ms.filter((m) => m.id !== id));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-7 max-w-5xl mx-auto">
      {error && (
        <div className="lg:col-span-2">
          <ErrorNotice message={error} />
        </div>
      )}
      {/* ============ 人事档案卡 ============ */}
      <Card
        className="p-6 space-y-5 animate-ink-up"
        tapeClass="left-1/2 -translate-x-1/2 -top-2.5 w-24 rotate-[-2deg]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow mb-2">{t("profile.dossier.eyebrow")}</div>
            <h2 className="font-display text-2xl font-black tracking-wide">
              {t("profile.dossier.title")}
            </h2>
          </div>
          <Stamp size="md" className="shrink-0">
            {t("profile.dossier.stamp")}
          </Stamp>
        </div>
        <p className="font-kai text-xs text-ink-soft leading-5 border-b border-rule pb-4">
          {t("profile.dossier.hint")}
        </p>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          {PROFILE_FIELDS.map((f) => (
            <Field key={f.key} label={t(f.label)}>
              <input
                className={inputCls}
                placeholder={t(f.placeholder)}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </Field>
          ))}
        </div>

        <div className="flex items-center gap-4 pt-1">
          <Button className="tracking-[0.2em]" onClick={save} disabled={saving}>
            {saving ? t("common.saving") : t("profile.save")}
          </Button>
          {saved && (
            <span className="font-kai text-sm text-moss animate-pop-in">
              {t("profile.saved")}
            </span>
          )}
        </div>
      </Card>

      {/* ============ 记忆索引卡 ============ */}
      <Card className="p-6 space-y-4 animate-ink-up [animation-delay:90ms]">
        <div className="flex items-end justify-between border-b-2 border-ink pb-2">
          <h2 className="font-display text-xl font-black tracking-wide">
            {t("profile.memory.title")}
          </h2>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline font-mono text-[10px] tracking-[0.22em] text-ink-faint">
              MEMORY INDEX
            </span>
            <Button
              variant="ghost"
              className="px-2.5 py-1 text-xs"
              onClick={refreshMemories}
              disabled={loadingMem}
            >
              {loadingMem ? t("common.refreshing") : t("common.refresh")}
            </Button>
          </div>
        </div>
        <p className="font-kai text-xs text-ink-soft">
          {t("profile.memory.hint")}
        </p>
        <ErrorNotice message={memoryError} retry={refreshMemories} />

        <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1 stagger">
          {memories.map((m) => {
            const type = String((m.metadata?.type as string) ?? "general");
            const meta = TYPE_META[type] ?? TYPE_META.general;
            return (
              <div
                key={m.id}
                className="flex items-start gap-3 border border-rule-strong bg-sheet-bright rounded-[2px] p-3 text-sm transition-shadow duration-150 hover:shadow-print"
              >
                <Badge tone={meta.tone} className="shrink-0 mt-0.5">
                  {t(meta.label)}
                </Badge>
                <span className="flex-1 leading-6">{m.memory}</span>
                <button
                  className="font-mono text-[10px] tracking-[0.14em] text-ink-faint hover:text-seal transition-colors shrink-0 mt-1"
                  onClick={() => removeMemory(m.id)}
                >
                  {t("common.delete")}
                </button>
              </div>
            );
          })}
          {!memories.length && !loadingMem && (
            <p className="font-kai text-sm text-ink-faint">
              {t("profile.memory.empty")}
            </p>
          )}
        </div>
      </Card>

      {/* ============ 战绩归档卡 ============ */}
      <StatsPanel />
      <DataManagement />
    </div>
  );
}
