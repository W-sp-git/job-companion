import type { ChatMessage } from "@/api/types";

export default function ChatBubble({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-emerald-700/80 text-white rounded-br-sm"
            : "bg-neutral-800/80 text-neutral-100 rounded-bl-sm"
        }`}
      >
        {message.content}
        {streaming && <span className="inline-block w-1.5 h-4 ml-0.5 bg-emerald-400 animate-pulse align-text-bottom" />}
      </div>
    </div>
  );
}
