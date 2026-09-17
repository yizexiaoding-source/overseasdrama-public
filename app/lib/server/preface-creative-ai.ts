import type { PrefaceCreativeModelProvider } from "../preface-creative-domain";
import { modelFetch } from "./model-request";

type ModelConfig = { label: string; endpoint: string; apiKey: string; model: string };
const env = (name: string) => process.env[name] || process.env[`LUMINA_${name}`] || "";

const providers: Record<PrefaceCreativeModelProvider, () => ModelConfig> = {
  qwen: () => ({ label: "通义千问", endpoint: env("QWEN_ENDPOINT") || env("SEMANTIC_ENDPOINT"), apiKey: env("QWEN_API_KEY") || env("DASHSCOPE_API_KEY") || env("SEMANTIC_API_KEY"), model: env("QWEN_MODEL") || env("SEMANTIC_MODEL") }),
  doubao: () => ({ label: "豆包", endpoint: env("DOUBAO_ENDPOINT"), apiKey: env("DOUBAO_API_KEY"), model: env("DOUBAO_MODEL") }),
  deepseek: () => ({ label: "DeepSeek", endpoint: env("DEEPSEEK_ENDPOINT"), apiKey: env("DEEPSEEK_API_KEY"), model: env("DEEPSEEK_MODEL") }),
  gemini: () => ({ label: "Gemini", endpoint: env("GEMINI_ENDPOINT"), apiKey: env("GEMINI_API_KEY"), model: env("GEMINI_MODEL") }),
};

export function resolvePrefaceModel(value: unknown): ModelConfig {
  const provider = String(value || "qwen") as PrefaceCreativeModelProvider;
  const factory = providers[provider];
  if (!factory) throw new Error("不支持的前贴创意模型");
  const config = factory();
  if (!config.apiKey || !config.endpoint || !config.model) throw new Error(`尚未配置${config.label}模型，请补充该模型的接口地址、密钥和模型名称`);
  return config;
}

function parseJson(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("模型没有返回可解析的 JSON");
  }
}

export async function requestPrefaceJson(provider: unknown, system: string, prompt: string, maxTokens = 8000, signal?: AbortSignal) {
  const config = resolvePrefaceModel(provider);
  const response = await modelFetch(config.endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, stream: false, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], response_format: { type: "json_object" } }),
    signal,
  });
  if (!response.ok) throw new Error(`模型服务请求失败（HTTP ${response.status}）`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }>; output_text?: unknown };
  const content = payload.choices?.[0]?.message?.content;
  const raw = typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => typeof part === "string" ? part : String((part as { text?: unknown }).text || "")).join("") : String(payload.output_text || "");
  return { value: parseJson(raw) as Record<string, unknown>, model: config.model, provider: config.label };
}

export async function requestPrefaceText(provider: unknown, system: string, prompt: string, maxTokens = 12000, signal?: AbortSignal) {
  const config = resolvePrefaceModel(provider);
  const response = await modelFetch(config.endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, stream: false, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    signal,
  });
  if (!response.ok) throw new Error(`模型服务请求失败（HTTP ${response.status}）`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }>; output_text?: unknown };
  const content = payload.choices?.[0]?.message?.content;
  const value = typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => typeof part === "string" ? part : String((part as { text?: unknown }).text || "")).join("") : String(payload.output_text || "");
  if (!value.trim()) throw new Error("模型没有返回分镜脚本");
  return { value: value.trim(), model: config.model, provider: config.label };
}
