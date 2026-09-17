import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { validatePromptFissionResult } from "../../lib/prompt-fission-domain";
import { pocketBaseFileUrl, type QwenContentPart } from "../../lib/prompt-fission-multimodal";
import { prepareQwenVideoInput } from "../../lib/qwen-video-input";
import { savePromptVersion } from "../../lib/prompt-version-server";

export const runtime = "nodejs";

const PB_URL = (process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const LANGUAGES = new Set(["follow_source", "zh-CN", "en-US", "es-ES", "pt-BR", "ja-JP", "ko-KR", "fr-FR", "de-DE", "it-IT", "ru-RU", "ar-SA", "hi-IN", "th-TH", "vi-VN", "id-ID", "tr-TR"]);
const TRACK_LANGUAGES = new Set(["follow_output", "none", ...LANGUAGES].filter((value) => value !== "follow_source"));
const INTENSITIES = new Set(["faithful", "light", "deep", "localized"]);
const GOALS = new Set(["why_happening", "what_next", "who_is_true", "will_they_choose", "what_cost", "relationship_reversal"]);
const DIRECTIONS = new Set(["anomaly_event", "role_relationship", "identity_contrast", "action_causality", "reveal_order", "suspense_ending", "dialogue_voice", "audiovisual", "scene_prop", "localization"]);
const MECHANISMS = new Set(["gratitude_warning", "promise_gap", "identity_reveal", "threat_countdown", "relationship_reversal", "result_first"]);
const TARGET_GENRES = new Set(["wealthy_runaway", "revenge", "contract_romance", "mystery", "workplace", "follow_source"]);
const TARGET_RELATIONSHIPS = new Set(["pregnant_runaway", "heir_family", "wife_husband", "enemy_lovers", "parent_child", "follow_source"]);
const TARGET_CONFLICTS = new Set(["pregnancy_exposed", "inheritance_secret", "betrayal", "status_gap", "danger_escape", "follow_source"]);
const HANDOFF_METHODS = new Set(["question_answer", "action_action", "dialogue_visual", "sound_bridge", "visual_match"]);
const CONFLICT_FREEDOMS = new Set(["none", "bounded", "bold"]);
const FISSION_MAX_TOKENS = 24_000;

type Settings = {
  intensity: string;
  goal: string;
  primaryDirection: string;
  secondaryDirection: string;
  outputLanguage: string;
  dialogueLanguage: string;
  narrationLanguage: string;
  onScreenTextLanguage: string;
  promptLanguage: string;
  mechanism: string;
  targetGenre: string;
  targetRelationship: string;
  targetConflict: string;
  targetBrief: string;
  plotSlots: string[];
  handoffMethod: string;
  conflictFreedom: string;
};

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function serverEnv(name: string) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(path.resolve(process.cwd(), ".env.analysis.local"), "utf8")
      .split(/\r?\n/).find((value) => value.trim().startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^['\"]|['\"]$/g, "") || undefined;
  } catch { return undefined; }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function strings(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}
function extractText(payload: unknown): string {
  const root = object(payload);
  if (typeof root.output_text === "string") return root.output_text;
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const message = object(object(choices[0]).message);
  if (typeof message.content === "string") return message.content;
  const output = Array.isArray(root.output) ? root.output : [];
  return output.flatMap((item) => {
    const content = Array.isArray(object(item).content) ? object(item).content as unknown[] : [];
    return content.map((part) => String(object(part).text || ""));
  }).join("");
}
function parseJsonText(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); }
  catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("模型没有返回可解析的 JSON");
  }
}
function normalizeSettings(body: Record<string, unknown>): Settings {
  const raw = object(body.settings);
  const settings: Settings = {
    intensity: String(raw.intensity || "light"),
    goal: String(raw.goal || "what_next"),
    primaryDirection: String(raw.primaryDirection || "anomaly_event"),
    secondaryDirection: String(raw.secondaryDirection || "suspense_ending"),
    outputLanguage: String(raw.outputLanguage || "follow_source"),
    dialogueLanguage: String(raw.dialogueLanguage || "follow_output"),
    narrationLanguage: String(raw.narrationLanguage || "follow_output"),
    onScreenTextLanguage: "none",
    promptLanguage: String(raw.promptLanguage || "zh-CN"),
    mechanism: String(raw.mechanism || "gratitude_warning"),
    targetGenre: String(raw.targetGenre || "follow_source"),
    targetRelationship: String(raw.targetRelationship || "follow_source"),
    targetConflict: String(raw.targetConflict || "follow_source"),
    targetBrief: String(raw.targetBrief || "").trim().slice(0, 500),
    plotSlots: Array.isArray(raw.plotSlots) ? raw.plotSlots.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 8) : ["施恩者", "报恩者", "危险", "预警方式", "未完成动作"],
    handoffMethod: String(raw.handoffMethod || "question_answer"),
    conflictFreedom: String(raw.conflictFreedom || "bounded"),
  };
  if (!INTENSITIES.has(settings.intensity) || !GOALS.has(settings.goal)) throw new RequestError("裂变模式或结尾问题无效", 400);
  if (!DIRECTIONS.has(settings.primaryDirection) || !DIRECTIONS.has(settings.secondaryDirection)) throw new RequestError("前贴改造维度无效", 400);
  if (!LANGUAGES.has(settings.outputLanguage)) throw new RequestError("成片语言设置无效", 400);
  if (![settings.dialogueLanguage, settings.narrationLanguage, settings.onScreenTextLanguage].every((value) => TRACK_LANGUAGES.has(value))) throw new RequestError("对白、旁白或画面文字语言设置无效", 400);
  if (!["zh-CN", "en-US"].includes(settings.promptLanguage)) throw new RequestError("提示词说明语言设置无效", 400);
  if (!MECHANISMS.has(settings.mechanism) || !TARGET_GENRES.has(settings.targetGenre) || !TARGET_RELATIONSHIPS.has(settings.targetRelationship) || !TARGET_CONFLICTS.has(settings.targetConflict)) throw new RequestError("前贴模板机制或目标题材设置无效", 400);
  if (!HANDOFF_METHODS.has(settings.handoffMethod)) throw new RequestError("前贴接片方式无效", 400);
  if (!CONFLICT_FREEDOMS.has(settings.conflictFreedom)) throw new RequestError("冲突创作强度无效", 400);
  return settings;
}
function responsePart(part: QwenContentPart) {
  if (part.type === "text") return { type: "input_text", text: part.text };
  if (part.type === "image_url") return { type: "input_image", image_url: part.image_url.url };
  if (part.type === "video") return { type: "input_video", video_url: part.video, fps: part.fps };
  return { type: "input_video", video_url: part.video_url.url };
}

