"use client";

import type { AdxMetrics } from "./inspiration-material-store";
import type {
  PromptFissionBaseline,
  PromptFissionSourceDiagnosis,
  PromptFissionVariant,
  PromptFissionTargetMapping,
  PromptFissionHandoff,
} from "./prompt-fission-domain";
import { pocketBaseFailureMessage } from "./pocketbase-errors";

const configuredUrl = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_POCKETBASE_URL : undefined;
const PB_URL = (configuredUrl || (typeof window !== "undefined" ? "/pb" : "http://127.0.0.1:8090")).replace(/\/$/, "");

type PBRecord = Record<string, unknown> & { id: string; collectionId: string; created?: string; expand?: Record<string, unknown> };

export type MaterialLibraryAsset = {
  id: string;
  sourceMaterialId: string;
  kind: "ai_preface" | "narration";
  title: string;
  clipStart: number;
  clipEnd: number;
  sourceRanges?: Array<{ start: number; end: number }>;
  assembledDuration?: number;
  clipStatus?: "ready" | "missing_evidence" | "pending" | "failed" | string;
  mediaUrl?: string;
  sourceMediaUrl?: string;
  sourceTitle?: string;
  platform?: string;
  language?: string;
  genres: string[];
  audienceType?: string;
  promptBlueprint: Record<string, unknown>;
  hitReasons: Array<Record<string, unknown>>;
  adxMetrics: AdxMetrics;
  reviewStatus: string;
  createdAt?: string;
  sourceAnalysis: Record<string, unknown>;
  sourceAnalysisStatus?: string;
  sourceAnalysisProgress?: number;
  prefaceAnalysisStatus?: "queued" | "running" | "succeeded" | "failed" | "no_media" | "";
  prefaceAnalysisProgress?: number;
  prefaceAnalysisError?: string;
};

export type PrefaceScriptVersion = {
  id: string;
  prompt: string;
  createdAt: string;
  model: string;
  version: number;
};

export type NarrationScriptVersion = PrefaceScriptVersion;

export type PromptFissionPlan = {
  failures?: string[];
  rawResult?: string;
  id: string;
  sourceAssetId: string;
  preservedMechanisms: string[];
  variableDimensions: string[];
  settings: PromptFissionSettings;
  sourceDiagnosis: PromptFissionSourceDiagnosis;
  baseline: PromptFissionBaseline;
  variants: PromptFissionVariant[];
  model: string;
  status: string;
  version: number;
  createdAt?: string;
  targetMapping?: PromptFissionTargetMapping[];
  handoff?: PromptFissionHandoff;
};

export type PromptFissionSettings = {
  intensity: string;
  /**
   * Kept as `goal` for saved-plan compatibility.  Its values are now the
   * concrete unanswered question that the preface must leave behind, rather
   * than a marketing KPI such as "increase retention".
   */
  goal: string;
  primaryDirection: string;
  secondaryDirection: string;
  outputLanguage: string;
  dialogueLanguage: string;
  narrationLanguage: string;
  onScreenTextLanguage: string;
  promptLanguage: string;
  mechanism?: string;
  targetGenre?: string;
  targetRelationship?: string;
  targetConflict?: string;
  targetBrief?: string;
  plotSlots?: string[];
  variationAxis?: string;
  handoffMethod?: string;
  conflictFreedom?: string;
};

export type NarrationFissionVariant = {
  title: string;
  tags: string[];
  copy: string;
  changedDimension: string;
  difference: string;
};

export type NarrationFissionPlan = {
  id: string;
  sourceAssetId: string;
  settings: {
    intensity: string;
    goal: string;
    primaryDirection: string;
    secondaryDirection: string;
    outputLanguage: string;
    promptLanguage: string;
  };
  sourceDiagnosis: { summary: string; facts: string[]; lockedFacts: string[] };
  baseline: { title: string; copy: string };
  variants: NarrationFissionVariant[];
  model: string;
  version: number;
  createdAt: string;
};

export type AdaptationTransitionPlan = {
  handoffQuestion: string;
  targetEntry: string;
  targetEntryTimecode: { start: number; end: number };
  bridgeAction: string;
  bridgeVisual: string;
  bridgeAudio: string;
  handoffReason: string;
  continuityChecks: string[];
};

