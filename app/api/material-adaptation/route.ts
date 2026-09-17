import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { savePromptVersion } from "../../lib/prompt-version-server";

export const runtime = "nodejs";
const PB_URL = (process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
type AnyRecord = Record<string, unknown>;
const object = (value: unknown): AnyRecord => value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
const strings = (value: unknown) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
const env = (name: string) => {
  if (process.env[name]) return process.env[name];
  try { return readFileSync(path.resolve(process.cwd(), ".env.analysis.local"), "utf8").split(/\r?\n/).find((line) => line.trim().startsWith(`${name}=`))?.slice(name.length + 1).trim().replace(/^['\"]|['\"]$/g, ""); } catch { return undefined; }
};
const textFrom = (payload: unknown) => {
  const root = object(payload);
  if (typeof root.output_text === "string") return root.output_text;
  const choice = Array.isArray(root.choices) ? object(root.choices[0]) : {};
  const message = object(choice.message);
  return typeof message.content === "string" ? message.content : "";
};
const parse = (text: string): AnyRecord => {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return object(JSON.parse(clean)); } catch {
    const start = clean.indexOf("{"); const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) return object(JSON.parse(clean.slice(start, end + 1)));
    throw new Error("模型没有返回可解析的适配方案");
  }
};

export async function POST(request: Request) {
  try {
    const body = object(await request.json());
    const templateAssetId = String(body.templateAssetId || "").trim();
    const targetAssetId = String(body.targetAssetId || "").trim();
    const kind = body.kind === "narration" ? "narration" : "ai_preface";
    if (!templateAssetId || !targetAssetId || templateAssetId === targetAssetId) return NextResponse.json({ message: "请选择不同的模板素材和目标素材" }, { status: 400 });
    const [templateResponse, targetResponse] = await Promise.all([
      fetch(`${PB_URL}/api/collections/material_library_assets/records/${encodeURIComponent(templateAssetId)}`, { cache: "no-store" }),
      fetch(`${PB_URL}/api/collections/material_library_assets/records/${encodeURIComponent(targetAssetId)}`, { cache: "no-store" }),
    ]);
    if (!templateResponse.ok || !targetResponse.ok) return NextResponse.json({ message: "模板或目标素材不存在" }, { status: 404 });
    const template = object(await templateResponse.json()); const target = object(await targetResponse.json());
    if (template.asset_kind !== kind || (target.asset_kind !== "ai_preface" && target.asset_kind !== "narration")) return NextResponse.json({ message: "素材类型与跨剧适配模式不匹配" }, { status: 422 });
    const endpoint = env("LUMINA_SEMANTIC_ENDPOINT");
    const apiKey = env("LUMINA_SEMANTIC_API_KEY") || env("DASHSCOPE_API_KEY") || env("OPENAI_API_KEY");
    const model = env("LUMINA_SEMANTIC_MODEL");
    if (!endpoint || !apiKey || !model) return NextResponse.json({ message: "尚未配置语义模型，无法生成跨剧适配方案" }, { status: 503 });
    const preface = kind === "ai_preface";
    const instruction = preface
      ? `你是短剧前贴跨剧适配导演。把模板前贴的可迁移机制迁移到目标剧的真实素材中，绝不复制模板人物、关系、台词、地点或剧情事实。必须先做兼容性判断，再输出目标剧版本。最重要的是解决“前贴从哪里切入正片”：必须给出前贴结束后的动作、声音、画面如何桥接到目标正片，以及目标正片的具体切入时间段和承接理由。输出 1 个 V0 和 3 个不同执行策略的版本，每版都要是完整可执行的连续分镜提示词。只输出 JSON：{"compatibility":{"score":0,"level":"","reasons":[],"blockers":[]},"targetMapping":[{"templateMechanism":"","targetEvidence":"","targetTimecode":"","transformation":"","confidence":""}],"forbiddenCarryover":[],"transitionPlan":{"handoffQuestion":"","targetEntry":"","targetEntryTimecode":{"start":0,"end":1},"bridgeAction":"","bridgeVisual":"","bridgeAudio":"","handoffReason":"","continuityChecks":[]},"baseline":{"title":"V0 · 目标剧适配版","prompt":""},"variants":[{"title":"V1 · ...","prompt":"","changedDimension":"","difference":""}]}`
      : `你是短剧解说跨剧改写编剧。把模板解说的叙事机制迁移到目标剧，只使用目标剧已给出的事实，不能带入模板人物、关系、台词、身份或结局。输出目标剧可直接配音的 V0 与 3 个版本，并给出每个模板机制对应的目标证据。只输出 JSON：{"compatibility":{"score":0,"level":"","reasons":[],"blockers":[]},"targetMapping":[{"templateMechanism":"","targetEvidence":"","targetTimecode":"","transformation":"","confidence":""}],"forbiddenCarryover":[],"transitionPlan":{"handoffQuestion":"","targetEntry":"","targetEntryTimecode":{"start":0,"end":1},"bridgeAction":"","bridgeVisual":"","bridgeAudio":"","handoffReason":"","continuityChecks":[]},"baseline":{"title":"V0 · 目标剧适配版","copy":""},"variants":[{"title":"V1 · ...","copy":"","changedDimension":"","difference":""}]}`;
    const context = JSON.stringify({ template: { title: template.title, kind: template.asset_kind, range: [template.clip_start_seconds, template.clip_end_seconds], analysis: template.analysis_result, promptBlueprint: template.prompt_blueprint, hitReasons: template.hit_reasons }, target: { title: target.title, kind: target.asset_kind, range: [target.clip_start_seconds, target.clip_end_seconds], analysis: target.analysis_result, promptBlueprint: target.prompt_blueprint, hitReasons: target.hit_reasons }, settings: body.settings || {} });
    const isResponses = endpoint.replace(/\/$/, "").endsWith("/responses");
    const requestBody = isResponses ? { model, input: [{ role: "system", content: [{ type: "input_text", text: instruction }] }, { role: "user", content: [{ type: "input_text", text: context }] }] } : { model, stream: false, messages: [{ role: "system", content: instruction }, { role: "user", content: context }], response_format: { type: "json_object" } };
    const generatedResponse = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
    if (!generatedResponse.ok) throw new Error(`模型服务请求失败（HTTP ${generatedResponse.status}）`);
    const generated = parse(textFrom(await generatedResponse.json()));
    const rawCompatibility = object(generated.compatibility); const rawTransition = object(generated.transitionPlan); const rawBaseline = object(generated.baseline);
    const transitionPlan = { handoffQuestion: String(rawTransition.handoffQuestion || "目标正片接下来会发生什么？"), targetEntry: String(rawTransition.targetEntry || "目标正片关键动作开始处"), targetEntryTimecode: { start: Number(object(rawTransition.targetEntryTimecode).start || 0), end: Number(object(rawTransition.targetEntryTimecode).end || 1) }, bridgeAction: String(rawTransition.bridgeAction || "以前贴最后一个动作的结果承接目标正片"), bridgeVisual: String(rawTransition.bridgeVisual || "保持动作方向和视觉焦点连续"), bridgeAudio: String(rawTransition.bridgeAudio || "保留最后一个动作声并自然切入目标现场声"), handoffReason: String(rawTransition.handoffReason || "目标正片在此处拥有可验证的动作承接"), continuityChecks: strings(rawTransition.continuityChecks) };
    if (!transitionPlan.targetEntry || transitionPlan.continuityChecks.length < 2) throw new Error("适配结果缺少前贴与正片的接片校验");
    const baseline = preface ? { title: String(rawBaseline.title || "V0 · 目标剧适配版"), prompt: String(rawBaseline.prompt || "") } : { title: String(rawBaseline.title || "V0 · 目标剧适配版"), copy: String(rawBaseline.copy || "") };
    const rawVariants = Array.isArray(generated.variants) ? generated.variants : [];
    if (!((preface ? baseline.prompt : baseline.copy) && rawVariants.length >= 3)) throw new Error("适配结果不完整，请重新生成");
    const plan = { id: `adaptation-${Date.now()}`, templateAssetId, targetAssetId, kind, compatibility: { score: Math.max(0, Math.min(100, Number(rawCompatibility.score || 0))), level: String(rawCompatibility.level || "待复核"), reasons: strings(rawCompatibility.reasons), blockers: strings(rawCompatibility.blockers) }, targetMapping: (Array.isArray(generated.targetMapping) ? generated.targetMapping : []).map((item) => { const row = object(item); return { templateMechanism: String(row.templateMechanism || ""), targetEvidence: String(row.targetEvidence || ""), targetTimecode: String(row.targetTimecode || "未标注"), transformation: String(row.transformation || ""), confidence: String(row.confidence || "待复核") }; }).filter((item) => item.templateMechanism && item.targetEvidence), forbiddenCarryover: strings(generated.forbiddenCarryover), transitionPlan, baseline, variants: rawVariants.slice(0, 3).map((item) => { const row = object(item); return { title: String(row.title || "目标剧适配变体"), ...(preface ? { prompt: String(row.prompt || "") } : { copy: String(row.copy || "") }), changedDimension: String(row.changedDimension || ""), difference: String(row.difference || "") }; }), model };
    const saved = await savePromptVersion(PB_URL, templateAssetId, preface ? "preface_adaptation" : "narration_adaptation", plan);
    return NextResponse.json(saved);
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "跨剧适配失败" }, { status: 500 }); }
}
