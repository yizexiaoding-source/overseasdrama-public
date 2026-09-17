import { NextResponse } from "next/server";
import { baseTagGroups, parseAiTagRecommendations, parseConflictUnits } from "../../../lib/preface-creative-catalog";
import type { PrefaceCreativeInput, PrefaceCreativeModelProvider } from "../../../lib/preface-creative-domain";
import { modelFetch } from "../../../lib/server/model-request";

export const runtime = "nodejs";

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown, fallback = "") { return String(value || fallback).trim(); }
function env(name: string) { return process.env[name] || process.env[`LUMINA_${name}`]; }

type ModelConfig = { label: string; endpoint: string; apiKey: string; model: string; disableThinking?: boolean };
const AI_TAG_TIMEOUT_MS = 30_000;
const MODEL_RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_DELAYS_MS = [1_500, 3_000];
class ModelRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number, readonly providerLabel: string) {
    super(`${providerLabel}模型请求频率受限`);
  }
}
const providers: Record<PrefaceCreativeModelProvider, () => ModelConfig> = {
  qwen: () => ({ label: "通义千问", endpoint: env("QWEN_ENDPOINT") || env("SEMANTIC_ENDPOINT"), apiKey: env("QWEN_API_KEY") || env("DASHSCOPE_API_KEY") || env("SEMANTIC_API_KEY"), model: env("QWEN_MODEL") || env("SEMANTIC_MODEL"), disableThinking: true }),
  doubao: () => ({ label: "豆包", endpoint: env("DOUBAO_ENDPOINT"), apiKey: env("DOUBAO_API_KEY"), model: env("DOUBAO_MODEL") }),
  deepseek: () => ({ label: "DeepSeek", endpoint: env("DEEPSEEK_ENDPOINT"), apiKey: env("DEEPSEEK_API_KEY"), model: env("DEEPSEEK_MODEL") }),
  gemini: () => ({ label: "Gemini", endpoint: env("GEMINI_ENDPOINT"), apiKey: env("GEMINI_API_KEY"), model: env("GEMINI_MODEL") }),
};

function modelFor(value: unknown): ModelConfig {
  const factory = providers[String(value || "qwen") as PrefaceCreativeModelProvider];
  if (!factory) throw new Error("不支持的前贴创意模型");
  const model = factory();
  if (!model.endpoint || !model.apiKey || !model.model) throw new Error(`尚未配置${model.label}模型，请补充该模型的接口地址、密钥和模型名称`);
  return model;
}

function json(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? { recommendations: parsed } : parsed;
  } catch {
    const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("模型没有返回可解析的剧情分析 JSON");
  }
}

const prompt = `你是专业短剧前贴策划的内容标签匹配模型。你不写脚本，只根据用户已选标签、剧情简介和补充要求补充其他适配标签，并识别可用于前贴的核心冲突单元。
剧情简介是故事事实来源；补充要求是可选的创作约束，不能把补充要求中的愿望当成已经发生的剧情事实，也不能覆盖用户已选标签。
只允许从标签目录中选择，禁止创造、改写、合并或缩写标签名称。用户已经选择的标签不得重复推荐，也不得覆盖或否定用户选择。
推荐时综合判断人物关系、世界规则、角色身份、权力结构和可形成的广告冲突；不能默认女主、男主、男二或三角恋。没有剧情简介时，仍需根据已选标签完成合理匹配。
每条推荐必须说明与已选标签的具体关联、对前贴创作的影响和置信度，reason 与 impact 每项不超过三十个汉字。优先补足用户未选择的人物关系、世界观和人物设定；只有确有兼容价值时才推荐另一个题材一级分类。
冲突方向不能默认女主、男主、男二或三角恋；它只描述故事张力，不得预设具体人物、动作、阻碍、后果、反转或正片事件。每个方向仅说明：direction（故事张力方向）、powerStructure（人物、群体、规则或未知威胁之间的力量结构）、audienceQuestion（观众最想追问的问题）。
只输出 JSON：{"recommendations":[{"axis":"人物关系","label":"标签目录中的原始标签","reason":"推荐依据","impact":"对人物关系、冲突或世界规则的影响","confidence":90,"compatibleHooks":["适配的钩子家族"],"conflicts":[]}],"conflictUnits":[{"id":"direction-1","direction":"身份或信任受到挑战","powerStructure":"个人与掌权群体之间存在力量失衡","audienceQuestion":"人物会如何夺回主动权？"}]}。`;

