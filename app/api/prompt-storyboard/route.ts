import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildQwenMultimodalContent, pocketBaseFileUrl } from "../../lib/prompt-fission-multimodal";
import { prepareQwenVideoInput } from "../../lib/qwen-video-input";
import { savePromptVersion } from "../../lib/prompt-version-server";
import { ndjsonResponse, streamOpenAiCompatibleText } from "../../lib/openai-compatible-stream";
import {
  normalizeStoryboardTimeline,
  parseStoryboardScript,
  renderStoryboardTimeline,
  sealStoryboardTimeline,
  storyboardCoverageIssues,
  storyboardRepairIntervals,
} from "../../lib/preface-storyboard-timeline";

export const runtime = "nodejs";

const PB_URL = (process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");

function serverEnv(name: string) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(path.resolve(process.cwd(), ".env.analysis.local"), "utf8")
      .split(/\r?\n/)
      .find((value) => value.trim().startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^['\"]|['\"]$/g, "") || undefined;
  } catch { return undefined; }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseScript(text: string): string {
  const cleaned = text.trim().replace(/^```(?:json|text|markdown)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const value = object(JSON.parse(cleaned));
    const script = String(value.script || value.prompt || "").trim();
    if (script) return script;
  } catch { /* model may return the script directly */ }
  if (cleaned.includes("【分镜")) return cleaned;
  throw new Error("模型没有返回完整的原前贴镜头脚本");
}

function stripNonNarrativeText(script: string): string {
  return script
    .split(/\r?\n/)
    .map((line) => {
      const visualText = line.match(/^\s*【(?:画面文字|屏幕文字)】\s*(.+)$/);
      if (!visualText) return line;
      const text = visualText[1].trim();
      // A standalone visual-text field is not part of the reusable storyboard
      // format. Preserve story-bearing text by moving it into the picture
      // description; only discard known editorial overlays.
      return /(?:片名|热播短剧|剧情虚构|AI生成|无不良价值观|画面均为AI生成|请勿模仿|水印|平台角标|扫码|点击下载|广告推广)/i.test(text)
        ? ""
        : `【画面描述】画面中可见文字：“${text}”。`;
    })
    .filter((line) => !/【(?:字幕|水印|片名|角标)】/.test(line))
    .filter((line) => !/^\s*(?:片名|左侧(?:竖排)?|右侧(?:竖排)?|底部(?:字幕)?|字幕|水印|角标)\s*[：:]/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: Request) {
  try {
    const assetId = String(object(await request.json()).assetId || "").trim();
    if (!assetId) return NextResponse.json({ message: "缺少 AI 前贴资产" }, { status: 400 });

    const assetResponse = await fetch(`${PB_URL}/api/collections/material_library_assets/records/${encodeURIComponent(assetId)}`, { cache: "no-store" });
    if (!assetResponse.ok) return NextResponse.json({ message: "找不到 AI 前贴资产" }, { status: 404 });
    const asset = object(await assetResponse.json());
    if (asset.asset_kind !== "ai_preface") return NextResponse.json({ message: "只有 AI 前贴可以生成原前贴镜头脚本" }, { status: 422 });

    const endpoint = serverEnv("LUMINA_SEMANTIC_ENDPOINT");
    const apiKey = serverEnv("LUMINA_SEMANTIC_API_KEY") || serverEnv("DASHSCOPE_API_KEY") || serverEnv("OPENAI_API_KEY");
    const model = serverEnv("LUMINA_SEMANTIC_MODEL");
    if (!endpoint || !apiKey || !model) return NextResponse.json({ message: "尚未配置语义模型，无法重新生成镜头脚本" }, { status: 503 });

    const mediaUrl = pocketBaseFileUrl(PB_URL, asset, "media_file");
    const expectedDuration = Math.max(
      0,
      Number(asset.assembled_duration || 0)
      || Number(asset.clip_end_seconds || 0) - Number(asset.clip_start_seconds || 0),
    );
    if (String(asset.clip_status || "") !== "ready" || !mediaUrl || expectedDuration <= 0) {
      return NextResponse.json({ message: "前贴片段尚未完成切割，请先重新分析或人工确认边界" }, { status: 422 });
    }
    const visualInput = await prepareQwenVideoInput({
      url: mediaUrl,
      contentHash: String(asset.content_hash || ""),
      sourceContentHash: String(asset.content_hash || ""),
      startSeconds: 0,
      endSeconds: expectedDuration,
      inlineMaxBytes: Number(process.env.LUMINA_QWEN_INLINE_VIDEO_MAX_BYTES || 6_500_000),
    });
    if (!visualInput) return NextResponse.json({ message: "前贴视频不可读取，无法按原片重新生成脚本" }, { status: 422 });

    const baseInstruction = `你是短剧前贴拉片导演。必须逐镜观看用户提供的原前贴视频；已有结构化分析仅用于核对，视频画面、原声和可见文字优先。请重新产出一份可直接用于 AIGC 视频复刻的“原前贴镜头脚本”。

直接输出脚本文本，不要 JSON、代码围栏、解释或分析。脚本必须从 0 秒连续覆盖到前贴结束，不能有时间戳断裂或重叠；按真实硬切、景别、动作主体、场景或运镜变化拆镜，单镜不得把多个变化混在一起。每个镜头用以下结构：
【分镜N（开始-结束秒）】
【画面参数】仅写可见比例与画面质感
【相机参数】仅写有直接证据的参数，否则省略
【构图与运镜】仅写连续画面可证明的构图和运动，否则省略
【焦点变换】只有确认焦点变化才写，否则省略
【画面描述】写前景/中景/后景、人物位置、动作过程、道具状态、可见反应；人物只能写 @人物1、@人物2，不得描述外貌。片名、水印、平台角标、AI生成标识、免责声明、行动引导和对白字幕都不描述；但画面中真正参与剧情、推动理解的文字必须原样写入本字段，例如蚂蚁/物体排成的文字、信件或告示内容、手机聊天内容、招牌、倒计时、关键屏幕提示。格式为“画面中可见文字：‘具体文字’”，不要另开【画面文字】字段。
【原片语音】逐句保留实际听到的对白、旁白或解说；无语音时省略。
【声音】只写实际听到的环境音、动作声或音乐；无可靠证据时省略。
【镜头衔接】只写明确的切换。

不得写爆款机制、目的、点击率、留存率、生成建议，也不得编造外貌、台词、音效、焦点或摄影参数。严禁输出独立的【画面文字】、【字幕】或同类字段；片名、水印、热播短剧、剧情虚构、AI生成、无不良价值观引导、画面均为AI生成、请勿模仿、CTA 等均不是镜头复刻信息，必须忽略。注意：这不适用于画面中真实存在、承担剧情信息的文字；此类文字必须转写到【画面描述】中。

特别检查每一段连续画面，包括没有硬切但主体、景别、构图或动作阶段发生变化的区间；不能因为画面内出现文字就跳过该时间段。`;
    const context = JSON.stringify({
      title: asset.title,
      prefaceRange: { start: 0, end: expectedDuration },
      analysis: asset.analysis_result,
      priorVersions: object(asset.prompt_blueprint).scriptVersions,
      frameTimeline: visualInput.frameTimeline,
    });
    if (endpoint.replace(/\/$/, "").endsWith("/responses")) {
      return NextResponse.json({ message: "当前流式脚本生成需要 OpenAI 兼容的 chat/completions 地址" }, { status: 503 });
    }
    return ndjsonResponse(async (send) => {
      const requestShots = async (instruction: string, onDelta?: (delta: string) => void) => {
        const content = buildQwenMultimodalContent({ text: context, ...visualInput });
        const modelResponse = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, stream: true, messages: [{ role: "system", content: instruction }, { role: "user", content }] }),
        });
        const raw = await streamOpenAiCompatibleText(modelResponse, (delta) => onDelta?.(delta));
        return parseStoryboardScript(stripNonNarrativeText(parseScript(raw)));
      };

      send({ type: "status", status: "读取裁剪片段" });
      send({ type: "status", status: "逐镜生成" });
      let shots = normalizeStoryboardTimeline(
        await requestShots(baseInstruction, (delta) => send({ type: "delta", delta })),
        expectedDuration,
      );
      const gaps = storyboardRepairIntervals(shots, expectedDuration).slice(0, 8);
      if (gaps.length) {
        send({ type: "status", status: `修复缺失区间（${gaps.length} 处）` });
        for (const gap of gaps) {
          const repairInstruction = `${baseInstruction}\n\n本次只补充 ${gap.start.toFixed(2)}-${gap.end.toFixed(2)} 秒。只输出该区间内一个或多个完整分镜，不得输出区间外内容；首镜从 ${gap.start.toFixed(2)} 秒开始，末镜在 ${gap.end.toFixed(2)} 秒结束。`;
          const repaired = await requestShots(repairInstruction);
          shots = normalizeStoryboardTimeline([...shots, ...repaired], expectedDuration);
        }
      }
      let coverageIssues = storyboardCoverageIssues(shots, expectedDuration);
      if (coverageIssues.length) {
        // The descriptions are already grounded in the clip. Close residual
        // boundary rounding/gap disagreements deterministically instead of
        // discarding the entire generated script for a fourth time.
        shots = sealStoryboardTimeline(shots, expectedDuration);
        coverageIssues = storyboardCoverageIssues(shots, expectedDuration);
      }
      if (coverageIssues.length) throw new Error(`镜头时间轴无法闭合：${coverageIssues.join("；")}`);
      const script = renderStoryboardTimeline(shots);
      send({ type: "reset", status: "连续性校验通过" });
      send({ type: "delta", delta: script });
      send({ type: "status", status: "保存版本" });
      const saved = await savePromptVersion(PB_URL, assetId, "script", { id: `script-${Date.now()}`, prompt: script, model });
      send({ type: "saved", value: saved });
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "镜头脚本重新生成失败" }, { status: 500 });
  }
}
