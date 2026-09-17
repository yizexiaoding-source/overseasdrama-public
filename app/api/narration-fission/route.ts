import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { savePromptVersion } from "../../lib/prompt-version-server";

export const runtime = "nodejs";

const PB_URL = (process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const LANGUAGES = new Set(["follow_source", "zh-CN", "en-US", "es-ES", "pt-BR", "ja-JP", "ko-KR", "fr-FR", "de-DE", "it-IT", "ru-RU", "ar-SA", "hi-IN", "th-TH", "vi-VN", "id-ID", "tr-TR"]);
const INTENSITIES = new Set(["faithful", "light", "deep"]);
const GOALS = new Set(["opening", "clarity", "suspense", "emotion", "pace", "localization"]);
const DIRECTIONS = new Set(["result_first", "question_first", "relationship", "conflict", "reveal_order", "tone", "pace"]);

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function strings(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}
function serverEnv(name: string) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(path.resolve(process.cwd(), ".env.analysis.local"), "utf8")
      .split(/\r?\n/).find((value) => value.trim().startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^['\"]|['\"]$/g, "") || undefined;
  } catch { return undefined; }
}
function extractText(payload: unknown): string {
  const root = object(payload);
  if (typeof root.output_text === "string") return root.output_text;
  const choice = Array.isArray(root.choices) ? object(root.choices[0]) : {};
  const message = object(choice.message);
  return typeof message.content === "string" ? message.content : "";
}
function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return object(JSON.parse(cleaned)); }
  catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return object(JSON.parse(cleaned.slice(start, end + 1)));
    throw new Error("模型没有返回可解析的 JSON");
  }
}
function verifiedNarration(asset: Record<string, unknown>) {
  const analysis = object(asset.analysis_result);
  const creative = object(analysis.creative);
  const rows = Array.isArray(creative.narrationSegments) ? creative.narrationSegments : [];
  return rows.map(object).filter((row) => row.verification === "verified" && String(row.text || "").trim()).sort((a, b) => Number(a.start || 0) - Number(b.start || 0)).map((row) => ({ start: Number(row.start || 0), end: Number(row.end || 0), text: String(row.text || "").trim(), language: String(row.language || "undetermined"), visualMatch: String(row.visualMatch || "") }));
}
function normalizeSettings(body: Record<string, unknown>) {
  const raw = object(body.settings);
  const settings = {
    intensity: String(raw.intensity || "light"), goal: String(raw.goal || "opening"),
    primaryDirection: String(raw.primaryDirection || "result_first"), secondaryDirection: String(raw.secondaryDirection || "reveal_order"),
    outputLanguage: String(raw.outputLanguage || "follow_source"), promptLanguage: String(raw.promptLanguage || "zh-CN"),
  };
  if (!INTENSITIES.has(settings.intensity) || !GOALS.has(settings.goal)) throw new RequestError("解说裂变强度或目标无效", 400);
  if (!DIRECTIONS.has(settings.primaryDirection) || !DIRECTIONS.has(settings.secondaryDirection)) throw new RequestError("解说裂变方向无效", 400);
  if (!LANGUAGES.has(settings.outputLanguage) || !["zh-CN", "en-US"].includes(settings.promptLanguage)) throw new RequestError("语言设置无效", 400);
  return settings;
}

