import { create } from "zustand";

import { api } from "@/api/client";
import { createSSEStream } from "@/api/sse";
import type { IntelReportPayload, IntelSource, IntelVerification } from "@/api/types";

export type LaneStatus = "pending" | "active" | "done";
export type IntelPhase = "idle" | "running" | "done" | "failed" | "interrupted";

const LANES = ["hiring", "salary", "process", "risk"] as const;
const EXTRA_ORDER = ["extract", "verify", "save"] as const;

function allPending(): Record<string, LaneStatus> {
  return Object.fromEntries(LANES.map((l) => [l, "pending"]));
}

function allExtrasPending(): Record<string, LaneStatus> {
  return Object.fromEntries(EXTRA_ORDER.map((k) => [k, "pending"]));
}

function allDone(): Record<string, LaneStatus> {
  return Object.fromEntries([...LANES, ...EXTRA_ORDER].map((k) => [k, "done"]));
}

function advanceExtras(stage: string): Record<string, LaneStatus> {
  const idx = EXTRA_ORDER.indexOf(stage as (typeof EXTRA_ORDER)[number]);
  return Object.fromEntries(
    EXTRA_ORDER.map((k, i) => [k, i < idx ? "done" : i === idx ? "active" : "pending"]),
  );
}

type IntelDetail = {
  report_id: number;
  company: string;
  target_role: string;
  status: "created" | "running" | "done" | "failed";
  created_at: string;
  error: string;
  report: IntelReportPayload["report"] | null;
  verification: IntelVerification | null;
  sources: IntelSource[];
};

type IntelStore = {
  reportId: number | null;
  company: string;
  targetRole: string;
  phase: IntelPhase;
  lanes: Record<string, LaneStatus>;
  laneCounts: Record<string, number>;
  extras: Record<string, LaneStatus>;
  payload: IntelReportPayload | null;
  error: string;
  controller: AbortController | null;

  start: (company: string, role: string) => Promise<void>;
  resume: () => void;
  loadArchived: (rid: number) => Promise<void>;
  stop: () => void;
  reset: () => void;
};

export const useIntelStore = create<IntelStore>((set, get) => {
  function streamReport(reportId: number) {
    set({
      reportId,
      phase: "running",
      lanes: allPending(),
      laneCounts: {},
      extras: allExtrasPending(),
      payload: null,
      error: "",
      controller: createSSEStream(
        `/api/intel/reports/${reportId}/stream`,
        {},
        {
          onEvent: (event, data) => {
            const d = data as Record<string, unknown>;
            switch (event) {
              case "stage": {
                const stage = String(d.stage ?? "");
                if (stage === "lane_start") {
                  set({ lanes: { ...get().lanes, [String(d.lane)]: "active" } });
                } else if (stage === "lane_done") {
                  const lane = String(d.lane);
                  set({
                    lanes: { ...get().lanes, [lane]: "done" },
                    laneCounts: { ...get().laneCounts, [lane]: Number(d.count ?? 0) },
                  });
                } else if (stage === "extract" || stage === "verify" || stage === "save") {
                  set({ extras: advanceExtras(stage) });
                } else if (stage === "failed") {
                  set({ phase: "failed", error: String(d.label ?? "生成失败"), controller: null });
                }
                break;
              }
              case "report":
                set({ payload: d as unknown as IntelReportPayload, phase: "done" });
                break;
              case "error":
                set({
                  phase: "failed",
                  error: String(d.message ?? "未知错误"),
                  controller: null,
                });
                break;
              case "done":
                set({ controller: null });
                break;
              default:
                break;
            }
          },
          onClose: () => set({ controller: null }),
          onError: (err) => set({ phase: "failed", error: String(err), controller: null }),
        },
      ),
    });
  }

  return {
    reportId: null,
    company: "",
    targetRole: "",
    phase: "idle",
    lanes: allPending(),
    laneCounts: {},
    extras: allExtrasPending(),
    payload: null,
    error: "",
    controller: null,

    start: async (company: string, role: string) => {
      set({ company, targetRole: role, error: "" });
      const { report_id } = await api.post<{ report_id: number }>("/api/intel/reports", {
        company,
        target_role: role,
      });
      streamReport(report_id);
    },

    resume: () => {
      const rid = get().reportId;
      if (!rid || get().phase === "running") return;
      streamReport(rid);
    },

    loadArchived: async (rid: number) => {
      if (get().reportId === rid && (get().payload || get().phase === "running")) return;
      const detail = await api.get<IntelDetail>(`/api/intel/reports/${rid}`);
      if (detail.status === "done" && detail.report && detail.verification) {
        set({
          reportId: detail.report_id,
          company: detail.company,
          targetRole: detail.target_role,
          payload: {
            report_id: detail.report_id,
            company: detail.company,
            target_role: detail.target_role,
            created_at: detail.created_at,
            report: detail.report,
            verification: detail.verification,
            sources: detail.sources,
          },
          phase: "done",
          lanes: allDone(),
          laneCounts: {},
          extras: allDone(),
          error: "",
          controller: null,
        });
      } else if (detail.status === "failed") {
        set({
          reportId: detail.report_id,
          company: detail.company,
          targetRole: detail.target_role,
          phase: "failed",
          error: detail.error || "生成失败",
          payload: null,
          controller: null,
        });
      } else {
        // created / running 但当前无活跃流（孤儿任务）：提示可重新发起
        set({
          reportId: detail.report_id,
          company: detail.company,
          targetRole: detail.target_role,
          phase: "interrupted",
          payload: null,
          error: "",
          controller: null,
        });
      }
    },

    stop: () => {
      get().controller?.abort();
      set({ controller: null });
    },

    reset: () => {
      get().controller?.abort();
      set({
        reportId: null,
        company: "",
        targetRole: "",
        phase: "idle",
        lanes: allPending(),
        laneCounts: {},
        extras: allExtrasPending(),
        payload: null,
        error: "",
        controller: null,
      });
    },
  };
});
