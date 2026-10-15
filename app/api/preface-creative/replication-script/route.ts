import { requestPrefaceJson } from "../../../lib/server/preface-creative-ai";
import { savePromptVersion } from "../../../lib/prompt-version-server";
import { PREFACE_AD_SAFETY_CONTRACT } from "../../../lib/preface-ad-safety";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const assetId = url.searchParams.get("assetId");
  const planId = url.searchParams.get("planId");
  if (!assetId || !planId) return Response.json({ message: "缺少素材或方案" }, { status: 400 });
  try {
    const base = (process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
    const response = await fetch(`${base}/api/collections/material_library_assets/records/${encodeURIComponent(assetId)}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return Response.json({ message: "无法读取素材历史" }, { status: response.status });
    const asset = await response.json();
    const blueprint = typeof asset.prompt_blueprint === "string" ? JSON.parse(asset.prompt_blueprint) : asset.prompt_blueprint || {};
    const records = Array.isArray(blueprint.replicationScriptVersions) ? blueprint.replicationScriptVersions.filter((record: { planId?: string }) => record.planId === planId) : [];
    return Response.json({ records });
  } catch { return Response.json({ message: "读取历史失败" }, { status: 503 }); }
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("\n\n");
  if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}：${text(item)}`).join("\n");
  return value == null ? "" : String(value);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.assetId || !body.planId || !body.variant || (!body.variant.prompt && !body.variant.synopsis)) return Response.json({ message: "缺少可扩写的复刻候选" }, { status: 400 });
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(480_000)]);
    const generated = await requestPrefaceJson(body.provider,
      `你是海外短剧前贴编剧与分镜导演。将用户选中的复刻候选扩写为完整脚本与对应分镜，保留候选核心事件、新剧情角色原名、人物关系、因果与悬念。不得把候选摘要当作完整脚本返回。按0—3、3—7、7—11、11—15秒写连续动作、对白和结尾承接；分镜逐镜写时间、景别、运镜、场景、角色动作、对白和声音。说明用中文；对白优先服从用户补充要求，未指定则使用英语。不得添加字幕、水印或屏幕文字。${PREFACE_AD_SAFETY_CONTRACT}\n只返回JSON：{"script":"完整可拍摄脚本","storyboardScript":"与完整脚本对应的分镜脚本"}。`,
      JSON.stringify({ selectedCandidate: body.variant, newStoryBrief: body.brief || "" }), 10000, signal);
    const script = text(generated.value.script);
    const storyboardScript = text(generated.value.storyboardScript || generated.value.storyboard);
    if (!script && !storyboardScript) return Response.json({ message: "模型未返回可展示的脚本或分镜，请重试" }, { status: 422 });
    const partialWarning = !script || !storyboardScript ? "本次返回不完整，已有内容已保留，可重新生成补全。" : "";
    const result = { id: `replication-script-${Date.now()}`, planId: body.planId, candidateIndex: body.candidateIndex, title: body.variant.title, script, storyboardScript, model: generated.model, warning: partialWarning };
    const pbUrl = (process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
    try { return Response.json(await savePromptVersion(pbUrl, body.assetId, "replication_script", result)); }
    catch (error) { return Response.json({ ...result, version: 0, createdAt: new Date().toISOString(), warning: `${partialWarning} 服务端历史未保存：${error instanceof Error ? error.message : "保存失败"}，请复制当前结果。` }); }
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "脚本与分镜生成失败" }, { status: 500 });
  }
}