async function generatePlan(
  context: Record<string, unknown>,
  locked: string[],
  settings: Settings,
  visualInput?: { videoDataUrl?: string; videoFrames?: string[]; videoFramesPerSecond?: number },
) {
  const endpoint = serverEnv("LUMINA_SEMANTIC_ENDPOINT");
  const apiKey = serverEnv("LUMINA_SEMANTIC_API_KEY") || serverEnv("DASHSCOPE_API_KEY") || serverEnv("OPENAI_API_KEY");
  const model = serverEnv("LUMINA_SEMANTIC_MODEL");
  if (!endpoint || !apiKey || !model) throw new RequestError("尚未配置语义模型，无法生成前贴裂变提示词", 503);
  const instruction = `你是短剧买量前贴创意导演和 AIGC 分镜提示词专家。本任务不上传新正片、不生成视频，只基于一条已经验证的历史 AI 前贴，输出可直接复制到第三方 AI 视频工具的专业迭代提示词。

先做“母版钩子基因”提取，并锁定不可破坏的事实：0—1 秒可见的异常事件、观众被迫追问的问题、人物关系与权力位置、动作—后果因果链、信息揭示顺序、剧情承诺、结尾未兑现的接片姿态。绝不把“点击率、留存、强钩子、目的、策略”写进任何成片提示词。

设置中的 intensity 是整体制作强度：faithful=偏现实迁移；light=偏保守；deep=允许大幅结构重构；localized=本地化裂变。原前贴中的人物关系、具体动作和故事背景都是可替换变量，不能被误当成锁定剧情。只保留抽象的母版因果机制。必须生成五个故事引擎，每个故事引擎各生成 A/B/C 三个分支，共十五组完整方案：A=现实适配，B=异常事件，C=高冲突翻转。V1—V5 是完整故事结构差异，不是叙事顺序、镜头语言、人物表演或剪辑节奏等制作手法差异。允许新增目标题材中的异常动作和冲突事件，但必须受 conflictFreedom 控制，并在 creativeAdditions 中单独列出，不能伪装成目标素材原有事实。plotSlots 是必须逐项映射的目标剧情槽位；handoffMethod 必须让前贴最后一个未完成动作与正片第一拍相接。

五个故事引擎固定为：causal_transfer=因果同构迁移；result_first=危险结果前置；misread_reversal=关系误判反转；anomaly_escalation=连续异常升级；double_misdirection=双重误导翻转。每个引擎的 A/B/C 必须更换关键人物、动作、故事背景或剧情事件，不能只是换镜头或换措辞；同一引擎的三个分支也必须使用不同的核心冲突事件。先输出十五张方案卡，再在同一 JSON 中给出每张卡对应的完整可拍摄提示词，确保每组都能独立制作。

V0 忠实复刻原结构。V1—V5 必须各自是完整、可拍摄的前贴：每版从 0 秒连续覆盖至结束，按实际切镜分为 3—8 镜，每镜建议 0.5—3 秒；若动作、景别、地点、视角或声音发生变化，必须另切镜。第一镜须在 0—1 秒给出可见异常，3 秒内让人理解人物正在面对什么，结尾保留设置指定的问题，不能解释完。每镜只写观察得到或本版明确设计的场景、前中后景和站位、动作的开始—过程—结果、景别、构图、运镜、转场；【原片语音】只在确有对白或旁白时写，逐字给出内容和说话者；【声音】只在确有环境音或动作声时写具体声音。没有焦点变化、对白、旁白或声音时，完全不要编造对应字段。

人物只写 @人物1、@人物2，不写外貌。不得出现标题、片名、字幕、画面文字、水印、平台角标、AI 标识、免责声明或 CTA。不得引用 V0 或上一版；不得写“强钩子、提升点击率、留存率、目的”等分析话术。outputLanguage=follow_source 表示跟随原片；dialogueLanguage、narrationLanguage 的 follow_output 表示跟随成片，none 表示不写该声轨。不得逐字翻译，应按目标市场自然改写口语。promptLanguage 只控制提示词说明语言。

  只输出 JSON：{"sourceDiagnosis":{"summary":"","hookQuestion":"","narrativePromise":"","lockedElements":[""]},"targetMapping":[{"slot":"施恩者","sourceMechanism":"","targetApplication":"","evidence":""}],"handoff":{"method":"","targetEntry":"","bridgeAction":"","bridgeAudio":"","handoffQuestion":""},"baseline":{"title":"V0 · 原结构复刻版","prompt":"","storyboard":[""],"lockedElements":[""]},"variants":[{"title":"V1-A · ...","storyEngine":"causal_transfer","branch":"A","branchLabel":"现实适配","synopsis":"","experiment":"","hypothesis":"","prompt":"","storyboard":[""],"preservedMechanisms":[""],"changedContent":[""],"targetEvidence":[""],"creativeAdditions":[""],"changedDimension":"故事引擎与目标剧情重构","directionTags":[""],"difference":""}]}。variants 必须恰好十五组，且完整覆盖五个 storyEngine、每个引擎 A/B/C 各一组；每组 preservedMechanisms 必须逐字包含所有 lockedMechanisms。`;
  const parts: QwenContentPart[] = [{ type: "text", text: JSON.stringify({ ...context, lockedMechanisms: locked, settings }) }];
  if (visualInput?.videoDataUrl) parts.push({ type: "video_url", video_url: { url: visualInput.videoDataUrl } });
  else if (visualInput?.videoFrames?.length) parts.push({ type: "video", video: visualInput.videoFrames, fps: visualInput.videoFramesPerSecond || 1 });
  const isResponses = endpoint.replace(/\/$/, "").endsWith("/responses");
  const requestBody = isResponses
    ? { model, max_output_tokens: FISSION_MAX_TOKENS, input: [{ role: "system", content: [{ type: "input_text", text: instruction }] }, { role: "user", content: parts.map(responsePart) }] }
    : { model, max_tokens: FISSION_MAX_TOKENS, stream: false, messages: [{ role: "system", content: instruction }, { role: "user", content: parts }], response_format: { type: "json_object" } };
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 500);
    throw new Error(`模型服务请求失败（HTTP ${response.status}）${detail ? `：${detail}` : ""}`);
  }
  return { model, value: parseJsonText(extractText(await response.json())) };
}

