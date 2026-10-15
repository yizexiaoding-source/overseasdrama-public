"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createMaterialAdaptation, createPromptFission, enqueueIncompletePrefaceAnalysis, enqueuePrefaceAnalysis, listMaterialLibraryAssets, saveCreativePrefaceTemplate, type MaterialAdaptationPlan, type MaterialLibraryAsset, type PromptFissionPlan, type PromptFissionSettings } from "../../lib/material-library-store";
import { parseAiTagRecommendations, parseConflictUnits, type CreativeTag } from "../../lib/preface-creative-catalog";
import { hasCreativeTaskChanged, hasHookStrategyChanged, mergeCreativeCandidates, parseCreativeCandidates, parseCreativeIdeas, restoreCreativeCandidates, type PrefaceBranchSpec, type PrefaceCandidateLocks, type PrefaceCreativeCandidate, type PrefaceCreativeIdea, type PrefaceCreativeInput } from "../../lib/preface-creative-domain";
import { createPrefaceCreativeFavorite, createPrefaceIdeaRecord, prefaceTaskKey, runPrefaceBatch, type PrefaceCreativeFavorite, type PrefaceGenerationOrigin } from "../../lib/preface-creative-records";
import { buildPrefaceAnalysisView } from "../../lib/preface-analysis-view-model";
import PrefacePlanningWorkflow from "./PrefacePlanningWorkflow";
import ReplicationResults from "./ReplicationResults";
import styles from "./PrefaceCreativeWorkspace.module.css";

type Mode = "planning" | "replicate" | "matching";
type Props = {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onNotify?: (message: string) => void;
  initialReplicationTemplateId?: string;
  onOpenPrefaceLibrary?: () => void;
  prefaceFavorites?: PrefaceCreativeFavorite[];
  onPrefaceFavoritesChange?: (favorites: PrefaceCreativeFavorite[]) => void;
  resumeFavorite?: PrefaceCreativeFavorite | null;
  onResumeFavoriteConsumed?: () => void;
};

const defaults: PrefaceCreativeInput = {
  creationSource: "标签策划", creationBasis: "synopsis", emotionTags: [], handoffStrategy: "auto", genre: "", targetMarket: "海外短剧投放", targetLanguage: "英语",
  femaleLead: "", maleLead: "", maleSecond: "", relationship: "", emotion: "", hookStyle: "", durationSeconds: "5-15", plotSynopsis: "", supplementalRequirements: "",
  worldLevel: "", worldView: "", worldViewCategory: "", worldViewTags: [], relationshipTags: [], characterSettingTags: [], violenceLevel: "medium", dramaIntensity: "emotional", needsHandoff: "AI自动寻找最佳承接点",
  preferredTransitionAnchor: "", allowedSettings: [], forbiddenSettings: [],
  hookFamily: "身份地位钩子", hookType: "资格剥夺", hookFormat: "公开羞辱型", lockedTags: [], excludedTags: [], modelProvider: "qwen",
};

function replicationMediaUrl(asset: MaterialLibraryAsset) {
  return asset.mediaUrl || (asset.sourceMediaUrl ? `${asset.sourceMediaUrl}#t=${Math.max(0, asset.clipStart)},${Math.max(asset.clipStart, asset.clipEnd)}` : "");
}

const replicationHookTypes = ["身份反差", "公开羞辱", "关系反转", "信息差", "异常事件", "危险逼近", "动作冲突", "悬念结尾"];
const replicationRelations = ["家庭关系", "夫妻关系", "恋爱关系", "亲子关系", "职场关系", "身份对立", "利益冲突"];
const assetContentValues = (asset: MaterialLibraryAsset, key: string) => {
  const content = asset.sourceAnalysis.content as Record<string, unknown> | undefined;
  const value = content?.[key] ?? (key === "relations" ? content?.relationships : undefined);
  return Array.isArray(value) ? value.map((item) => typeof item === "object" && item ? String((item as Record<string, unknown>).label || (item as Record<string, unknown>).value || "") : String(item)).filter(Boolean) : [];
};
const missingReplicationAnalysis = (asset: MaterialLibraryAsset) => buildPrefaceAnalysisView(asset).missing;
const prefaceStatusLabel = (asset: MaterialLibraryAsset) => ({ queued: "排队中", running: `分析中 ${asset.prefaceAnalysisProgress || 0}%`, succeeded: "已完成", failed: "分析失败", no_media: "无视频源" }[asset.prefaceAnalysisStatus || ""] || "待补全");
const compactText = (value: string, length = 180) => value.length > length ? `${value.slice(0, length).trim()}…` : value;
const looksLikeAssetId = (value: string) => /^[a-z0-9]{4,}(?:-[a-z0-9]{4,})+$/i.test(value.trim());
const replicationTitle = (asset: MaterialLibraryAsset) => {
  if (asset.title.trim() && !looksLikeAssetId(asset.title) && asset.title !== "未命名资产") return asset.title;
  const hook = buildPrefaceAnalysisView(asset).replicationLines.find((row) => row.label === "开场")?.value || "";
  return hook ? `${compactText(hook.replace(/^.*?[：:]/, ""), 14)}前贴` : "未命名前贴";
};

