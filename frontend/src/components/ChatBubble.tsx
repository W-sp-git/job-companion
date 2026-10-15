import type { ChatMessage } from "@/api/types";
import { useT } from "@/i18n";

export default function ChatBubble({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const { t } = useT();
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end animate-ink-up">
        <div className="max-w-[85%] answer-sheet px-3.5 py-2">
          <div className="font-mono text-[10px] tracking-[0.22em] text-ink-faint select-none">
            {t("chat.bubble.user")}
          </div>
          <div className="whitespace-pre-wrap font-kai text-[15px] text-ink">{message.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 animate-ink-up">
      <span className="seal-square h-7 w-7 text-[13px] shrink-0 mt-1 rotate-[-2deg]">
        {t("chat.stamp.interviewer")}
      </span>
      <div className="min-w-0">
        <div className="font-mono text-[10px] tracking-[0.22em] text-ink-faint select-none mb-1">
          {t("chat.bubble.interviewer")}
        </div>
        <div className="text-[15px] leading-7 text-ink whitespace-pre-wrap">
          {message.content}
          {streaming && <span className="ink-cursor" />}
        </div>
      </div>
    </div>
  );
}