export async function POST(request: Request) {
  try {
    const body = object(await request.json());
    const assetId = String(body.assetId || "").trim();
    const locked = strings(body.preservedMechanisms);
    const settings = normalizeSettings(body);
    if (!assetId) throw new RequestError("缺少 AI 前贴资产", 400);
    if (!locked.length) throw new RequestError("原前贴缺少可锁定的钩子机制", 400);
    const response = await fetch(`${PB_URL}/api/collections/material_library_assets/records/${encodeURIComponent(assetId)}`, { cache: "no-store" });
    if (!response.ok) throw new RequestError("找不到 AI 前贴资产", 404);
    const asset = object(await response.json());
    if (asset.asset_kind !== "ai_preface") throw new RequestError("只有 AI 前贴可以作为裂变母版", 422);
    let mediaUrl = pocketBaseFileUrl(PB_URL, asset, "media_file");
    let sourceContentHash = "";
    if (!mediaUrl && asset.source_material) {
      const sourceResponse = await fetch(`${PB_URL}/api/collections/ad_materials/records/${encodeURIComponent(String(asset.source_material))}`, { cache: "no-store" });
      if (sourceResponse.ok) {
        const source = object(await sourceResponse.json());
        mediaUrl = pocketBaseFileUrl(PB_URL, source, source.video ? "video" : "image");
        sourceContentHash = String(source.content_hash || "");
      }
    }
    const visualInput = await prepareQwenVideoInput({
      url: mediaUrl,
      contentHash: String(asset.content_hash || ""),
      sourceContentHash,
      startSeconds: Number(asset.clip_start_seconds || 0),
      endSeconds: Number(asset.clip_end_seconds || 0),
      inlineMaxBytes: Number(process.env.LUMINA_QWEN_INLINE_VIDEO_MAX_BYTES || 6_500_000),
    });
    const context = { sourcePreface: { title: asset.title, range: { start: asset.clip_start_seconds, end: asset.clip_end_seconds }, analysis: asset.analysis_result, promptBlueprint: asset.prompt_blueprint, hitReasons: asset.hit_reasons, mediaAttached: Boolean(visualInput), frameTimeline: visualInput?.frameTimeline } };
    let generated: Awaited<ReturnType<typeof generatePlan>> | undefined;
    let validated: ReturnType<typeof validatePromptFissionResult> | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        generated = await generatePlan(context, locked, settings, visualInput);
        validated = validatePromptFissionResult(generated.value, locked);
        break;
      } catch (error) { lastError = error; }
    }
    if (!generated || !validated) throw lastError instanceof Error ? lastError : new Error("前贴裂变结果校验失败");
    const dimensions = [...new Set(validated.variants.map((item) => item.changedDimension))];
    const persist = await fetch(`${PB_URL}/api/lumina/prompt-fission-plans`, { method: "POST", headers: { "Content-Type": "application/json", "X-Lumina-Ui": "local" }, body: JSON.stringify({ source_asset: assetId, preserved_mechanisms: locked, variable_dimensions: dimensions, variants: validated.variants, model: generated.model, schema_version: "prompt-fission-v5-story-engines", status: "succeeded" }) });
    const stored = object(await persist.json().catch(() => ({})));
    if (!persist.ok) throw new Error(String(stored.message || "裂变方案保存失败"));
    const savedPlan = await savePromptVersion(PB_URL, assetId, "preface_fission", {
      id: String(stored.id || `fission-${Date.now()}`),
      sourceAssetId: assetId,
      preservedMechanisms: locked,
      variableDimensions: dimensions,
      settings,
      sourceDiagnosis: validated.sourceDiagnosis,
      baseline: validated.baseline,
      variants: validated.variants,
      targetMapping: validated.targetMapping,
      handoff: validated.handoff,
      model: generated.model,
      status: "succeeded",
    });
    return NextResponse.json(savedPlan);
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500;
    return NextResponse.json({ message: error instanceof Error ? error.message : "前贴裂变提示词生成失败" }, { status });
  }
}
