export type SSEHandlers = {
  onEvent: (event: string, data: unknown) => void;
  onClose?: () => void;
  onError?: (err: unknown) => void;
};

/**
 * POST + fetch ReadableStream 的 SSE 解析器。
 * 不用原生 EventSource：它只支持 GET、不能带请求体。
 */
export function createSSEStream(url: string, body: unknown, handlers: SSEHandlers): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) {
        let detail = `HTTP ${resp.status}`;
        try {
          const d = await resp.json();
          detail = d.detail || detail;
        } catch {
          /* keep default */
        }
        throw new Error(detail);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let event = "message";
          const dataLines: string[] = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (!dataLines.length) continue;
          const raw = dataLines.join("\n");
          let data: unknown = raw;
          try {
            data = JSON.parse(raw);
          } catch {
            /* keep raw string */
          }
          handlers.onEvent(event, data);
        }
      }
      handlers.onClose?.();
    } catch (err) {
      const e = err as { name?: string };
      if (e?.name === "AbortError") {
        handlers.onClose?.();
        return;
      }
      handlers.onError?.(err);
    }
  })();

  return controller;
}