export type MaterialAdaptationPlan = {
  id: string;
  templateAssetId: string;
  targetAssetId: string;
  kind: "ai_preface" | "narration";
  compatibility: { score: number; level: string; reasons: string[]; blockers: string[] };
  targetMapping: Array<{ templateMechanism: string; targetEvidence: string; targetTimecode: string; transformation: string; confidence: string }>;
  forbiddenCarryover: string[];
  transitionPlan: AdaptationTransitionPlan;
  baseline: { title: string; prompt?: string; copy?: string };
  variants: Array<{ title: string; prompt?: string; copy?: string; changedDimension: string; difference: string }>;
  model: string;
  version: number;
  createdAt: string;
};

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.map(String).filter(Boolean) : []; }
function fileUrl(record: PBRecord, name: unknown) { return typeof name === "string" && name ? `${PB_URL}/api/files/${record.collectionId}/${record.id}/${encodeURIComponent(name)}` : undefined; }
function sourceFileUrl(source: PBRecord) { return fileUrl(source, source.video || source.image); }

async function pbFetch(path: string, init?: RequestInit) {
  let response: Response;
  try { response = await fetch(`${PB_URL}${path}`, { cache: "no-store", ...init }); }
  catch { throw new Error(`无法连接 PocketBase（${PB_URL}），请先启动本项目的 PocketBase 服务`); }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string; data?: Record<string, { code?: string; message?: string }> } | null;
    throw new Error(pocketBaseFailureMessage(payload, response.status, "PocketBase 请求失败"));
  }
  return response;
}

function assetFromRecord(record: PBRecord): MaterialLibraryAsset {
  const source = object(record.expand?.source_material) as PBRecord;
  const ownAnalysis = object(record.analysis_result);
  const analysis = record.asset_kind === "ai_preface" ? ownAnalysis : Object.keys(ownAnalysis).length ? ownAnalysis : object(source.analysis_result);
  const content = object(analysis.content);
  return {
    id: record.id,
    sourceMaterialId: String(record.source_material || source.id || ""),
    kind: record.asset_kind === "narration" ? "narration" : "ai_preface",
    title: String(record.title || "未命名资产"),
    clipStart: Number(record.clip_start_seconds || 0),
    clipEnd: Number(record.clip_end_seconds || 0),
    sourceRanges: Array.isArray(record.source_ranges)
      ? record.source_ranges.map((item) => ({ start: Number(object(item).start || 0), end: Number(object(item).end || 0) })).filter((item) => item.end > item.start)
      : undefined,
    assembledDuration: Number(record.assembled_duration || 0) || undefined,
    clipStatus: String(record.clip_status || "") || undefined,
    mediaUrl: fileUrl(record, record.media_file),
    sourceMediaUrl: sourceFileUrl(source),
    sourceTitle: String(source.title || ""),
    platform: String(source.platform || ""),
    language: String(source.language || ""),
    genres: strings(source.genre_tags).length ? strings(source.genre_tags) : strings(content.genres).map(item => String(object(item).label || item)),
    audienceType: String(source.audience_type || ""),
    promptBlueprint: object(record.prompt_blueprint),
    hitReasons: Array.isArray(record.hit_reasons) ? record.hit_reasons.map(object) : [],
    adxMetrics: object(record.adx_metrics_snapshot) as AdxMetrics,
    reviewStatus: String(record.review_status || "pending"),
    createdAt: String(record.created || ""),
    sourceAnalysis: analysis,
    sourceAnalysisStatus: String(source.analysis_status || ""),
    sourceAnalysisProgress: Number(source.analysis_progress || 0),
    prefaceAnalysisStatus: String(record.preface_analysis_status || "") as MaterialLibraryAsset["prefaceAnalysisStatus"],
    prefaceAnalysisProgress: Number(record.preface_analysis_progress || 0),
    prefaceAnalysisError: String(record.preface_analysis_error || ""),
  };
}

export async function listMaterialLibraryAssets(kind?: "ai_preface" | "narration", signal?: AbortSignal) {
  const filter = kind ? `&filter=${encodeURIComponent(`asset_kind="${kind}"`)}` : "";
  // PocketBase does not expose the implicit `created` column for this migrated
  // collection on all local versions; leaving the server order intact keeps
  // the library endpoint compatible while the UI sorts by the returned date.
  const response = await pbFetch(`/api/collections/material_library_assets/records?perPage=500&expand=source_material${filter}`, { signal });
  const payload = await response.json() as { items?: PBRecord[] };
  return (payload.items || []).map(assetFromRecord);
}

export async function saveCreativePrefaceTemplate(idea: Record<string, unknown>) {
  const response = await pbFetch("/api/lumina/preface-creative-templates", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Lumina-Ui": "local" },
    body: JSON.stringify({ idea, platform: "海外短剧投放", market: "海外" }),
  });
  return response.json() as Promise<{ id: string; source_material: string; title: string }>;
}