async function requestModel(model: ModelConfig, body: string) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await modelFetch(model.endpoint, { method: "POST", headers: { Authorization: `Bearer ${model.apiKey}`, "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(AI_TAG_TIMEOUT_MS) });
    if (response.status !== 429) return response;
    const retryAfter = Number(response.headers.get("Retry-After"));
    const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : Math.ceil((RATE_LIMIT_DELAYS_MS[Math.min(attempt, RATE_LIMIT_DELAYS_MS.length - 1)] || 3_000) / 1_000);
    if (attempt >= MODEL_RATE_LIMIT_RETRIES) throw new ModelRateLimitError(retryAfterSeconds, model.label);
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterSeconds * 1_000, RATE_LIMIT_DELAYS_MS[attempt] || 3_000)));
  }
}

export async function POST(request: Request) {
  try {
    const body = object(await request.json());
    const input = object(body.input) as Partial<PrefaceCreativeInput>;
    if (!text(input.plotSynopsis || input.targetBrief)) return NextResponse.json({ message: "剧情简介不能为空，请先上传或填写剧情简介" }, { status: 400 });
    const model = modelFor(input.modelProvider);
    const task = JSON.stringify({
      selectedTags: {
        genreCategory: text(input.genre),
        genres: input.genreTags || [],
        worldViews: input.worldViewTags || [],
        relationships: input.relationshipTags || [],
        characterSettings: input.characterSettingTags || [],
      },
      plotSynopsis: text(input.plotSynopsis || input.targetBrief),
      supplementalRequirements: text(input.supplementalRequirements),
      tagDirectory: baseTagGroups.map((item) => ({ axis: item.axis, group: item.group, tags: item.tags })),
      instruction: "先以plotSynopsis理解剧情事实，再把supplementalRequirements当作可选创作约束；推荐四至八个未选择但高度兼容的标签；只允许从标签目录中选择；用户已经选择的标签不得重复推荐；理由和影响保持简短。",
    });
    const response = await requestModel(model, JSON.stringify({ model: model.model, stream: false, max_tokens: 3_200, ...(model.disableThinking ? { enable_thinking: false } : {}), messages: [{ role: "system", content: prompt }, { role: "user", content: task }], response_format: { type: "json_object" } }));
    if (!response.ok) throw new Error(`模型服务请求失败（HTTP ${response.status}）`);
    const rawPayload = object(await response.json());
    const choices = Array.isArray(rawPayload.choices) ? rawPayload.choices : [];
    const message = object(object(choices[0]).message);
    const content = typeof message.content === "string" ? message.content : typeof rawPayload.output_text === "string" ? rawPayload.output_text : "";
    const result = object(json(content));
    const tags = parseAiTagRecommendations(result.recommendations, input);
    const conflictUnits = parseConflictUnits(result.conflictUnits);
    if (!tags.length) throw new Error("AI没有返回标签库中的有效推荐，请重试或更换模型");
    return NextResponse.json({ tags, conflictUnits, model: model.model, provider: model.label });
  } catch (error) {
    if (error instanceof ModelRateLimitError) return NextResponse.json({ message: `${error.providerLabel}当前请求过于频繁，请等待约 ${error.retryAfterSeconds} 秒后重试，或切换其他模型。` }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    if (error instanceof DOMException && error.name === "TimeoutError") return NextResponse.json({ message: "AI标签匹配超时，请重试或更换模型" }, { status: 504 });
    return NextResponse.json({ message: error instanceof Error ? error.message : "AI内容标签匹配失败" }, { status: 500 });
  }
}
