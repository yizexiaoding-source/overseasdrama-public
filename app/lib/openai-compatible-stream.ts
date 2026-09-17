type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function textDelta(payload: unknown): string {
  const root = object(payload);
  if (typeof root.delta === "string") return root.delta;
  if (root.type === "response.output_text.delta" && typeof root.delta === "string") return root.delta;
  const choice = Array.isArray(root.choices) ? object(root.choices[0]) : {};
  const delta = object(choice.delta);
  if (typeof delta.content === "string") return delta.content;
  const content = Array.isArray(delta.content) ? delta.content : [];
  return content.map((part) => String(object(part).text || "")).join("");
}

export async function streamOpenAiCompatibleText(
  response: Response,
  onDelta: (delta: string) => void,
): Promise<string> {
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 500);
    throw new Error(`模型服务请求失败（HTTP ${response.status}）${detail ? `：${detail}` : ""}`);
  }
  if (!response.body) throw new Error("模型服务没有返回可读取的内容流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = "";
  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      const delta = textDelta(JSON.parse(data));
      if (delta) { result += delta; onDelta(delta); }
    } catch { /* keep waiting for valid SSE events */ }
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    lines.forEach(consume);
    if (done) break;
  }
  if (buffer) consume(buffer);
  return result;
}

export function ndjsonResponse(
  run: (send: (event: Record<string, unknown>) => void) => Promise<void>,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      void run(send)
        .catch((error) => send({ type: "error", message: error instanceof Error ? error.message : "生成失败" }))
        .finally(() => controller.close());
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