export async function POST(request: Request) {
  try {
    const body = object(await request.json());
    const assetId = String(body.assetId || "").trim();
    const settings = normalizeSettings(body);
    if (!assetId) throw new RequestError("缺少解说素材", 400);
    const response = await fetch(`${PB_URL}/api/collections/material_library_assets/records/${encodeURIComponent(assetId)}`, { cache: "no-store" });
    if (!response.ok) throw new RequestError("找不到解说素材", 404);
    const asset = object(await response.json());
    if (asset.asset_kind !== "narration") throw new RequestError("只有解说素材可以生成解说文案裂变", 422);
    const segments = verifiedNarration(asset);
    if (!segments.length) throw new RequestError("当前素材没有通过验证的独立解说口播，请先重新分析或进入人工复核", 422);
    const endpoint = serverEnv("LUMINA_SEMANTIC_ENDPOINT");
    const apiKey = serverEnv("LUMINA_SEMANTIC_API_KEY") || serverEnv("DASHSCOPE_API_KEY") || serverEnv("OPENAI_API_KEY");
    const model = serverEnv("LUMINA_SEMANTIC_MODEL");
    if (!endpoint || !apiKey || !model) throw new RequestError("尚未配置语义模型，无法生成解说文案裂变", 503);
    const instruction = `你是短剧买量解说编剧。依据已验证的原口播与对应画面，生成一组可直接配音的解说文案裂变，不生成分镜、不混入角色对白、不把字幕或剧情摘要当口播。

先完整保留原片可验证的剧情事实、人物关系、因果和结果边界。V0 必须是按时间顺序拼接的原口播原文；V1-V5 是五份独立完整文案，按照用户选择的目标、强度、主方向和辅方向分别迭代开头、信息顺序、冲突表达、悬念、情绪或节奏。允许重写表达和次序，不得新增原素材没有的身份、关系、行为、秘密或结果。每一版只输出配音员要读的正文，不写镜头说明、括号说明、标题口播、CTR、留存率或创作目的。

outputLanguage=follow_source 时保留原口播语言；否则用目标语言进行自然本地化，不逐字翻译。promptLanguage 只控制 JSON 说明字段。

只输出 JSON：{"sourceDiagnosis":{"summary":"","facts":[""],"lockedFacts":[""]},"baseline":{"title":"V0 · 原解说文案","copy":""},"variants":[{"title":"V1 · ...","tags":[""],"copy":"完整可配音正文","changedDimension":"","difference":""}]}。variants 必须恰好五组。`;
    const context = JSON.stringify({ title: asset.title, verifiedNarrationSegments: segments, sourceAnalysis: asset.analysis_result, settings });
    const isResponses = endpoint.replace(/\/$/, "").endsWith("/responses");
    const requestBody = isResponses
      ? { model, input: [{ role: "system", content: [{ type: "input_text", text: instruction }] }, { role: "user", content: [{ type: "input_text", text: context }] }] }
      : { model, stream: false, messages: [{ role: "system", content: instruction }, { role: "user", content: context }], response_format: { type: "json_object" } };
    const generatedResponse = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
    if (!generatedResponse.ok) throw new Error(`模型服务请求失败（HTTP ${generatedResponse.status}）`);
    const generated = parseJson(extractText(await generatedResponse.json()));
    const rawDiagnosis = object(generated.sourceDiagnosis);
    const rawBaseline = object(generated.baseline);
    const rawVariants = Array.isArray(generated.variants) ? generated.variants : [];
    const sourceDiagnosis = { summary: String(rawDiagnosis.summary || "").trim(), facts: strings(rawDiagnosis.facts), lockedFacts: strings(rawDiagnosis.lockedFacts) };
    const originalCopy = segments.map((segment) => segment.text).join("\n");
    const baseline = { title: String(rawBaseline.title || "V0 · 原解说文案").trim(), copy: originalCopy };
    const variants = rawVariants.map((item) => object(item)).map((item, index) => ({ title: String(item.title || `V${index + 1} · 解说裂变`).trim(), tags: strings(item.tags), copy: String(item.copy || "").trim(), changedDimension: String(item.changedDimension || "").trim(), difference: String(item.difference || "").trim() }));
    if (!sourceDiagnosis.summary || !sourceDiagnosis.lockedFacts.length || !baseline.copy || variants.length !== 5 || variants.some((item) => !item.copy || !item.changedDimension || !item.difference)) throw new Error("解说文案裂变结果不完整，请重新生成");
    const plan = await savePromptVersion(PB_URL, assetId, "narration_fission", {
      id: `narration-fission-${Date.now()}`,
      sourceAssetId: assetId,
      settings,
      sourceDiagnosis,
      baseline,
      variants,
      model,
    });
    return NextResponse.json(plan);
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500;
    return NextResponse.json({ message: error instanceof Error ? error.message : "解说文案裂变失败" }, { status });
  }
}