export async function updateMaterialClassification(id: string, materialType: string) {
  await pbFetch(`/api/lumina/materials/${encodeURIComponent(id)}/classification`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Lumina-Ui": "local" },
    body: JSON.stringify({ material_type: materialType }),
  });
}

export async function retryMaterialAnalysis(id: string) {
  const response = await pbFetch(`/api/lumina/material-analysis/materials/${encodeURIComponent(id)}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Lumina-Ui": "local" },
    body: JSON.stringify({ force: true, force_semantic_refresh: true }),
  });
  return response.json() as Promise<{ id: string; status: string; attempt: number }>;
}

export async function enqueuePrefaceAnalysis(assetId: string) {
  const response = await pbFetch(`/api/lumina/preface-analysis/assets/${encodeURIComponent(assetId)}/enqueue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Lumina-Ui": "local" },
  });
  return response.json() as Promise<{ outcome: string; asset?: string; job?: string; status?: string }>;
}

export async function enqueueIncompletePrefaceAnalysis() {
  const response = await pbFetch("/api/lumina/preface-analysis/enqueue-incomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Lumina-Ui": "local" },
  });
  return response.json() as Promise<{ total: number; queued: number; already_active: number; complete: number; no_media: number; failed: number; failures: Array<{ asset: string; message: string }> }>;
}

export async function removeMaterialLibraryAsset(id: string) {
  await pbFetch(`/api/collections/material_library_assets/records/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function renameMaterialLibraryAsset(id: string, title: string) {
  const response = await pbFetch(`/api/collections/material_library_assets/records/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title.trim() }),
  });
  return assetFromRecord(await response.json() as PBRecord);
}

export async function createPromptFission(
  assetId: string,
  preservedMechanisms: string[],
  variableDimensions: string[],
  settings?: PromptFissionSettings,
): Promise<PromptFissionPlan> {
  const response = await fetch("/api/prompt-fission", {
    signal: AbortSignal.timeout(540_000),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetId, preservedMechanisms, variableDimensions, settings }),
  });
  const payload = await response.json() as PromptFissionPlan & { message?: string };
  if (!response.ok) throw new Error(payload.message || `提示词裂变失败（HTTP ${response.status}）`);
  return payload;
}

export async function createNarrationFission(
  assetId: string,
  settings: NarrationFissionPlan["settings"],
): Promise<NarrationFissionPlan> {
  const response = await fetch("/api/narration-fission", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetId, settings }),
  });
  const payload = await response.json() as NarrationFissionPlan & { message?: string };
  if (!response.ok) throw new Error(payload.message || `解说文案裂变失败（HTTP ${response.status}）`);
  return payload;
}

export async function createMaterialAdaptation(
  templateAssetId: string,
  targetAssetId: string,
  kind: "ai_preface" | "narration",
  settings: Record<string, unknown> = {},
): Promise<MaterialAdaptationPlan> {
  const response = await fetch("/api/material-adaptation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateAssetId, targetAssetId, kind, settings }),
  });
  const payload = await response.json() as MaterialAdaptationPlan & { message?: string };
  if (!response.ok) throw new Error(payload.message || `跨剧适配失败（HTTP ${response.status}）`);
  return payload;
}

export type GenerationStreamEvent =
  | { type: "status"; status: string }
  | { type: "reset"; status?: string }
  | { type: "delta"; delta: string }
  | { type: "saved"; value: PrefaceScriptVersion }
  | { type: "error"; message: string };

async function streamGeneration(
  endpoint: string,
  assetId: string,
  onEvent: (event: GenerationStreamEvent) => void,
): Promise<PrefaceScriptVersion> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetId }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message || `生成失败（HTTP ${response.status}）`);
  }
  if (!response.body) throw new Error("生成服务没有返回内容流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let saved: PrefaceScriptVersion | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as GenerationStreamEvent;
    onEvent(event);
    if (event.type === "saved") saved = event.value;
    if (event.type === "error") throw new Error(event.message);
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) consume(line);
    if (done) break;
  }
  if (buffer) consume(buffer);
  if (!saved) throw new Error("生成完成，但版本保存结果缺失");
  return saved;
}

export function regeneratePrefaceStoryboard(assetId: string, onEvent: (event: GenerationStreamEvent) => void) {
  return streamGeneration("/api/prompt-storyboard", assetId, onEvent);
}

export function regenerateNarrationScript(assetId: string, onEvent: (event: GenerationStreamEvent) => void) {
  return streamGeneration("/api/narration-script", assetId, onEvent);
}
