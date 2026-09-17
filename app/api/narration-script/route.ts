import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildQwenMultimodalContent, pocketBaseFileUrl } from "../../lib/prompt-fission-multimodal";
import { prepareQwenVideoInput } from "../../lib/qwen-video-input";
import { ndjsonResponse, streamOpenAiCompatibleText } from "../../lib/openai-compatible-stream";
import { savePromptVersion } from "../../lib/prompt-version-server";

export const runtime = "nodejs";

const PB_URL = (process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function serverEnv(name: string) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(path.resolve(process.cwd(), ".env.analysis.local"), "utf8")
      .split(/\r?\n/).find((value) => value.trim().startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^['\"]|['\"]$/g, "") || undefined;
  } catch { return undefined; }
}
function cleanScript(value: string) {
  return value.trim().replace(/^```(?:text|markdown)?\s*/i, "").replace(/\s*```$/, "");
}

type SpeechSegment = { start: number; end: number; text: string; confidence?: number };

function speechSegments(value: unknown): SpeechSegment[] {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((raw) => {
      const row = object(raw);
      return {
        start: Number(row.start),
        end: Number(row.end),
        text: String(row.text || "").trim(),
        confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : undefined,
      };
    })
    .filter((row) => row.text && Number.isFinite(row.start) && Number.isFinite(row.end) && row.end > row.start);
}

function priorNarrationSegments(analysis: Record<string, unknown>): SpeechSegment[] {
  const creative = object(analysis.creative);
  const rows = Array.isArray(creative.narrationSegments) ? creative.narrationSegments : [];
  return speechSegments(rows.filter((raw) => object(raw).verification === "verified"));
}

function transcriptText(rows: SpeechSegment[]) {
  return rows.map((row) => `[${row.start.toFixed(2)}-${row.end.toFixed(2)}] ${row.text}`).join("\n");
}

export async function POST(request: Request) {
  try {
    const assetId = String(object(await request.json()).assetId || "").trim();
    if (!assetId) return NextResponse.json({ message: "缺少解说素材" }, { status: 400 });
    const assetResponse = await fetch(`${PB_URL}/api/collections/material_library_assets/records/${encodeURIComponent(assetId)}`, { cache: "no-store" });
    if (!assetResponse.ok) return NextResponse.json({ message: "找不到解说素材" }, { status: 404 });
    const asset = object(await assetResponse.json());
    if (asset.asset_kind !== "narration") return NextResponse.json({ message: "只有解说素材可以重新生成解说文案" }, { status: 422 });
    const endpoint = serverEnv("LUMINA_SEMANTIC_ENDPOINT");
    const apiKey = serverEnv("LUMINA_SEMANTIC_API_KEY") || serverEnv("DASHSCOPE_API_KEY") || serverEnv("OPENAI_API_KEY");
    const model = serverEnv("LUMINA_SEMANTIC_MODEL");
    if (!endpoint || !apiKey || !model) return NextResponse.json({ message: "尚未配置语义模型，无法重新生成解说文案" }, { status: 503 });
    if (endpoint.replace(/\/$/, "").endsWith("/responses")) return NextResponse.json({ message: "当前流式文案生成需要 OpenAI 兼容的 chat/completions 地址" }, { status: 503 });
    let mediaUrl = pocketBaseFileUrl(PB_URL, asset, "media_file");
    let sourceContentHash = "";
    const sourceMaterialId = String(asset.source_material || "").trim();
    if (!mediaUrl && sourceMaterialId) {
      const sourceResponse = await fetch(`${PB_URL}/api/collections/ad_materials/records/${encodeURIComponent(sourceMaterialId)}`, { cache: "no-store" });
      if (sourceResponse.ok) {
        const source = object(await sourceResponse.json());
        mediaUrl = pocketBaseFileUrl(PB_URL, source, source.video ? "video" : "image");
        sourceContentHash = String(source.content_hash || "");
      }
    }
    const clipStart = Number(asset.clip_start_seconds || 0);
    const clipEnd = Number(asset.clip_end_seconds || 0) || undefined;
    const evidenceUrl = sourceMaterialId
      ? `${PB_URL}/api/lumina/materials/${encodeURIComponent(sourceMaterialId)}/speech-evidence?start=${encodeURIComponent(String(clipStart))}${clipEnd ? `&end=${encodeURIComponent(String(clipEnd))}` : ""}`
      : "";
    const [visualInput, evidenceResponse] = await Promise.all([
      prepareQwenVideoInput({
        url: mediaUrl,
        contentHash: String(asset.content_hash || ""),
        sourceContentHash,
        startSeconds: clipStart,
        endSeconds: clipEnd,
        inlineMaxBytes: Number(process.env.LUMINA_QWEN_INLINE_VIDEO_MAX_BYTES || 6_500_000),
      }),
      evidenceUrl
        ? fetch(evidenceUrl, { cache: "no-store", headers: { "X-Lumina-Ui": "local" } }).catch(() => undefined)
        : Promise.resolve(undefined),
    ]);
    const evidencePayload = evidenceResponse?.ok ? object(await evidenceResponse.json()) : {};
    const cachedSpeech = speechSegments(evidencePayload.segments);
    const analyzedSpeech = priorNarrationSegments(object(asset.analysis_result));
    const audioEvidence = cachedSpeech.length ? cachedSpeech : analyzedSpeech;
    if (!visualInput && !audioEvidence.length) {
      return NextResponse.json({ message: "解说音轨证据不可读取，请先重新分析该素材后再生成" }, { status: 422 });
    }
    const instruction = `你是多语种短剧广告的专业口播校对员。逐段核对用户提供的视频，以及本地分析 Worker 产生的带时间码音轨转写证据；只提取画外解说、旁白或主持人口播，不得把画内角色对白、对白字幕、标题、画面文字、剧情摘要或你的概括写进文案。

语言不限于中文，必须按音轨实际语言识别。判断依据是：说话者不与画面人物口型同步、声音跨镜头连续、为画面补充因果或背景信息、具有面向观众讲述的语气。画内人物开口、轮流对话、对白字幕与口型同步时一律排除。若同一时间既有解说又有角色对白，只保留可确认的解说原话。

直接输出可交给配音员使用的分析后文案，不要 JSON、代码围栏、分析理由或虚构补写。格式为：
【解说文案】
【开始-结束秒｜实际语种】
逐字口播原文

每段保留原语言和原意，可纠正明显 ASR 同音错字与标点，但不得改写剧情。没有独立解说时只输出“未检测到独立解说口播”。`;
    const context = JSON.stringify({
      title: asset.title,
      clipStart: asset.clip_start_seconds,
      clipEnd: asset.clip_end_seconds,
      priorAnalysis: asset.analysis_result,
      audioEvidence: transcriptText(audioEvidence),
      audioEvidenceSource: cachedSpeech.length ? "analysis-worker-asr" : "verified-narration-analysis",
      audioEvidenceTruncated: evidencePayload.truncated === true,
    });
    return ndjsonResponse(async (send) => {
      send({ type: "status", status: cachedSpeech.length ? "正在按音轨证据重新识别独立解说口播" : "正在按已验证口播重新校对解说文案" });
      const content = buildQwenMultimodalContent({ text: context, ...(visualInput || {}) });
      const modelResponse = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, stream: true, messages: [{ role: "system", content: instruction }, { role: "user", content }] }) });
      const script = cleanScript(await streamOpenAiCompatibleText(modelResponse, (delta) => send({ type: "delta", delta })));
      if (!script || script.includes("未检测到独立解说口播")) throw new Error("模型未检测到可确认的独立解说口播；原有分析结果没有被覆盖");
      send({ type: "status", status: "解说文案已生成，正在保存版本" });
      const saved = await savePromptVersion(PB_URL, assetId, "narration_script", { id: `narration-script-${Date.now()}`, prompt: script, model });
      send({ type: "saved", value: saved });
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "解说文案重新生成失败" }, { status: 500 });
  }
}
