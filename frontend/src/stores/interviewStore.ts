import { create } from "zustand";

import { api } from "@/api/client";
import { createSSEStream } from "@/api/sse";
import { stageLabel, translate } from "@/i18n";
import type {
  ChatMessage,
  CreatePayload,
  Evaluation,
  InterviewReport,
  SessionInfo,
} from "@/api/types";

type Stage = { label: string } | null;

type SessionDetail = {
  session: SessionInfo;
  turns: {
    round: number;
    question: string;
    answer: string;
    evaluation: Evaluation | null;
  }[];
  messages: ChatMessage[];
};

type InterviewStore = {
  sessionId: string | null;
  session: SessionInfo | null;
  messages: ChatMessage[];
  stage: Stage;
  scores: Evaluation[];
  report: InterviewReport | null;
  isStreaming: boolean;
  controller: AbortController | null;

  loadSession: (sid: string) => Promise<void>;
  createAndStart: (payload: CreatePayload) => Promise<void>;
  answer: (text: string) => void;
  finish: () => void;
  stop: () => void;
  reset: () => void;
};

export const useInterviewStore = create<InterviewStore>((set, get) => {
  function streamTurn(control: "start" | "answer" | "finish", message = "") {
    const sid = get().sessionId;
    if (!sid) return;
    let newAssistant = true;

    set({
      isStreaming: true,
      stage: null,
      controller: createSSEStream(
        `/api/interview/sessions/${sid}/stream`,
        { control, message },
        {
          onEvent: (event, data) => {
            const d = data as Record<string, unknown>;
            switch (event) {
              case "stage":
                set({ stage: { label: stageLabel(d) } });
                break;
              case "token": {
                const delta = String(d.delta ?? "");
                if (!delta) break;
                const msgs = [...get().messages];
                if (newAssistant) {
                  msgs.push({ role: "assistant", content: delta });
                  newAssistant = false;
                } else {
                  const last = msgs[msgs.length - 1];
                  msgs[msgs.length - 1] = {
                    ...last,
                    content: last.content + delta,
                  };
                }
                set({ messages: msgs, stage: null });
                break;
              }
              case "score":
                set({ scores: [...get().scores, d as unknown as Evaluation] });
                break;
              case "report":
                set({ report: d as unknown as InterviewReport });
                break;
              case "error":
                set({
                  stage: {
                    label: translate("error.prefix", {
                      message: String(
                        d.message ?? translate("common.unknownError"),
                      ),
                    }),
                  },
                });
                break;
              case "done":
                set({ isStreaming: false, controller: null, stage: null });
                break;
              default:
                break;
            }
          },
          onClose: () => set({ isStreaming: false, controller: null }),
          onError: (err) =>
            set({
              isStreaming: false,
              controller: null,
              stage: {
                label: translate("error.connect", { message: String(err) }),
              },
            }),
        },
      ),
    });
  }

  return {
    sessionId: null,
    session: null,
    messages: [],
    stage: null,
    scores: [],
    report: null,
    isStreaming: false,
    controller: null,

    loadSession: async (sid: string) => {
      const detail = await api.get<SessionDetail>(
        `/api/interview/sessions/${sid}`,
      );
      let report: InterviewReport | null = null;
      try {
        const r = await api.get<{ report: InterviewReport }>(
          `/api/interview/sessions/${sid}/report`,
        );
        report = r.report;
      } catch {
        report = null;
      }
      set({
        sessionId: sid,
        session: detail.session,
        messages: detail.messages,
        scores: detail.turns
          .map((t) => t.evaluation)
          .filter((e): e is Evaluation => !!e),
        report,
        stage: null,
        isStreaming: false,
        controller: null,
      });
    },

    createAndStart: async (payload: CreatePayload) => {
      const { session_id } = await api.post<{ session_id: string }>(
        "/api/interview/sessions",
        payload,
      );
      const detail = await api.get<SessionDetail>(
        `/api/interview/sessions/${session_id}`,
      );
      set({
        sessionId: session_id,
        session: detail.session,
        messages: [],
        scores: [],
        report: null,
        stage: null,
      });
      streamTurn("start");
    },

    answer: (text: string) => {
      if (!text.trim() || get().isStreaming) return;
      set({ messages: [...get().messages, { role: "user", content: text }] });
      streamTurn("answer", text);
    },

    finish: () => {
      if (get().isStreaming) return;
      streamTurn("finish");
    },

    stop: () => {
      get().controller?.abort();
      set({ isStreaming: false, controller: null });
    },

    reset: () => {
      get().controller?.abort();
      set({
        sessionId: null,
        session: null,
        messages: [],
        scores: [],
        report: null,
        stage: null,
        isStreaming: false,
        controller: null,
      });
    },
  };
});