function ReplicationLibrary({ assets, onUse, onReloadAssets }: { assets: MaterialLibraryAsset[]; onUse: (asset: MaterialLibraryAsset) => void; onReloadAssets: () => Promise<MaterialLibraryAsset[]> }) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [hookType, setHookType] = useState("");
  const [relation, setRelation] = useState("");
  const [preview, setPreview] = useState<MaterialLibraryAsset | null>(null);
  const [analysisState, setAnalysisState] = useState<"idle" | "queued" | "error">("idle");
  const [analysisMessage, setAnalysisMessage] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const closePreview = () => { setPreview(null); setAnalysisState("idle"); setAnalysisMessage(""); };
  const incompleteCount = assets.filter((asset) => missingReplicationAnalysis(asset).length > 0 && asset.prefaceAnalysisStatus !== "no_media").length;
  useEffect(() => {
    if (!assets.some((asset) => ["queued", "running"].includes(asset.prefaceAnalysisStatus || ""))) return;
    const timer = window.setInterval(() => { void onReloadAssets().then((fresh) => setPreview((current) => current ? fresh.find((item) => item.id === current.id) || current : null)); }, 3_000);
    return () => window.clearInterval(timer);
  }, [assets, onReloadAssets]);
  const genres = [...new Set(assets.flatMap((asset) => asset.genres).filter(Boolean))];
  const filtered = assets.filter((asset) => {
    const text = `${asset.title} ${asset.genres.join(" ")} ${asset.hitReasons.map((item) => String(item.label || item.reason || "")).join(" ")} ${assetContentValues(asset, "relations").join(" ")}`.toLowerCase();
    const inferredHook = `${asset.promptBlueprint.hookType || ""} ${asset.hitReasons.map((item) => String(item.label || item.reason || "")).join(" ")}`;
    const inferredRelation = assetContentValues(asset, "relations").join(" ");
    return text.includes(query.trim().toLowerCase()) && (!genre || asset.genres.includes(genre)) && (!hookType || inferredHook.includes(hookType)) && (!relation || inferredRelation.includes(relation));
  });
  const fillAnalysis = async () => {
    if (!preview) return;
    setAnalysisState("queued"); setAnalysisMessage("任务已提交。关闭页面后仍会继续分析。");
    try {
      const result = await enqueuePrefaceAnalysis(preview.id);
      const fresh = await onReloadAssets();
      setPreview(fresh.find((item) => item.id === preview.id) || preview);
      if (result.outcome === "no_media") { setAnalysisState("error"); setAnalysisMessage("该母版没有可补全的视频源。"); }
    } catch (reason) {
      setAnalysisState("error"); setAnalysisMessage(reason instanceof Error ? reason.message : "补全分析未能提交，请重试。");
    }
  };
  const fillAllAnalysis = async () => {
    setBatchBusy(true); setBatchMessage("");
    try {
      const result = await enqueueIncompletePrefaceAnalysis();
      setBatchMessage(`已提交 ${result.queued} 条，处理中 ${result.already_active} 条，跳过完整项 ${result.complete} 条${result.no_media ? `，无视频源 ${result.no_media} 条` : ""}${result.failed ? `，失败 ${result.failed} 条（其他母版已继续提交）` : ""}。`);
      await onReloadAssets();
    } catch (reason) { setBatchMessage(reason instanceof Error ? reason.message : "批量补全未能提交。"); }
    finally { setBatchBusy(false); }
  };
  return <section className={styles.replicationLibrary} aria-label="前贴母版库">
    <header className={styles.replicationLibraryHeader}><div><span className={styles.eyebrow}>STEP 1 · TEMPLATE LIBRARY</span><h2>选择前贴母版</h2><p>先浏览并预览一条有效前贴，再输入新的剧情进行复刻。</p></div><div className={styles.libraryHeaderActions}><span className={styles.libraryCount}>{filtered.length} 条母版</span><button type="button" className={styles.secondaryButton} disabled={batchBusy || incompleteCount === 0} onClick={() => void fillAllAnalysis()}>{batchBusy ? "正在提交…" : `一键补全分析（${incompleteCount}）`}</button></div></header>
    {batchMessage && <div className={styles.analysisNotice} role="status">{batchMessage}</div>}
    <label className={styles.librarySearch}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、题材或钩子标签" /></label>
    <div className={styles.replicationFilters}><label><span>题材类型</span><select value={genre} onChange={(event) => setGenre(event.target.value)}><option value="">全部题材</option>{genres.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>人物关系</span><select value={relation} onChange={(event) => setRelation(event.target.value)}><option value="">全部关系</option>{replicationRelations.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>钩子类型</span><select value={hookType} onChange={(event) => setHookType(event.target.value)}><option value="">全部钩子</option>{replicationHookTypes.map((item) => <option key={item}>{item}</option>)}</select></label><button type="button" className={styles.secondaryButton} onClick={() => { setGenre(""); setRelation(""); setHookType(""); setQuery(""); }}>清空筛选</button></div>
    {filtered.length ? <div className={styles.replicationGrid}>{filtered.map((asset) => { const url = replicationMediaUrl(asset); return <article className={styles.replicationCard} key={asset.id}>
      <button type="button" className={styles.replicationThumb} onClick={() => setPreview(asset)}>{url ? <video src={url} muted playsInline preload="metadata" /> : <span>暂无片源</span>}</button>
      <div className={styles.replicationCardBody}><div className={styles.metaLine}>{asset.genres.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}<span>{Math.max(1, Math.round(asset.clipEnd - asset.clipStart))} 秒</span><span className={styles.analysisStatus}>{prefaceStatusLabel(asset)}</span></div><h3>{replicationTitle(asset)}</h3><p>{String(asset.hitReasons[0]?.reason || asset.hitReasons[0]?.label || "动作因果与结尾卡点")}</p><div className={styles.replicationCardActions}><button type="button" onClick={() => setPreview(asset)}>查看母版</button><button type="button" className={styles.cardPrimary} onClick={() => onUse(asset)}>立即使用</button></div></div>
    </article>; })}</div> : <div className={styles.empty}><strong>没有符合条件的母版</strong><span>请调整关键词或先在 AI 前贴库保存一条前贴。</span></div>}
    {preview && (() => {
      const view = buildPrefaceAnalysisView(preview);
      const creativeApproach = view.creativeApproach;
      const handoff = view.handoff;
      const missing = view.missing;
      const replicationLines = view.replicationLines.map((row) => [row.label, row.value] as [string, string]);
      return <div className={styles.replicationModalBackdrop} role="dialog" aria-modal="true"><section className={styles.replicationModal} aria-labelledby="replication-preview-title"><header><div><div className={styles.previewMeta}>{preview.genres.slice(0, 1).map((tag) => <span key={tag}>{tag}</span>)}<small>{Math.max(1, Math.round(preview.clipEnd - preview.clipStart))} 秒 · 9:16</small><span>{prefaceStatusLabel(preview)}</span></div><h2 id="replication-preview-title">{replicationTitle(preview)}</h2></div><button type="button" onClick={closePreview} aria-label="关闭预览">×</button></header><div className={styles.replicationModalBody}><div className={styles.replicationVideo}>{replicationMediaUrl(preview) ? <video src={replicationMediaUrl(preview)} controls playsInline /> : <span>暂无片源</span>}</div><div className={styles.replicationDetails}>{missing.length > 0 && <div className={styles.analysisNotice} role="status"><b>分析尚未完整</b><span>缺少：{missing.join("、")}</span></div>}{preview.prefaceAnalysisError && <div className={styles.analysisError} role="status">{preview.prefaceAnalysisError}</div>}{analysisMessage && <div className={analysisState === "error" ? styles.analysisError : styles.analysisNotice} role="status">{analysisMessage}</div>}{creativeApproach && <section><h3>创作思路</h3><p>{compactText(creativeApproach)}</p></section>}{replicationLines.length > 0 && <section><h3>复刻思路</h3><ul>{replicationLines.map(([label, value]) => <li key={label}><b>{label}：</b>{compactText(value, 72)}</li>)}</ul></section>}{handoff && <section><h3>衔接正片方向</h3><p>{compactText(handoff, 120)}</p></section>}</div></div><footer><button type="button" className={styles.secondaryButton} onClick={closePreview}>返回选择</button>{missing.length > 0 && <button type="button" className={styles.secondaryButton} disabled={analysisState === "queued" || ["queued", "running"].includes(preview.prefaceAnalysisStatus || "")} onClick={() => void fillAnalysis()}>{["queued", "running"].includes(preview.prefaceAnalysisStatus || "") ? prefaceStatusLabel(preview) : "补全分析"}</button>}<button type="button" className={styles.primary} onClick={() => { onUse(preview); closePreview(); }}>立即使用</button></footer></section></div>;
    })()}
  </section>;
}

function buildSettings(targetBrief: string): PromptFissionSettings {
  return { intensity: "deep", goal: "what_next", primaryDirection: "anomaly_event", secondaryDirection: "suspense_ending", outputLanguage: "follow_source", dialogueLanguage: "follow_output", narrationLanguage: "follow_output", onScreenTextLanguage: "none", promptLanguage: "zh-CN", mechanism: "relationship_reversal", targetGenre: "wealthy_runaway", targetRelationship: "pregnant_runaway", targetConflict: "danger_escape", targetBrief: targetBrief || "将母版叙事机制迁移到新的目标剧情", plotSlots: ["施恩者", "被保护者", "危险", "异常动作", "未完成动作"], handoffMethod: "action_action", conflictFreedom: "bold" };
}

function persistJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Generation remains usable when browser storage is unavailable. */ }
}

