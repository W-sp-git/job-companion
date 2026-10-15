import { create } from "zustand";

import { messages, type Locale, type MessageKey } from "./messages";

const STORAGE_KEY = "jc_locale";

function readInitial(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* SSR/隐私模式兜底 */
  }
  return "zh";
}

type LocaleStore = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

export const useLocaleStore = create<LocaleStore>((set) => ({
  locale: readInitial(),
  setLocale: (locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* 忽略写入失败 */
    }
    set({ locale });
  },
}));

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function useT(): { t: Translate; locale: Locale } {
  const locale = useLocaleStore((s) => s.locale);
  const t: Translate = (key, vars) => {
    let text: string = messages[locale][key] ?? messages.zh[key] ?? key;
    if (vars) {
      text = text.replace(/\{(\w+)\}/g, (_, name: string) =>
        name in vars ? String(vars[name]) : `{${name}}`,
      );
    }
    return text;
  };
  return { t, locale };
}

/** store 外部使用（如 zustand 的 onEvent 回调里） */
export function translate(key: MessageKey, vars?: Record<string, string | number>): string {
  let text: string = messages[useLocaleStore.getState().locale][key] ?? messages.zh[key] ?? key;
  if (vars) {
    text = text.replace(/\{(\w+)\}/g, (_, name: string) =>
      name in vars ? String(vars[name]) : `{${name}}`,
    );
  }
  return text;
}

/** 面试模式显示名（未知 mode 回退原文） */
export function modeLabel(t: Translate, mode: string): string {
  const key = `mode.${mode}` as MessageKey;
  return key in messages.zh ? t(key) : mode;
}

/** 动态 stage 事件的本地化标签（后端 payload 带结构化参数，label 仅作兜底） */
export function stageLabel(data: Record<string, unknown>): string {
  const t: Translate = translate;
  const stage = String(data.stage ?? "");
  const fallback = String(data.label ?? "");
  switch (stage) {
    case "searching_company":
      return t("stage.searching_company", { company: String(data.company ?? "") });
    case "evaluated":
      return t("stage.evaluated", { round: Number(data.round ?? 0) });
    case "next_question":
      return t("stage.next_question", { round: Number(data.round ?? 0) });
    case "refining":
      return t("stage.refining", { iteration: Number(data.iteration ?? 0) });
    case "reviewed":
      return t("stage.reviewed", {
        issues: Number(data.issues ?? 0),
        missing: Number(data.missing ?? 0),
      });
    case "extract":
      return t("stage.extract", { count: Number(data.count ?? 0) });
    case "failed":
      return t("stage.failed_no_source");
    default: {
      const key = `stage.${stage}` as MessageKey;
      return key in messages.zh ? t(key) : fallback;
    }
  }
}