function removeStoredCreativeResults() {
  try {
    ["lumina:preface-creative-candidates", "lumina:preface-rejected-candidates"].forEach((key) => localStorage.removeItem(key));
  } catch { /* Browsing can continue when storage is unavailable. */ }
}

function generationFailure(reason: unknown, fallback: string) {
  if (reason instanceof TypeError && /failed to fetch/i.test(reason.message)) return "无法连接创意生成服务，请确认工作台服务正在运行后重试。已生成和已收藏内容不会丢失。";
  return reason instanceof Error ? reason.message : fallback;
}

export default function PrefaceCreativeWorkspace({ mode, onModeChange, onNotify, initialReplicationTemplateId = "", prefaceFavorites = [], onPrefaceFavoritesChange, resumeFavorite, onResumeFavoriteConsumed }: Props) {
  const [input, setInput] = useState<PrefaceCreativeInput>(defaults);
  const [ideas, setIdeas] = useState<PrefaceCreativeIdea[]>(() => {
    if (typeof window === "undefined") return [];
    try { return parseCreativeIdeas(JSON.parse(localStorage.getItem("lumina:preface-creative-ideas") || "[]")); } catch { return []; }
  });
  const [candidates, setCandidates] = useState<PrefaceCreativeCandidate[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(localStorage.getItem("lumina:preface-creative-candidates") || "[]");
      const restored = restoreCreativeCandidates(stored);
      if (!Array.isArray(stored) || restored.length !== stored.length) persistJson("lumina:preface-creative-candidates", restored);
      return restored;
    } catch { return []; }
  });
  const [assets, setAssets] = useState<MaterialLibraryAsset[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [replicationBrief, setReplicationBrief] = useState("");
  const [replicationSupplement, setReplicationSupplement] = useState("");
  const [targetId, setTargetId] = useState("");
  const [replicatePlan, setReplicatePlan] = useState<PromptFissionPlan | null>(null);
  const [matchPlan, setMatchPlan] = useState<MaterialAdaptationPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recommendedTags, setRecommendedTags] = useState<CreativeTag[]>([]);
  const [tagBusy, setTagBusy] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ completed: 0, total: 24, stage: "" });
  const [activeActionKeys, setActiveActionKeys] = useState<string[]>([]);
  const [batchScriptProgress, setBatchScriptProgress] = useState({ completed: 0, total: 0, failed: 0 });
  const [batchScriptFailures, setBatchScriptFailures] = useState<Array<{ candidateId: string; title: string; stage: "script" | "storyboard"; message: string }>>([]);
  const [storyboardLanguage, setStoryboardLanguage] = useState<"英语" | "葡萄牙语" | "西班牙语">("英语");
  const [storyboardVariants, setStoryboardVariants] = useState<Record<string, string>>({});
  const [planningRevision, setPlanningRevision] = useState(0);
  const [resumeCandidateId, setResumeCandidateId] = useState("");
  const generationAbortRef = useRef<AbortController | null>(null);
  const generationAbortReasonRef = useRef<"task-change" | null>(null);
  const ideasRef = useRef(ideas);
  const activeActionKeysRef = useRef(new Set<string>());

  const beginAction = (key: string) => {
    if (activeActionKeysRef.current.has(key)) return false;
    const next = new Set(activeActionKeysRef.current);
    next.add(key);
    activeActionKeysRef.current = next;
    setActiveActionKeys([...next]);
    return true;
  };
  const endAction = (key: string) => {
    if (!activeActionKeysRef.current.has(key)) return;
    const next = new Set(activeActionKeysRef.current);
    next.delete(key);
    activeActionKeysRef.current = next;
    setActiveActionKeys([...next]);
  };
  const resetActions = () => {
    activeActionKeysRef.current = new Set();
    setActiveActionKeys([]);
  };

  useEffect(() => { ideasRef.current = ideas; }, [ideas]);
  useEffect(() => {
    if (!resumeFavorite) return;
    const timer = window.setTimeout(() => {
      setInput(resumeFavorite.input as PrefaceCreativeInput);
      setCandidates([resumeFavorite.candidate]);
      persistJson("lumina:preface-creative-candidates", [resumeFavorite.candidate]);
      setResumeCandidateId(resumeFavorite.candidate.id);
      setPlanningRevision((current) => current + 1);
      setError("");
      onResumeFavoriteConsumed?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [onResumeFavoriteConsumed, resumeFavorite]);

  useEffect(() => { void listMaterialLibraryAssets(undefined).then((items) => { const prefaces = items.filter((item) => item.kind === "ai_preface"); setAssets(prefaces); setTemplateId((current) => current || (initialReplicationTemplateId && prefaces.some((item) => item.id === initialReplicationTemplateId) ? initialReplicationTemplateId : "")); setTargetId((current) => current || prefaces[1]?.id || prefaces[0]?.id || ""); }).catch(() => undefined); }, [initialReplicationTemplateId]);
  useEffect(() => {
    if (!initialReplicationTemplateId || !assets.some((item) => item.id === initialReplicationTemplateId)) return;
    const timer = window.setTimeout(() => {
      setTemplateId(initialReplicationTemplateId);
      setReplicatePlan(null);
      setError("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [assets, initialReplicationTemplateId]);
  const template = useMemo(() => assets.find((item) => item.id === templateId), [assets, templateId]);
  const target = useMemo(() => assets.find((item) => item.id === targetId), [assets, targetId]);
  const updatePlanningInput = (next: PrefaceCreativeInput) => {
    const taskChanged = hasCreativeTaskChanged(input, next);
    const hookChanged = hasHookStrategyChanged(input, next);
    if (!taskChanged && !hookChanged) { setInput(next); return; }
    generationAbortReasonRef.current = "task-change";
    generationAbortRef.current?.abort();
    if (taskChanged) setRecommendedTags([]);
    setCandidates([]);
    resetActions();
    setBatchScriptProgress({ completed: 0, total: 0, failed: 0 });
    setBatchScriptFailures([]);
    setGenerationProgress({ completed: 0, total: 24, stage: taskChanged ? "创作任务已更新，请重新匹配内容标签。" : "钩子方向已更新，请重新生成创意候选。" });
    removeStoredCreativeResults();
    setPlanningRevision((current) => current + 1);
    setError("");
    setInput(taskChanged ? { ...next, analysis: undefined, conflictUnits: undefined, hookStrategyPlan: undefined, aiRecommendedTags: [], lockedTags: [], excludedTags: [], hookFamily: "", hookType: "", hookFormat: "" } : next);
  };

  const recommendTags = async () => {
    setTagBusy(true); setError("");
    try {
      const response = await fetch("/api/preface-creative/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }), signal: AbortSignal.timeout(35_000) });
      const payload = await response.json() as { tags?: unknown[]; conflictUnits?: unknown; message?: string };
      if (!response.ok) throw new Error(payload.message || "AI内容标签匹配失败");
      setRecommendedTags(parseAiTagRecommendations(payload.tags, input));
      setInput((current) => ({ ...current, conflictUnits: parseConflictUnits(payload.conflictUnits) }));
    } catch (reason) {
      const failure = reason instanceof DOMException && reason.name === "TimeoutError" ? new Error("AI标签匹配超时，请重试或更换模型") : reason;
      setError(failure instanceof Error ? failure.message : "AI内容标签匹配失败"); throw failure;
    }
    finally { setTagBusy(false); }
  };

  const generateIdeas = () => new Promise<void>((resolve, reject) => {
    generationAbortRef.current?.abort();
    generationAbortReasonRef.current = null;
    const abortController = new AbortController();
    generationAbortRef.current = abortController;
    setBusy(true); setError(""); setGenerationProgress({ completed: 0, total: 24, stage: "正在连接创意生成服务…" });
    let firstBatchReceived = false;
    let streamStarted = false;
    let settled = false;
    const settle = (callback: () => void) => { if (!settled) { settled = true; callback(); } };
    const applyCandidates = (rawCandidates: unknown) => {
      const incoming = parseCreativeCandidates(rawCandidates);
      setCandidates((current) => {
        const next = mergeCreativeCandidates(current, incoming, 60);
        persistJson("lumina:preface-creative-candidates", next);
        return next;
      });
    };
    const consume = async () => {
      try {
        const response = await fetch("/api/preface-creative/plan", { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify({ input, existingCandidates: candidates }), signal: abortController.signal });
        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => ({})) as { message?: string };
          throw new Error(payload.message || "前贴创意生成失败");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const consumeEvent = (block: string) => {
          const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
          const data = block.match(/^data:\s*(.+)$/m)?.[1]?.trim();
          if (!event || !data) return;
          const payload = JSON.parse(data) as { candidates?: unknown; completed?: number; total?: number; stage?: string; message?: string };
          if (event === "progress") {
            streamStarted = true;
            setGenerationProgress((current) => ({ completed: payload.completed ?? current.completed, total: payload.total ?? current.total, stage: payload.stage || current.stage }));
            // Move to the candidate stage as soon as the server confirms the
            // job started; complete cards continue to arrive in later batches.
            settle(resolve);
          }
          if (event === "batch" || event === "done") {
            applyCandidates(payload.candidates);
            setGenerationProgress((current) => ({ completed: payload.completed ?? (Array.isArray(payload.candidates) ? payload.candidates.length : current.completed), total: payload.total ?? current.total, stage: payload.stage || (event === "done" ? "候选池已生成。" : current.stage) }));
            if (!firstBatchReceived) { firstBatchReceived = true; settle(resolve); }
            if (event === "done") onNotify?.(`已生成 ${payload.completed ?? 0} 条前贴创意候选`);
          }
          if (event === "warning") {
            setGenerationProgress((current) => ({ ...current, completed: payload.completed ?? current.completed, total: payload.total ?? current.total, stage: payload.stage || current.stage }));
          }
          if (event === "error") throw new Error(payload.message || "前贴创意生成失败");
        };
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) { consumeEvent(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); boundary = buffer.indexOf("\n\n"); }
          if (done) break;
        }
        if (!streamStarted && !firstBatchReceived) throw new Error("模型未返回可用的前贴候选");
      } catch (reason) {
        const cancelled = reason instanceof DOMException && reason.name === "AbortError";
        const taskChanged = cancelled && generationAbortReasonRef.current === "task-change";
        const message = taskChanged ? "" : cancelled ? "已停止补充候选，已生成的内容仍可继续使用。" : reason instanceof Error ? reason.message : "前贴创意生成失败";
        if (message) setError(message);
        if (!streamStarted && !firstBatchReceived) settle(() => reject(new Error(message)));
      } finally {
        if (generationAbortRef.current === abortController) { generationAbortRef.current = null; generationAbortReasonRef.current = null; }
        setBusy(false);
      }
    };
    void consume();
  });
  const stopGeneration = () => generationAbortRef.current?.abort();
  const updateCandidateLocks = (candidateId: string, locks: PrefaceCandidateLocks) => {
    setCandidates((current) => {
      const next = current.map((candidate) => candidate.id === candidateId ? { ...candidate, locks } : candidate);
      persistJson("lumina:preface-creative-candidates", next);
      return next;
    });
  };
  const generateCandidateBranches = async (candidate: PrefaceCreativeCandidate, branchSpecs?: PrefaceBranchSpec[]) => {
    const actionKey = `branch:${candidate.id}`;
    if (!beginAction(actionKey)) throw new Error("该候选的变体正在生成，请等待当前任务完成。");
    setError("");
    try {
      const response = await fetch("/api/preface-creative/branches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidate, locks: candidate.locks, input, branchSpecs }) });
      const payload = await response.json() as { candidates?: unknown; message?: string };
      if (!response.ok) throw new Error(payload.message || "创意分支生成失败");
      const branches = parseCreativeCandidates(payload.candidates);
      onNotify?.(`已生成 ${branches.length} 个创意分支`);
      return branches;
    } catch (reason) { const message = generationFailure(reason, "创意分支生成失败"); setError(message); onNotify?.(message); throw new Error(message); }
    finally { endAction(actionKey); }
  };
  const commitIdeas = (update: (current: PrefaceCreativeIdea[]) => PrefaceCreativeIdea[]) => {
    const next = update(ideasRef.current);
    ideasRef.current = next;
    setIdeas(next);
    persistJson("lumina:preface-creative-ideas", next);
    return next;
  };
  const requestCandidateScript = async (candidate: PrefaceCreativeCandidate, origin: PrefaceGenerationOrigin = "single") => {
    const response = await fetch("/api/preface-creative/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidate, locks: candidate.locks, input }) });
    const payload = await response.json() as { idea?: unknown; message?: string };
    if (!response.ok) throw new Error(payload.message || "完整脚本生成失败");
    const parsedIdea = parseCreativeIdeas([payload.idea])[0];
    if (!parsedIdea) throw new Error("模型没有返回可用的完整脚本");
    const idea = createPrefaceIdeaRecord(parsedIdea, candidate.id, input, ideasRef.current, origin);
    commitIdeas((current) => [idea, ...current]);
    try { return await requestCandidateStoryboard(idea); }
    catch (reason) {
      const incomplete = { ...idea, storyboardError: reason instanceof Error ? reason.message : "分镜脚本生成失败" };
      commitIdeas((current) => current.map((item) => item.id === incomplete.id ? incomplete : item));
      return incomplete;
    }
  };
  const requestCandidateStoryboard = async (idea: PrefaceCreativeIdea, dialogueLanguage = "英语") => {
    const response = await fetch("/api/preface-creative/storyboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea, input, dialogueLanguage }) });
    const payload = await response.json() as { storyboardScript?: unknown; message?: string };
    if (!response.ok || !String(payload.storyboardScript || "").trim()) throw new Error(payload.message || "模型没有返回可用的分镜脚本");
    const completed = { ...idea, storyboardScript: String(payload.storyboardScript), storyboardError: "" };
    commitIdeas((current) => current.map((item) => item.id === completed.id ? completed : item));
    return completed;
  };
  const generateCandidateScript = async (candidate: PrefaceCreativeCandidate) => {
    const actionKey = `script:${candidate.id}`;
    if (!beginAction(actionKey)) throw new Error("该候选的脚本与分镜正在生成，请等待当前任务完成。");
    setError("");
    try {
      const idea = await requestCandidateScript(candidate);
      onNotify?.(idea.storyboardScript ? "前贴脚本与分镜脚本已生成" : "前贴脚本已生成；分镜可单独重试");
      return idea;
    } catch (reason) { const message = generationFailure(reason, "完整脚本生成失败"); setError(message); throw new Error(message); }
    finally { endAction(actionKey); }
  };
  const generateCandidateScripts = async (selectedCandidates: PrefaceCreativeCandidate[]) => {
    const queue = selectedCandidates.slice(0, 10);
    const ideas: PrefaceCreativeIdea[] = [];
    const failedIds: string[] = [];
    const failures: Array<{ candidateId: string; title: string; stage: "script" | "storyboard"; message: string }> = [];
    const actionKey = "script-batch";
    if (!beginAction(actionKey)) throw new Error("批量脚本任务正在生成，请等待当前任务完成。");
    setError(""); setBatchScriptProgress({ completed: 0, total: queue.length, failed: 0 });
    setBatchScriptFailures([]);
    try {
      let completed = 0;
      await runPrefaceBatch(queue, 2, (candidate) => requestCandidateScript(candidate, "batch"), (entry) => {
          const candidate = queue[entry.index];
          if (entry.status === "fulfilled") {
            ideas.push(entry.value);
            if (!entry.value.storyboardScript) failures.push({ candidateId: candidate.id, title: candidate.title, stage: "storyboard", message: entry.value.storyboardError || "分镜脚本生成失败" });
          } else {
            failedIds.push(candidate.id);
            failures.push({ candidateId: candidate.id, title: candidate.title, stage: "script", message: generationFailure(entry.reason, "完整脚本生成失败") });
          }
          completed += 1;
          setBatchScriptFailures([...failures]);
          setBatchScriptProgress({ completed, total: queue.length, failed: failures.length });
      });
      const completeCount = ideas.filter((idea) => idea.storyboardScript).length;
      if (ideas.length) onNotify?.(`已生成 ${ideas.length}/${queue.length} 条脚本，其中 ${completeCount} 条含完整分镜`);
      if (failures.length) setError(`${failures.length} 项生成未完成，请在脚本记录中查看原因并重试。`);
      return { ideas, failedIds, failures };
    } finally { endAction(actionKey); }
  };
  const generateCandidateStoryboard = async (idea: PrefaceCreativeIdea) => {
    const actionKey = `storyboard:${idea.id}`;
    if (!beginAction(actionKey)) throw new Error("该记录的分镜正在生成，请等待当前任务完成。");
    setError("");
    try {
      const completed = await requestCandidateStoryboard(idea);
      onNotify?.("分镜脚本已生成");
      return completed;
    } catch (reason) { const message = generationFailure(reason, "分镜脚本生成失败"); setError(message); throw new Error(message); }
    finally { endAction(actionKey); }
  };
  const switchStoryboardLanguage = async (idea: PrefaceCreativeIdea, language: "英语" | "葡萄牙语" | "西班牙语") => {
    setStoryboardLanguage(language);
    const key = `${idea.id}:${language}`;
    if (storyboardVariants[key]) return;
    const actionKey = `storyboard-language:${idea.id}:${language}`;
    if (!beginAction(actionKey)) return;
    setError("");
    try {
      const localized = await requestCandidateStoryboard(idea, language);
      setStoryboardVariants((current) => ({ ...current, [key]: localized.storyboardScript || "" }));
    } catch (reason) { setError(generationFailure(reason, "分镜对白切换失败")); }
    finally { endAction(actionKey); }
  };
  const saveIdea = async (idea: PrefaceCreativeIdea) => {
    setError("");
    try {
      const saved = await saveCreativePrefaceTemplate({ ...idea });
      const nextAssets = await listMaterialLibraryAssets("ai_preface");
      setAssets(nextAssets); setTemplateId(saved.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存到 AI 前贴库失败"); throw reason; }
  };
  const sendIdeaToReplicate = async (idea: PrefaceCreativeIdea) => {
    await saveIdea(idea);
    setReplicationBrief("");
    setReplicatePlan(null);
    onModeChange("replicate"); onNotify?.("已保存母版，并将抽象叙事机制带入迭代复刻");
  };
  const togglePrefaceFavorite = (candidate: PrefaceCreativeCandidate) => {
    const exists = prefaceFavorites.some((item) => item.id === candidate.id);
    const next = exists ? prefaceFavorites.filter((item) => item.id !== candidate.id) : [createPrefaceCreativeFavorite(candidate, input), ...prefaceFavorites];
    onPrefaceFavoritesChange?.(next);
    onNotify?.(exists ? "已取消收藏" : "已收藏前贴创意，并同步至「我的创作」");
  };
  const generateReplication = async () => {
    if (!template) { setError("请先选择一个 AI 前贴母版"); return; }
    setBusy(true); setError("");
    try { const mechanisms = template.hitReasons.map((item) => String(item.reason || item.label || "").trim()).filter(Boolean).slice(0, 5); const brief = [replicationBrief.trim(), replicationSupplement.trim() ? `补充要求：${replicationSupplement.trim()}` : ""].filter(Boolean).join("\n"); const settings = buildSettings(replicationBrief); settings.targetBrief = brief || settings.targetBrief; setReplicatePlan(await createPromptFission(template.id, mechanisms.length ? mechanisms : ["保留母版的动作因果与结尾反转机制"], [], settings)); onNotify?.("已生成复刻创意候选"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "前贴迭代复刻失败"); }
    finally { setBusy(false); }
  };
  const generateMatch = async () => {
    if (!template || !target || template.id === target.id) { setError("请选择不同的模板前贴和目标前贴资产"); return; }
    setBusy(true); setError("");
    try { setMatchPlan(await createMaterialAdaptation(template.id, target.id, "ai_preface", { source: "preface-creative-center" })); onNotify?.("已完成前贴精准匹配分析"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "前贴精准匹配失败"); }
    finally { setBusy(false); }
  };

  return <section className={styles.workspace} aria-label="AI前贴创意">
    {error && <div className={styles.error} role="alert"><b>本次操作未完成</b><span>{error}</span></div>}
    {mode === "planning" && <PrefacePlanningWorkflow input={input} ideas={ideas.filter((idea) => !idea.taskKey || idea.taskKey === prefaceTaskKey(input))} candidates={candidates} recommendedTags={recommendedTags} busy={busy} activeActionKeys={activeActionKeys} batchScriptProgress={batchScriptProgress} batchScriptFailures={batchScriptFailures} favoriteIds={prefaceFavorites.map((item) => item.id)} resumeCandidateId={resumeCandidateId} tagBusy={tagBusy} generationProgress={generationProgress} planningRevision={planningRevision} storyboardLanguage={storyboardLanguage} storyboardVariants={storyboardVariants} onStoryboardLanguageChange={switchStoryboardLanguage} onInput={updatePlanningInput} onRecommendTags={recommendTags} onGenerate={generateIdeas} onStopGeneration={stopGeneration} onUpdateCandidateLocks={updateCandidateLocks} onGenerateBranches={generateCandidateBranches} onGenerateScript={generateCandidateScript} onGenerateScripts={generateCandidateScripts} onGenerateStoryboard={generateCandidateStoryboard} onToggleFavorite={togglePrefaceFavorite} onSave={saveIdea} onReplicate={sendIdeaToReplicate} onNotify={onNotify} />}
    {mode === "replicate" && <div className={styles.replicationWorkspace}>
      {!template && <ReplicationLibrary assets={assets} onUse={(asset) => { setTemplateId(asset.id); setReplicatePlan(null); setReplicationBrief(""); setReplicationSupplement(""); setError(""); }} onReloadAssets={async () => { const next = await listMaterialLibraryAssets("ai_preface"); setAssets(next); return next; }} />}
      {template && !replicatePlan && <section className={styles.replicationInput}><header className={styles.replicationSelected}><div><span className={styles.eyebrow}>STEP 2 · NEW STORY</span><h2>输入新的剧情简介</h2><p>系统会保留母版的观看承诺和动作因果，再结合你的新剧情生成复刻创意。</p></div><button type="button" className={styles.secondaryButton} onClick={() => setTemplateId("")}>重新选择母版</button></header><div className={styles.selectedTemplate}><span>当前母版</span><strong>{template.title}</strong><small>{template.genres.join("、") || "AI前贴"} · {Math.max(1, Math.round(template.clipEnd - template.clipStart))} 秒</small></div><button type="button" className={styles.secondaryButton} onClick={() => { const history = template.promptBlueprint.fissionVersions as PromptFissionPlan[] | undefined; const latest = history?.filter((plan) => plan.variants?.length).at(-1); if (!latest) { onNotify?.("暂无已保存候选，请先生成"); return; } setReplicationBrief(latest.settings?.targetBrief || ""); setReplicatePlan(latest); }}>恢复最近一次候选与脚本</button><label className={styles.longField}><span>新剧情简介 <em>*</em></span><textarea className={styles.synopsisField} value={replicationBrief} onChange={(event) => { setReplicationBrief(event.target.value); setReplicatePlan(null); }} placeholder="输入新的剧情简介、人物关系和主要冲突" /><small>必填。人物名称会沿用你提供的简介，不会自动翻译。</small></label><label className={styles.longField}><span>补充要求（可选）</span><textarea className={styles.synopsisField} value={replicationSupplement} onChange={(event) => { setReplicationSupplement(event.target.value); setReplicatePlan(null); }} placeholder="例如：突出身份反转；避免屏幕文字；对白使用英语" /></label><label className={styles.modelSelect}><span>生成模型</span><select value={input.modelProvider} onChange={(event) => setInput((current) => ({ ...current, modelProvider: event.target.value }))}><option value="qwen">Qwen</option><option value="gemini">Gemini</option><option value="deepseek">DeepSeek</option><option value="doubao">豆包</option></select><small>模型只影响本次复刻生成，不会修改前贴创意策划任务。</small></label><div className={styles.stageFooter}><span>母版机制由AI自动提取，用户无需配置故事引擎。</span><button className={styles.primary} disabled={busy || !replicationBrief.trim()} onClick={() => void generateReplication()}>{busy ? "正在生成复刻创意…" : "结合母版生成前贴创意"}</button></div></section>}
      {template && replicatePlan && <section className={styles.replicationResults}><header className={styles.resultHeading}><div><span>STEP 3 · CREATIVE OPTIONS</span><h2>复刻创意候选</h2><p>每条候选都结合了新剧情，并保留母版的有效行动机制。</p></div><button type="button" className={styles.secondaryButton} onClick={() => setReplicatePlan(null)}>修改剧情简介</button></header><div className={styles.replicationDirectionTabs}><span>稳定复刻</span><span>场景迁移</span><span>创意升级</span><small>{replicatePlan.variants.length} 条候选</small></div><p role="status">已生成 {replicatePlan.variants.length} 条有效方案，目标 15 条。</p>{!!replicatePlan.failures?.length && <details open><summary>生成提示（不影响预览）</summary><ul>{replicatePlan.failures.map((failure, index) => <li key={index}>{failure}</li>)}</ul></details>}{replicatePlan.rawResult && <details><summary>查看模型原始生成内容（可复制）</summary><pre style={{ whiteSpace: "pre-wrap" }}>{replicatePlan.rawResult}</pre></details>}<ReplicationResults key={replicatePlan.id} plan={replicatePlan} brief={replicatePlan.settings.targetBrief || [replicationBrief, replicationSupplement].filter(Boolean).join("\n")} provider={input.modelProvider} onNotify={onNotify} /></section>}
    </div>}
    {mode === "matching" && <div className={styles.layout}><aside className={styles.controlPanel}><div className={styles.panelHeading}><span>PRECISION MATCH</span><h2>前贴精准匹配</h2><p>把前贴模板与另一条目标资产逐项对照，输出可用性和接片方案。</p></div><label className={styles.field}><span>前贴模板</span><select value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">请选择</option>{assets.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className={styles.field}><span>目标资产</span><select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">请选择</option>{assets.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><div className={styles.rules}><b>匹配维度</b><span>人物关系 · 世界观 · 观看承诺 · 事件可行性 · 正片接入点</span></div><button className={styles.primary} disabled={busy || !template || !target} onClick={() => void generateMatch()}>{busy ? "正在逐项匹配…" : "开始精准匹配"}</button></aside><main className={styles.results}>{!matchPlan && <div className={styles.empty}><strong>等待目标素材</strong><span>选择模板和目标资产后，系统会判断直接使用、轻度改写、重新复刻或不建议匹配。</span></div>}{matchPlan && <><div className={styles.matchScore}><span>兼容度</span><strong>{matchPlan.compatibility.score}/100</strong><em>{matchPlan.compatibility.level}</em><p>{matchPlan.compatibility.reasons.join("；")}</p></div><div className={styles.mapping}>{matchPlan.targetMapping.map((item) => <article key={`${item.templateMechanism}-${item.targetEvidence}`}><b>{item.templateMechanism}</b><span>→</span><p>{item.targetEvidence}<small>{item.transformation} · {item.targetTimecode}</small></p></article>)}</div><div className={styles.handoff}><b>正片接入</b><span>{matchPlan.transitionPlan.targetEntry}</span><p>{matchPlan.transitionPlan.bridgeAction}；{matchPlan.transitionPlan.bridgeVisual}；{matchPlan.transitionPlan.bridgeAudio}</p></div></>}</main></div>}
  </section>;
}
