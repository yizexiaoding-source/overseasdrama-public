"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { baseTagGroups, buildConflictUnits, buildUserSelectedCreativeTags, characterSettingTagGroups, genreOptions, genreOptionsForCategory, hookAxisOptions, hookEndingOptions, hookRecipeOptions, recommendHookPairs, relationshipTagGroups, scoreWeights, worldViewTagGroups, type CreativeTag, type CreativeTagState, type HookPairOption } from "../../lib/preface-creative-catalog";
import type { PrefaceBranchSpec, PrefaceCandidateLocks, PrefaceCreativeCandidate, PrefaceCreativeIdea, PrefaceCreativeInput, PrefaceCreativeLane, PrefaceHookSelection, PrefaceHookStrategyPlan } from "../../lib/preface-creative-domain";
import styles from "./PrefaceCreativeWorkspace.module.css";

const steps = ["一、创作任务", "二、内容标签", "三、钩子策略", "四、创意候选", "五、脚本与分镜"] as const;
const stateLabels: Record<CreativeTagState, string> = { recommended: "系统推荐", locked: "用户锁定", excluded: "用户排除" };
const stateOrder: CreativeTagState[] = ["recommended", "locked", "excluded"];
const modelOptions = [
  { value: "qwen", label: "通义千问" },
  { value: "gemini", label: "Gemini" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "doubao", label: "豆包" },
] as const;
const laneLabels: Record<PrefaceCreativeLane, string> = { anchored: "原剧情放大", migrated: "横向迁移", wild: "想象突破" };
const lockLabels: Array<[keyof PrefaceCandidateLocks, string]> = [["audiencePromise", "观看承诺"], ["hookMechanism", "主钩子机制"], ["relationshipPattern", "人物关系结构"], ["emotion", "情绪方向"], ["openingVisual", "首屏视觉机制"], ["worldRules", "世界规则"], ["endingQuestion", "结尾悬念类型"]];
const hookAxisLabels = ["人物关系钩子", "情绪钩子", "情节事件钩子", "身份权力钩子", "信息悬念钩子"];
function storedIds(key: string) {
  if (typeof window === "undefined") return [];
  try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value.map(String) : []; } catch { return []; }
}

type Props = {
  input: PrefaceCreativeInput;
  ideas: PrefaceCreativeIdea[];
  candidates: PrefaceCreativeCandidate[];
  recommendedTags: CreativeTag[];
  busy: boolean;
  activeActionKeys: string[];
  batchScriptProgress: { completed: number; total: number; failed: number };
  batchScriptFailures: Array<{ candidateId: string; title: string; stage: "script" | "storyboard"; message: string }>;
  favoriteIds: string[];
  resumeCandidateId: string;
  tagBusy: boolean;
  generationProgress: { completed: number; total: number; stage: string };
  planningRevision: number;
  storyboardLanguage: "英语" | "葡萄牙语" | "西班牙语";
  storyboardVariants: Record<string, string>;
  onStoryboardLanguageChange: (idea: PrefaceCreativeIdea, language: "英语" | "葡萄牙语" | "西班牙语") => Promise<void>;
  onInput: (next: PrefaceCreativeInput) => void;
  onRecommendTags: () => Promise<void>;
  onGenerate: () => Promise<void>;
  onStopGeneration: () => void;
  onUpdateCandidateLocks: (candidateId: string, locks: PrefaceCandidateLocks) => void;
  onGenerateBranches: (candidate: PrefaceCreativeCandidate, specs?: PrefaceBranchSpec[]) => Promise<PrefaceCreativeCandidate[]>;
  onGenerateScript: (candidate: PrefaceCreativeCandidate) => Promise<PrefaceCreativeIdea>;
  onGenerateScripts: (candidates: PrefaceCreativeCandidate[]) => Promise<{ ideas: PrefaceCreativeIdea[]; failedIds: string[]; failures: Array<{ candidateId: string; title: string; stage: "script" | "storyboard"; message: string }> }>;
  onGenerateStoryboard: (idea: PrefaceCreativeIdea) => Promise<PrefaceCreativeIdea>;
  onToggleFavorite: (candidate: PrefaceCreativeCandidate) => void;
  onSave: (idea: PrefaceCreativeIdea) => Promise<void>;
  onReplicate: (idea: PrefaceCreativeIdea) => Promise<void>;
  onNotify?: (message: string) => void;
};

export default function PrefacePlanningWorkflow({ input, ideas, candidates, recommendedTags, busy, activeActionKeys, batchScriptProgress, batchScriptFailures, favoriteIds, resumeCandidateId, tagBusy, generationProgress, planningRevision, storyboardLanguage, storyboardVariants, onStoryboardLanguageChange, onInput, onRecommendTags, onGenerate, onStopGeneration, onUpdateCandidateLocks, onGenerateBranches, onGenerateScript, onGenerateScripts, onGenerateStoryboard, onToggleFavorite, onNotify }: Props) {
  const [step, setStep] = useState(0);
  const [tagStates, setTagStates] = useState<Record<string, CreativeTagState>>({});
  const [rejectedIds, setRejectedIds] = useState<string[]>(() => storedIds("lumina:preface-rejected-candidates"));
  const [selectedId, setSelectedId] = useState("");
  const [batchScriptIds, setBatchScriptIds] = useState<string[]>([]);
  const [downloadIdeaIds, setDownloadIdeaIds] = useState<string[]>([]);
  const [laneFilter, setLaneFilter] = useState<"all" | PrefaceCreativeLane>("all");
  const [sortBy, setSortBy] = useState<"ad" | "novelty" | "difficulty">("ad");
  const [showRejected, setShowRejected] = useState(false);
  const [lockCandidateId, setLockCandidateId] = useState("");
  const [activeRelationshipGroup, setActiveRelationshipGroup] = useState(relationshipTagGroups[0].group);
  const [activeCharacterGroup, setActiveCharacterGroup] = useState(characterSettingTagGroups[0].group);
  const [branchSetupCandidate, setBranchSetupCandidate] = useState<PrefaceCreativeCandidate | null>(null);
  const [branchResults, setBranchResults] = useState<PrefaceCreativeCandidate[] | null>(null);
  const [branchSpecs, setBranchSpecs] = useState<PrefaceBranchSpec[]>([
    { direction: "情绪升级", intensity: "明显", preserve: ["主钩子", "人物关系"] },
    { direction: "关系重排", intensity: "明显", preserve: ["主钩子", "核心事件"] },
    { direction: "核心事件替换", intensity: "强烈", preserve: ["观看承诺"] },
  ]);
  const isActionActive = (key: string) => activeActionKeys.includes(key);
  const activeScriptCandidateIds = activeActionKeys.filter((key) => key.startsWith("script:")).map((key) => key.slice("script:".length));
  const activeStoryboardIdeaIds = activeActionKeys.filter((key) => key.startsWith("storyboard:") && !key.startsWith("storyboard-language:")).map((key) => key.slice("storyboard:".length));
  const activeLanguageActions = activeActionKeys.filter((key) => key.startsWith("storyboard-language:"));
  const candidateTitle = (id: string) => candidates.find((item) => item.id === id)?.title || branchResults?.find((item) => item.id === id)?.title || "候选创意";
  const ideaIsGenerating = (idea: PrefaceCreativeIdea) => activeStoryboardIdeaIds.includes(idea.id) || Boolean(idea.sourceCandidateId && activeScriptCandidateIds.includes(idea.sourceCandidateId));
  const hasMountedPlanningRevision = useRef(false);
  useEffect(() => { try { localStorage.setItem("lumina:preface-rejected-candidates", JSON.stringify(rejectedIds)); } catch { /* Browsing can continue when storage is unavailable. */ } }, [rejectedIds]);
  useEffect(() => {
    if (!hasMountedPlanningRevision.current) { hasMountedPlanningRevision.current = true; return; }
    setRejectedIds([]); setBatchScriptIds([]); setDownloadIdeaIds([]); setLockCandidateId(""); setSelectedId("");
  }, [planningRevision]);
  useEffect(() => {
    if (!resumeCandidateId) return;
    const timer = window.setTimeout(() => setStep(3), 0);
    return () => window.clearTimeout(timer);
  }, [resumeCandidateId]);
  const activeIdeaId = selectedId || (step === 4 ? ideas[0]?.id || "" : "");
  const selected = useMemo(() => activeIdeaId ? ideas.find((item) => item.id === activeIdeaId) : undefined, [activeIdeaId, ideas]);
  const candidateGroups = useMemo(() => {
    const eligible = candidates.filter((candidate) => (laneFilter === "all" || candidate.lane === laneFilter) && (showRejected || !rejectedIds.includes(candidate.id)));
    const rank = (a: PrefaceCreativeCandidate, b: PrefaceCreativeCandidate) => sortBy === "novelty" ? b.noveltyScore - a.noveltyScore : sortBy === "difficulty" ? a.productionDifficulty.localeCompare(b.productionDifficulty, "zh-CN") : b.adPotential - a.adPotential;
    const roots = eligible.filter((candidate) => !candidate.parentId).sort(rank);
    const emitted = new Set<string>();
    const grouped = roots.map((candidate) => {
      emitted.add(candidate.id);
      const branches = eligible.filter((item) => item.parentId === candidate.id).sort(rank);
      branches.forEach((item) => emitted.add(item.id));
      return [candidate, ...branches];
    });
    return [...grouped, ...eligible.filter((candidate) => !emitted.has(candidate.id)).sort(rank).map((candidate) => [candidate])];
  }, [candidates, laneFilter, rejectedIds, showRejected, sortBy]);
  const visibleCandidates = useMemo(() => candidateGroups.flat(), [candidateGroups]);
  const batchScriptCandidates = useMemo(() => candidates.filter((candidate) => batchScriptIds.includes(candidate.id)), [candidates, batchScriptIds]);
  const lockCandidate = candidates.find((candidate) => candidate.id === lockCandidateId);
  const genreTagOptions = useMemo(() => genreOptionsForCategory(input.genre), [input.genre]);
  const userSelectedTags = useMemo(() => buildUserSelectedCreativeTags(input), [input]);
  const matchedTags = useMemo(() => [...userSelectedTags, ...recommendedTags], [userSelectedTags, recommendedTags]);
  const conflictUnits = useMemo(() => buildConflictUnits(input), [input]);
  const selectedHooks = input.hookStrategyPlan?.selectedHooks || [];
  const endingMode = input.hookStrategyPlan?.endingMode || "AI自动安排";
  const recommendedHookPairs = useMemo(() => recommendHookPairs(input), [input]);
  const selectedHookPairIds = input.hookStrategyPlan?.selectedPlanIds || (input.hookStrategyPlan?.selectedPlanId ? [input.hookStrategyPlan.selectedPlanId] : [recommendedHookPairs[0].id]);
  const update = (key: keyof PrefaceCreativeInput, value: string | string[]) => onInput({ ...input, [key]: value });
  const updateSynopsis = (value: string) => onInput({ ...input, plotSynopsis: value, targetBrief: value });
  const updateSupplementalRequirements = (value: string) => onInput({ ...input, supplementalRequirements: value });
  const readTextUpload = async (file: File | undefined, field: "plotSynopsis" | "supplementalRequirements") => {
    if (!file) return;
    try {
      const content = (await file.text()).trim();
      if (field === "plotSynopsis") updateSynopsis(content);
      else updateSupplementalRequirements(content);
      onNotify?.(`已读取${field === "plotSynopsis" ? "剧情简介" : "补充要求"}文件：${file.name}`);
    } catch {
      onNotify?.("文件读取失败，请改用文本框粘贴内容。");
    }
  };
  const selectGenre = (genre: string) => onInput({ ...input, genre, genreTags: [], creationSource: "标签策划", creationBasis: "synopsis", analysis: undefined });
  const toggleTaskTag = (key: "genreTags" | "worldViewTags" | "relationshipTags" | "characterSettingTags", label: string) => {
    const current = input[key] || [];
    const next = current.includes(label) ? current.filter((item) => item !== label) : [...current, label];
    if (key === "genreTags") onInput({ ...input, genreTags: next });
    else if (key === "worldViewTags") onInput({ ...input, worldViewTags: next, worldView: next.join("、") });
    else if (key === "relationshipTags") onInput({ ...input, relationshipTags: next, relationship: next.join("、") });
    else onInput({ ...input, characterSettingTags: next });
  };
  const prepareTags = async () => { try { await onRecommendTags(); setStep(1); } catch { /* parent displays the service error */ } };
  const setHandoff = (handoffStrategy: "auto" | "manual" | "none") => update("handoffStrategy", handoffStrategy);
  const confirmTags = () => {
    const locked = [...new Set(matchedTags.filter((item) => item.source === "ai" && tagStates[item.id] === "locked").map((item) => item.label))];
    const excluded = matchedTags.filter((item) => item.source === "ai" && tagStates[item.id] === "excluded").map((item) => item.label);
    const acceptedRecommendations = recommendedTags.filter((item) => tagStates[item.id] !== "excluded").map((item) => item.label);
    const defaultPair = recommendedHookPairs[0];
    const hookStrategyPlan = input.hookStrategyPlan?.selectedPlanId ? input.hookStrategyPlan : {
      conflictUnit: input.hookStrategyPlan?.conflictUnit || conflictUnits[0], primaryHook: { family: defaultPair.hook.family, type: defaultPair.hook.type }, supportingHooks: [], format: defaultPair.endingHook.type,
      selectedHooks: [{ ...defaultPair.hook }], endingMode: defaultPair.endingHook.type, customHook: input.hookStrategyPlan?.customHook || "", selectedPlanId: defaultPair.id,
      selectedPlanIds: [defaultPair.id],
      openingHook: { ...defaultPair.openingHook }, middleEscalation: defaultPair.middleEscalation, endingHook: { ...defaultPair.endingHook },
    };
    onInput({ ...input, lockedTags: locked, excludedTags: excluded, aiRecommendedTags: acceptedRecommendations, hookStrategyPlan, hookFamily: hookStrategyPlan.primaryHook.family, hookType: hookStrategyPlan.primaryHook.type, hookFormat: hookStrategyPlan.format });
    setStep(2);
  };
  const selectHookPair = (option: HookPairOption) => {
    const nextPlanIds = selectedHookPairIds.includes(option.id)
      ? selectedHookPairIds.length > 1 ? selectedHookPairIds.filter((id) => id !== option.id) : selectedHookPairIds
      : [...selectedHookPairIds, option.id].slice(-3);
    const selectedPairs = recommendedHookPairs.filter((item) => nextPlanIds.includes(item.id));
    const primaryPair = selectedPairs[0] || option;
    const hookStrategyPlan: PrefaceHookStrategyPlan = {
      conflictUnit: input.hookStrategyPlan?.conflictUnit || conflictUnits[0], primaryHook: { family: primaryPair.hook.family, type: primaryPair.hook.type }, supportingHooks: selectedPairs.slice(1).map((item) => ({ family: item.hook.family, type: item.hook.type })), format: primaryPair.endingHook.type,
      selectedHooks: selectedPairs.map((item) => ({ ...item.hook })), endingMode: primaryPair.endingHook.type, customHook: input.hookStrategyPlan?.customHook || "", selectedPlanId: primaryPair.id, selectedPlanIds: nextPlanIds,
      openingHook: { ...primaryPair.openingHook }, middleEscalation: primaryPair.middleEscalation, endingHook: { ...primaryPair.endingHook },
    };
    onInput({ ...input, hookStrategyPlan, hookFamily: hookStrategyPlan.primaryHook.family, hookType: hookStrategyPlan.primaryHook.type, hookFormat: hookStrategyPlan.format });
  };
  const writeHookStrategy = (hooks: PrefaceHookSelection[], nextEndingMode = endingMode, customHook = input.hookStrategyPlan?.customHook || "") => {
    if (!hooks.length) {
      onInput({ ...input, hookStrategyPlan: { conflictUnit: input.hookStrategyPlan?.conflictUnit || conflictUnits[0], primaryHook: { family: "AI自动安排", type: "AI自动安排" }, supportingHooks: [], format: nextEndingMode, selectedHooks: [], endingMode: nextEndingMode, customHook }, hookFamily: "", hookType: "", hookFormat: "" });
      return;
    }
    const next: PrefaceHookStrategyPlan = {
      conflictUnit: input.hookStrategyPlan?.conflictUnit || conflictUnits[0],
      primaryHook: { family: hooks[0].family, type: hooks[0].type },
      supportingHooks: hooks.slice(1).map(({ family, type }) => ({ family, type })),
      format: nextEndingMode,
      selectedHooks: hooks,
      endingMode: nextEndingMode,
      customHook,
      selectedPlanId: input.hookStrategyPlan?.selectedPlanId,
      openingHook: input.hookStrategyPlan?.openingHook,
      middleEscalation: input.hookStrategyPlan?.middleEscalation,
      endingHook: input.hookStrategyPlan?.endingHook,
    };
    onInput({ ...input, hookStrategyPlan: next, hookFamily: next.primaryHook.family, hookType: next.primaryHook.type, hookFormat: next.format });
  };
  const toggleHookDirection = (hook: PrefaceHookSelection) => {
    const exists = selectedHooks.some((item) => item.id === hook.id);
    if (!exists && selectedHooks.length >= 3) return;
    writeHookStrategy(exists ? selectedHooks.filter((item) => item.id !== hook.id) : [...selectedHooks, hook]);
  };
  const openBranchWorkbench = (candidate: PrefaceCreativeCandidate) => setBranchSetupCandidate(candidate);
  const updateBranchSpec = (index: number, patch: Partial<PrefaceBranchSpec>) => setBranchSpecs((current) => current.map((spec, itemIndex) => itemIndex === index ? { ...spec, ...patch } : spec));
  const generateBranchesFromWorkbench = async () => {
    if (!branchSetupCandidate) return;
    try { const results = await onGenerateBranches(branchSetupCandidate, branchSpecs); setBranchResults(results); setBranchSetupCandidate(null); } catch { /* parent displays the service error and keeps the setup for retry */ }
  };
  const generate = async () => { try { await onGenerate(); setStep(3); } catch { /* parent displays the service error */ } };
  const toggle = (id: string, values: string[], setter: (value: string[]) => void) => setter(values.includes(id) ? values.filter((item) => item !== id) : [...values, id]);
  const toggleDownloadIdea = (id: string) => setDownloadIdeaIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleBatchScript = (id: string) => setBatchScriptIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 10 ? [...current, id] : current);
  const expandCandidate = async (candidate: PrefaceCreativeCandidate) => { setSelectedId(candidate.id); setStep(4); try { const idea = await onGenerateScript(candidate); setSelectedId(idea.id); } catch { /* parent displays error */ } };
  const expandBatchScripts = async () => {
    if (!batchScriptCandidates.length) return;
    setStep(4);
    setSelectedId("");
    try {
      const result = await onGenerateScripts(batchScriptCandidates);
      if (result.ideas[0]) setSelectedId(result.ideas[0].id);
      setBatchScriptIds(result.failedIds);
    } catch { /* parent displays the service error */ }
  };
  const downloadWord = (filename: string, records: PrefaceCreativeIdea[]) => {
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br />");
    const html = records.map((idea) => `<h1>${escape(idea.title)}</h1><h2>创意脚本</h2><p>${escape(idea.script)}</p><h2>分镜脚本</h2><pre>${escape(idea.storyboardScript || idea.storyboardError || "尚未生成")}</pre>`).join("<hr />");
    const url = URL.createObjectURL(new Blob([`\uFEFF<html><meta charset=\"utf-8\"><body>${html}</body></html>`], { type: "application/msword" }));
    const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  };
  const copyText = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); onNotify?.(`${label}已复制`); } catch { onNotify?.("复制失败，请检查浏览器剪贴板权限"); }
  };

  return <div className={styles.planningShell}>
    <nav className={styles.stepper} aria-label="前贴创意策划步骤">
      {steps.map((label, index) => <button key={label} className={index === step ? styles.stepActive : index < step ? styles.stepDone : ""} onClick={() => setStep(index)}><b>{index < step ? "✓" : index + 1}</b><span>{label}</span></button>)}
    </nav>

    {step === 0 && <section className={styles.stage}>
      <header className={styles.stageHeader}><div><span>第一步 · 创作边界</span><h2>先提交剧情，再分层选择故事标签</h2><p>先上传或粘贴剧情简介，再选择题材与世界观；人物关系和人物设定均可留空，由AI继续匹配。</p></div><span className={styles.autoBadge}>剧情事实 · AI补充匹配</span></header>
      <div className={styles.taskSection}><b>剧情简介 <em>*</em><small>先上传文件，也可直接粘贴或编辑</small></b><label className={styles.uploadField}><span>上传剧情简介</span><input type="file" accept=".txt,.md,.json" onChange={(event) => void readTextUpload(event.target.files?.[0], "plotSynopsis")} /></label><textarea className={`${styles.synopsisField} resize-none`} style={{ resize: "none" }} value={input.plotSynopsis || input.targetBrief || ""} placeholder="请先填写主要人物、关系、背景和正在发生的核心事件。" onChange={(event) => updateSynopsis(event.target.value)} /><small className={styles.fieldHint}>剧情简介用于提供故事事实，上传后仍可编辑。</small></div>
      <div className={styles.taskSection}><b>选择题材类型 <em>*</em><small>先选一级分类，再选至少一个二级题材标签</small></b><div className={styles.hierarchySelector}><div className={styles.categoryRail}>{genreOptions.map((genre) => <button type="button" key={genre} aria-pressed={input.genre === genre} className={input.genre === genre ? styles.categoryActive : ""} onClick={() => selectGenre(genre)}>{genre}</button>)}</div><div className={styles.secondaryPanel}>{!input.genre ? <p className={styles.selectionHint}>请选择题材一级分类。</p> : <><strong>{input.genre} · 二级标签</strong><div className={styles.choiceChips}>{genreTagOptions.map((genre) => <button type="button" key={genre} aria-pressed={(input.genreTags || []).includes(genre)} className={(input.genreTags || []).includes(genre) ? styles.choiceSelected : ""} onClick={() => toggleTaskTag("genreTags", genre)}>{genre}</button>)}</div></>}</div></div></div>
      <div className={styles.taskSection}><b>人物关系（可选） <small>独立标签体系；可跨一级分类多选</small></b><div className={styles.hierarchySelector}><div className={styles.categoryRail}>{relationshipTagGroups.map((item) => <button type="button" key={item.group} aria-pressed={activeRelationshipGroup === item.group} className={activeRelationshipGroup === item.group ? styles.categoryActive : ""} onClick={() => setActiveRelationshipGroup(item.group)}>{item.group}</button>)}</div><div className={styles.secondaryPanel}><strong>{activeRelationshipGroup} · 二级标签</strong><div className={styles.choiceChips}>{(relationshipTagGroups.find((item) => item.group === activeRelationshipGroup)?.tags || []).map((relationship) => <button type="button" key={relationship} aria-pressed={(input.relationshipTags || []).includes(relationship)} className={(input.relationshipTags || []).includes(relationship) ? styles.choiceSelected : ""} onClick={() => toggleTaskTag("relationshipTags", relationship)}>{relationship}</button>)}</div></div></div></div>
      <div className={styles.taskSection}><b>选择世界观 <em>*</em><small>选择一级分类后，可多选具体标签</small></b><div className={styles.hierarchySelector}><div className={styles.categoryRail}>{worldViewTagGroups.map((item) => <button type="button" key={item.group} aria-pressed={(input.worldViewCategory || worldViewTagGroups[0].group) === item.group} className={(input.worldViewCategory || worldViewTagGroups[0].group) === item.group ? styles.categoryActive : ""} onClick={() => update("worldViewCategory", item.group)}>{item.group}</button>)}</div><div className={styles.secondaryPanel}><strong>{input.worldViewCategory || worldViewTagGroups[0].group} · 二级标签</strong><div className={styles.choiceChips}>{(worldViewTagGroups.find((item) => item.group === (input.worldViewCategory || worldViewTagGroups[0].group))?.tags || []).map((worldView) => <button type="button" key={worldView} aria-pressed={(input.worldViewTags || []).includes(worldView)} className={(input.worldViewTags || []).includes(worldView) ? styles.choiceSelected : ""} onClick={() => toggleTaskTag("worldViewTags", worldView)}>{worldView}</button>)}</div></div></div></div>
      <div className={styles.taskSection}><b>人物设定（可选） <small>选择一级分类后，可跨分类多选</small></b><div className={styles.hierarchySelector}><div className={styles.categoryRail}>{characterSettingTagGroups.map((item) => <button type="button" key={item.group} aria-pressed={activeCharacterGroup === item.group} className={activeCharacterGroup === item.group ? styles.categoryActive : ""} onClick={() => setActiveCharacterGroup(item.group)}>{item.group}</button>)}</div><div className={styles.secondaryPanel}><strong>{activeCharacterGroup} · 二级标签</strong><div className={styles.choiceChips}>{(characterSettingTagGroups.find((item) => item.group === activeCharacterGroup)?.tags || []).map((character) => <button type="button" key={character} aria-pressed={(input.characterSettingTags || []).includes(character)} className={(input.characterSettingTags || []).includes(character) ? styles.choiceSelected : ""} onClick={() => toggleTaskTag("characterSettingTags", character)}>{character}</button>)}</div></div></div></div>
      <div className={styles.taskSection}><b>补充要求（可选）<small>可填写或上传额外创作约束，不会覆盖剧情事实与已选标签</small></b><label className={styles.uploadField}><span>上传补充要求</span><input type="file" accept=".txt,.md,.json" onChange={(event) => void readTextUpload(event.target.files?.[0], "supplementalRequirements")} /></label><textarea className={`${styles.synopsisField} resize-none`} style={{ resize: "none" }} value={input.supplementalRequirements || ""} placeholder="例如：突出亲情冲突；避免血腥画面；面向英语市场。" onChange={(event) => updateSupplementalRequirements(event.target.value)} /><small className={styles.fieldHint}>补充要求只作为创作约束，AI会在不改变剧情事实的前提下参考。</small></div>
      <label className={styles.modelSelect}><span>选择AI模型</span><select value={input.modelProvider || "qwen"} onChange={(event) => update("modelProvider", event.target.value)}>{modelOptions.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}</select><small>AI标签匹配和后续创意生成都会使用此模型。</small></label>
      <div className={styles.taskSection}><b>正片承接</b><div className={styles.handoffChoices}><label><input type="radio" checked={input.handoffStrategy === "auto"} onChange={() => setHandoff("auto")} />AI自动寻找最佳承接点</label><label><input type="radio" checked={input.handoffStrategy === "manual"} onChange={() => setHandoff("manual")} />我自己指定</label><label><input type="radio" checked={input.handoffStrategy === "none"} onChange={() => setHandoff("none")} />暂不考虑承接</label></div>{input.handoffStrategy === "manual" && <label className={styles.longField}><span>指定承接位置</span><input value={input.preferredTransitionAnchor || ""} placeholder="例如：女儿拖着行李离开家门的正片段落" onChange={(event) => update("preferredTransitionAnchor", event.target.value)} /></label>}</div>
      <footer className={styles.stageFooter}><span>{input.genre && (input.genreTags || []).length && (input.worldViewTags || []).length && (input.plotSynopsis || input.targetBrief || "").trim() ? `将按“${(input.genreTags || []).join("、")} × ${(input.worldViewTags || []).join("、")}”让AI匹配未选择标签。` : "请先提交剧情简介，再选择题材类型的二级标签和至少一个具体世界观标签。"}</span><button className={styles.primary} disabled={tagBusy || !(input.plotSynopsis || input.targetBrief || "").trim() || !input.genre || !(input.genreTags || []).length || !(input.worldViewTags || []).length} onClick={() => void prepareTags()}>{tagBusy ? "AI正在匹配内容标签…" : "AI匹配内容标签 →"}</button></footer>
    </section>}

    {step === 1 && <section className={styles.stage}>
      <header className={styles.stageHeader}><div><span>第二步 · 必要确认点 1/2</span><h2>检查AI匹配的内容标签</h2><p>题材和世界观作为背景约束；本次确认的人物关系与人物设定会进入显影合同，按候选槽位落实为行动、自然对白和人物反应。未选择的标签不会被强加。</p></div><div className={styles.legend}>{stateOrder.map((state) => <span key={state} data-state={state}><i />{stateLabels[state]}</span>)}</div></header>
      <div className={styles.tagAxisGrid}>{(["题材类型", "人物关系", "世界观", "人物设定"] as const).map((axis) => <article className={styles.tagAxis} key={axis}><header><h3>{axis}</h3><small>{matchedTags.filter((item) => item.axis === axis).length} 个匹配</small></header><div>{matchedTags.filter((item) => item.axis === axis).map((item) => { const state = item.source === "user" ? "locked" : tagStates[item.id] || "recommended"; return <button key={item.id} disabled={item.source === "user"} data-state={state} onClick={() => setTagStates((current) => ({ ...current, [item.id]: stateOrder[(stateOrder.indexOf(state) + 1) % stateOrder.length] }))}><span><b>{item.label}</b><em>{item.source === "user" ? "用户已选 · 已确认" : `${stateLabels[state]} · ${item.confidence}%`}</em></span><small>{item.group} · {item.reason}<br />影响：{item.impact}<br />适配：{item.compatibleHooks.join("、")}{item.conflicts.length ? ` · 冲突：${item.conflicts.join("、")}` : ""}</small></button>; })}</div></article>)}</div>
      <details className={styles.catalogDetails}><summary>查看完整标准标签库</summary>{baseTagGroups.map((item) => <p key={`${item.axis}-${item.group}`}><b>{item.axis} · {item.group}</b><span>{item.tags.join("、")}</span></p>)}</details>
      <footer className={styles.stageFooter}><span>确认后，关系与人设标签会按槽位生成可检查的显影证据；排除标签和未选择标签不会被强行写入。</span><button className={styles.primary} onClick={confirmTags}>确认标签并生成策略 →</button></footer>
    </section>}

    {step === 2 && <section className={styles.stage}>
      <header className={styles.stageHeader}><div><span>第三步 · 动态首尾钩子方案</span><h2>选择1—3组与当前剧情匹配的开头钩子与结尾卡点</h2><p>系统根据本次题材、世界观、人物关系和人物设定，从完整钩子库中筛出三组；每条候选只执行一组完整方案，选中的方案会在候选池中均衡分配。开头负责让冲突立刻被看懂，结尾负责停在后果即将发生的瞬间。</p></div><span className={styles.autoBadge}>已选 {selectedHookPairIds.length}/3 · 动态推荐</span></header>
      <div className={styles.hookPairGrid}>{recommendedHookPairs.map((option) => { const selected = selectedHookPairIds.includes(option.id); return <button type="button" key={option.id} aria-pressed={selected} className={selected ? styles.hookPairSelected : ""} onClick={() => selectHookPair(option)}><span>{selected ? "已选择" : "完整方案"}</span><h3>{option.title}</h3><p>{option.description}</p><small className={styles.hookRecommendationReason}>推荐依据：{option.recommendationReason}</small><dl><div><dt>开头钩子</dt><dd>{option.openingHook.visibleAction}</dd></div><div><dt>中段升级</dt><dd>{option.middleEscalation}</dd></div><div><dt>结尾卡点</dt><dd>{option.endingHook.lastVisibleAction}；{option.endingHook.imminentConsequence}</dd></div></dl></button>; })}</div>
      <details className={styles.hookAdvanced}><summary>高级调整（可选）</summary><p>如需更精确，可补充钩子标签或自定义一句要求；不填写也可直接生成。</p><div className={styles.hookAxisGrid}>{hookRecipeOptions.map(([axis, options]) => <article key={axis} className={styles.hookAxis} data-axis={hookAxisLabels.includes(axis)}><header><b>{axis}</b><small>{hookAxisOptions.find((item) => item.axis === axis)?.description}</small></header><div>{options.map((label) => { const id = `recipe-${axis}-${label}`; const selected = selectedHooks.some((item) => item.id === id); return <button type="button" key={id} aria-pressed={selected} className={selected ? styles.hookDirectionSelected : ""} onClick={() => toggleHookDirection({ id, label, family: axis, type: label })}><span>{selected ? "✓" : "+"}</span>{label}</button>; })}</div></article>)}</div><label className={styles.longField}><span>自定义钩子要求（可选）</span><textarea className="resize-none" style={{ resize: "none" }} value={input.hookStrategyPlan?.customHook || ""} onChange={(event) => writeHookStrategy(selectedHooks, endingMode, event.target.value)} placeholder="例如：人物被当众赶出宴会，但离开前让所有人改变态度" /><small>用一句话描述想看到的冲突，无需使用专业术语。</small></label><div className={styles.endingChoice}><label><span>结尾卡点微调</span><select value={endingMode} onChange={(event) => writeHookStrategy(selectedHooks, event.target.value)}>{hookEndingOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label><p>补充选项只调整当前方案，不会强制加入未选择的人物关系或人物设定。</p></div></details>
      <footer className={styles.stageFooter}><span>候选会按已选方案矩阵分配，每条只执行一组首尾钩子，并把本次已选的人物关系与人物设定落实为行动、自然对白和人物反应。</span><div className={styles.generationActions}><button className={styles.primary} disabled={busy} onClick={() => void generate()}>{busy ? `正在生成 ${generationProgress.completed}/${generationProgress.total} 条…` : "生成 24 条创意候选 →"}</button>{busy && <button className={styles.secondaryButton} onClick={onStopGeneration}>停止补充</button>}</div></footer>
    </section>}

    {step === 3 && <section className={styles.stage}>
      <header className={styles.stageHeader}><div><span>第四步 · 必要确认点 2/2</span><h2>筛选创意候选</h2><p>每张卡片在一个场景内聚焦一个重要事件；先浏览轻量创意，再为选中的方向生成完整脚本。</p>{busy && <p className={styles.streamProgress} aria-live="polite"><i className={styles.streamSpinner} aria-hidden="true" /><b>已完成 {generationProgress.completed}/{generationProgress.total} 条</b>{generationProgress.stage}</p>}</div><div className={styles.generationActions}><button className={styles.secondaryButton} disabled={!batchScriptCandidates.length || activeActionKeys.length > 0} onClick={() => void expandBatchScripts()}>{isActionActive("script-batch") ? `正在生成 ${batchScriptProgress.completed}/${batchScriptProgress.total}` : `批量生成脚本 ${batchScriptCandidates.length}/10`}</button>{busy ? <button className={styles.secondaryButton} onClick={onStopGeneration}>停止补充</button> : <button className={styles.secondaryButton} title="保留当前候选，生成一批不同的候选" onClick={() => void onGenerate()}>一键换一批</button>}</div></header>
      {branchSetupCandidate && <div className={styles.branchWorkbench}><header><div><span>变体工作台 · 基于母候选</span><h3>{branchSetupCandidate.title}</h3><p>{branchSetupCandidate.scene} · {branchSetupCandidate.coreEvent}</p></div><button className={styles.secondaryButton} onClick={() => setBranchSetupCandidate(null)}>返回候选</button></header><div className={styles.branchSpecGrid}>{branchSpecs.map((spec, index) => <article key={index}><b>变体 {String.fromCharCode(65 + index)}</b><label>变化方向<select value={spec.direction} onChange={(event) => updateBranchSpec(index, { direction: event.target.value as PrefaceBranchSpec["direction"] })}>{["情绪升级", "关系重排", "冲突加码", "核心事件替换", "场景迁移", "信息反转"].map((item) => <option key={item}>{item}</option>)}</select></label><label>变化强度<select value={spec.intensity} onChange={(event) => updateBranchSpec(index, { intensity: event.target.value as PrefaceBranchSpec["intensity"] })}>{["轻度", "明显", "强烈"].map((item) => <option key={item}>{item}</option>)}</select></label><small>保留：{spec.preserve.join("、")}</small></article>)}</div><footer><span>生成时会逐条检查人物行动、对白显影、单一场景和禁用视觉元素。</span><button className={styles.primary} disabled={isActionActive(`branch:${branchSetupCandidate.id}`)} onClick={() => void generateBranchesFromWorkbench()}>{isActionActive(`branch:${branchSetupCandidate.id}`) ? <><i className={styles.streamSpinner} aria-hidden="true" />正在生成…</> : "开始生成3个变体"}</button></footer></div>}
      {!branchSetupCandidate && <div className={styles.candidateToolbar}><div>{(["all", "anchored", "migrated", "wild"] as const).map((lane) => <button key={lane} className={laneFilter === lane ? styles.actionOn : ""} onClick={() => setLaneFilter(lane)}>{lane === "all" ? `全部 ${candidates.length}` : `${laneLabels[lane]} ${candidates.filter((item) => item.lane === lane).length}`}</button>)}</div><label>排序<select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="ad">投放潜力</option><option value="novelty">创意新鲜度</option><option value="difficulty">制作难度</option></select></label><button className={showRejected ? styles.actionOn : ""} onClick={() => setShowRejected((value) => !value)}>{showRejected ? "隐藏已淘汰" : `查看已淘汰 ${rejectedIds.length}`}</button></div>}
      
      {!branchSetupCandidate && !branchResults && (!visibleCandidates.length ? <div className={styles.empty}><strong>还没有可浏览的创意候选</strong><span>返回第三步开始生成，首批四条完成后会立即显示。</span></div> : <div className={styles.candidateGrid}>{candidateGroups.map((group) => <div className={styles.candidateGroup} key={group[0].id}>{group.map((candidate) => <article className={`${styles.candidateCard} ${candidate.parentId ? styles.branchCandidate : ""}`} key={candidate.id}>
        <header><div><span>{candidate.parentId ? "分支 · " : ""}{laneLabels[candidate.lane]} · {candidate.hookMechanism}</span><h3>{candidate.title}</h3></div><div className={styles.cardChecks}><label className={styles.compareToggle}><input type="checkbox" checked={batchScriptIds.includes(candidate.id)} disabled={!batchScriptIds.includes(candidate.id) && batchScriptIds.length >= 10} onChange={() => toggleBatchScript(candidate.id)} />脚本</label>{ideas.some((idea) => idea.sourceCandidateId === candidate.id) && <i className={styles.generatedDot} title="已生成脚本" aria-label="已生成脚本" />}{candidates.some((item) => item.parentId === candidate.id) && <i className={styles.generatedDot} title="已生成变体" aria-label="已生成变体" />}</div></header>
        <p className={styles.promise}><b>场景：</b>{candidate.scene} · {candidate.sceneFamily}<br /><b>核心事件：</b>{candidate.coreEvent}</p>
        <div className={styles.candidateEssentials}><p><b>0—3秒</b>{candidate.openingAction}</p><p><b>结尾悬念</b>{candidate.endingQuestion}</p></div>
        <div className={styles.evidenceRows}><div><b>内容标签</b>{candidate.usedTags.map((item) => <span key={`${candidate.id}-tag-${item.tag}`} title={item.evidence}>{item.tag}</span>)}</div><div><b>钩子组合</b>{candidate.usedHooks.map((item) => <span key={`${candidate.id}-hook-${item.hook}`} title={item.evidence}>{item.role} · {item.hook}</span>)}</div></div>
        {!!candidate.tagRealizations.length && <details className={styles.tagRealizationCard}><summary>已选标签如何显影 · {candidate.tagRealizations.length} 项</summary>{candidate.tagRealizations.map((item) => <div key={`${candidate.id}-realization-${item.axis}-${item.tag}`}><header><b>{item.tag}</b><span>{item.axis === "relationship" ? "人物关系" : "人物设定"} · {item.timeBlock}秒</span></header><p><strong>行动</strong>{item.action}</p><p><strong>对白意图</strong>{item.dialogueIntent}</p><p><strong>人物反应</strong>{item.reaction}</p><small>观众会看懂：{item.audienceInference}</small></div>)}</details>}
        {candidate.dramaticEvidence && <details className={styles.candidateEvidence}><summary>关系 / 人设如何演</summary><div><p><b>人物关系</b>{candidate.dramaticEvidence.relationship.action} {candidate.dramaticEvidence.relationship.dialogue} {candidate.dramaticEvidence.relationship.reaction}</p><p><b>人物设定</b>{candidate.dramaticEvidence.characterSetting.action} {candidate.dramaticEvidence.characterSetting.dialogue} {candidate.dramaticEvidence.characterSetting.reaction}</p></div></details>}
        <details className={styles.quickPreview}><summary>快速预览15秒结构</summary><div><span><b>0—3秒</b>{candidate.openingAction}</span><span><b>3—7秒</b>{candidate.escalation[0] || "围绕同一矛盾升级"}</span><span><b>7—11秒</b>{candidate.escalation[1] || "行动主体夺回主动权"}</span><span><b>11—15秒</b>{candidate.endingQuestion}</span></div></details>
        <details className={styles.candidateEvidence}><summary>查看策划依据与评分</summary><div>{candidate.usedTags.map((item) => <p key={`${candidate.id}-tag-evidence-${item.tag}`}><b>{item.tag}</b>{item.evidence}</p>)}{candidate.usedHooks.map((item) => <p key={`${candidate.id}-hook-evidence-${item.hook}`}><b>{item.role} · {item.hook}</b>{item.stage}：{item.evidence}</p>)}</div><footer><span>投放潜力 <b>{candidate.adPotential}</b></span><span>创意新鲜度 <b>{candidate.noveltyScore}</b></span><span>制作难度 <b>{candidate.productionDifficulty}</b></span></footer></details>
        {Object.values(candidate.locks).some(Boolean) && <div className={styles.lockedSummary}>已锁定：{lockLabels.filter(([key]) => candidate.locks[key]).map(([, label]) => label).join("、")}</div>}
        <div className={styles.cardActions}><button className={styles.cardPrimary} disabled={isActionActive(`script:${candidate.id}`) || isActionActive("script-batch")} onClick={() => void expandCandidate(candidate)}>{isActionActive(`script:${candidate.id}`) ? <><i className={styles.streamSpinner} aria-hidden="true" />正在生成脚本与分镜…</> : "选择并生成脚本"}</button><button disabled={isActionActive(`branch:${candidate.id}`)} onClick={() => openBranchWorkbench(candidate)}>{isActionActive(`branch:${candidate.id}`) ? <><i className={styles.streamSpinner} aria-hidden="true" />正在生成分支…</> : "生成3个变体"}</button><button className={favoriteIds.includes(candidate.id) ? styles.actionOn : ""} aria-pressed={favoriteIds.includes(candidate.id)} onClick={() => onToggleFavorite(candidate)}>{favoriteIds.includes(candidate.id) ? "已收藏" : "收藏"}</button><details className={styles.cardMore}><summary>更多</summary><div><button onClick={() => setLockCandidateId(candidate.id)}>锁定部分设定</button><button onClick={() => toggle(candidate.id, rejectedIds, setRejectedIds)}>{rejectedIds.includes(candidate.id) ? "恢复候选" : "淘汰"}</button></div></details></div>
      </article>)}</div>)}</div>)}
      {branchResults && <section className={styles.branchResultsPage}><header><div><span>变体生成结果 · 独立工作区</span><h3>3 个创意变体</h3><p>变体已独立保存，原有创意候选未被替换。</p></div><button className={styles.secondaryButton} onClick={() => setBranchResults(null)}>返回创意候选</button></header><div className={styles.candidateGrid}>{branchResults.map((candidate) => <article className={styles.candidateCard} key={candidate.id}><header><div><span>变体 · {laneLabels[candidate.lane]} · {candidate.hookMechanism}</span><h3>{candidate.title}</h3></div></header><p className={styles.promise}><b>场景：</b>{candidate.scene}<br /><b>核心事件：</b>{candidate.coreEvent}</p><div className={styles.candidateEssentials}><p><b>0—3秒</b>{candidate.openingAction}</p><p><b>结尾悬念</b>{candidate.endingQuestion}</p></div><div className={styles.cardActions}><button className={styles.cardPrimary} disabled={isActionActive(`script:${candidate.id}`) || isActionActive("script-batch")} onClick={() => void expandCandidate(candidate)}>{isActionActive(`script:${candidate.id}`) ? <><i className={styles.streamSpinner} aria-hidden="true" />正在生成脚本与分镜…</> : "选择并生成脚本"}</button><button onClick={() => onToggleFavorite(candidate)}>{favoriteIds.includes(candidate.id) ? "已收藏" : "收藏"}</button></div></article>)}</div></section>}
      {lockCandidate && <aside className={styles.lockPanel}><header><div><b>锁定部分设定</b><span>{lockCandidate.title}</span></div><button onClick={() => setLockCandidateId("")}>完成</button></header><p>只锁定抽象创意维度；未锁定的人物、动作、场景和事件仍可自由变化。</p><div>{lockLabels.map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(lockCandidate.locks[key])} onChange={() => onUpdateCandidateLocks(lockCandidate.id, { ...lockCandidate.locks, [key]: !lockCandidate.locks[key] })} />{label}</label>)}</div></aside>}
    </section>}

    {step === 4 && <section className={styles.stage}>
      <header className={styles.stageHeader}><div><span>第五步 · 成片输出</span><h2>脚本与分镜</h2><p>每次生成都会保存为独立版本；批量任务会在本页持续显示进度和结果。</p></div>{selected && <b className={styles.scoreBadge}>{selected.score} 分</b>}</header>
      {isActionActive("script-batch") && <div className={styles.batchRunStatus} role="status"><b><i className={styles.streamSpinner} aria-hidden="true" />批量生成中 {batchScriptProgress.completed}/{batchScriptProgress.total}</b><span>最多同时处理 2 条，关闭当前步骤后记录仍会保留。</span></div>}
      {activeScriptCandidateIds.map((candidateId) => <div className={styles.batchRunStatus} role="status" key={`script-run-${candidateId}`}><b><i className={styles.streamSpinner} aria-hidden="true" />{candidateTitle(candidateId)} · 正在生成脚本与分镜…</b><span>该任务会独立保留动画，直到生成完成或失败。</span></div>)}
      {activeStoryboardIdeaIds.map((ideaId) => <div className={styles.batchRunStatus} role="status" key={`storyboard-run-${ideaId}`}><b><i className={styles.streamSpinner} aria-hidden="true" />{ideas.find((idea) => idea.id === ideaId)?.title || "脚本记录"} · 正在重新生成分镜…</b><span>其他任务完成不会中断此状态。</span></div>)}
      {activeLanguageActions.map((key) => <div className={styles.batchRunStatus} role="status" key={key}><b><i className={styles.streamSpinner} aria-hidden="true" />正在切换对白语种…</b><span>只会替换对应记录的台词内容，镜头描述与角色名保持不变。</span></div>)}
      <div className={styles.scriptArchiveTop}>
        <aside className={styles.scriptArchive} aria-label="脚本生成记录"><header><div><b>脚本记录</b><small>{ideas.length} 个版本</small></div>{ideas.length > 0 && <button onClick={() => downloadWord("前贴脚本与分镜-批量.doc", ideas.filter((idea) => downloadIdeaIds.includes(idea.id)))} disabled={!downloadIdeaIds.length}>下载所选 Word</button>}</header>{ideas.length > 0 && <label className={styles.scriptSelectLabel}>选择要查看的版本<select className={styles.scriptSelect} value={activeIdeaId} onChange={(event) => setSelectedId(event.target.value)}><option value="">请选择一个版本</option>{ideas.map((idea) => <option key={idea.id} value={idea.id}>V{idea.version || 1} · {idea.title}{ideaIsGenerating(idea) ? " · 生成中" : ""}</option>)}</select></label>}<details className={styles.downloadPicker}><summary>选择批量下载版本（已选 {downloadIdeaIds.length} 条）</summary>{ideas.map((idea) => <label className={styles.scriptDownloadRow} key={`${idea.id}-download`}><input type="checkbox" checked={downloadIdeaIds.includes(idea.id)} onChange={() => toggleDownloadIdea(idea.id)} /><span>{idea.title}</span><em>{ideaIsGenerating(idea) ? <><i className={styles.streamSpinner} aria-hidden="true" />生成中</> : idea.storyboardScript ? "脚本与分镜完成" : "分镜待重试"}</em></label>)}</details>{batchScriptFailures.filter((failure) => failure.stage === "script").map((failure) => { const candidate = candidates.find((item) => item.id === failure.candidateId); return <div className={styles.scriptFailure} key={`${failure.candidateId}-${failure.stage}`}><span><b>{failure.title}</b><small>{failure.message}</small></span>{candidate && <button disabled={isActionActive(`script:${candidate.id}`)} onClick={() => void expandCandidate(candidate)}>{isActionActive(`script:${candidate.id}`) ? <><i className={styles.streamSpinner} aria-hidden="true" />重试中…</> : "重试"}</button>}</div>; })}{!ideas.length && !isActionActive("script-batch") && <p>尚无脚本记录，请返回第四步选择候选。</p>}</aside>
        <div>{!selected ? <div className={styles.empty}><strong>{isActionActive("script-batch") ? "正在生成首条脚本…" : "请选择一条脚本记录"}</strong><span>{isActionActive("script-batch") ? "首条完成后会自动出现在记录选择器中。" : "历史版本不会被下一次生成覆盖。"}</span></div> : <div className={styles.scriptLayout}><article className={styles.scriptCard}><header className={styles.resultHeader}><div><h3>{selected.title}</h3><small>V{selected.version || 1} · {selected.generatedAt ? new Date(selected.generatedAt).toLocaleString("zh-CN") : "历史记录"}</small></div><button onClick={() => void copyText(selected.script, "前贴脚本")}>复制</button></header><div className={styles.timeline}><span><b>0—3 秒</b>{selected.openingAction}</span><span><b>3—7 秒</b>{selected.escalation[0]}</span><span><b>7—11 秒</b>{selected.escalation[1]}</span><span><b>最后 1—2 秒</b>{selected.reversalAction}；{selected.endingCut}</span></div>{!!selected.tagEvidenceLedger.length && <details className={styles.tagEvidenceLedger}><summary>标签落地检查 · {selected.tagEvidenceLedger.length} 项已写入脚本</summary>{selected.tagEvidenceLedger.map((item) => <div key={`${selected.id}-ledger-${item.axis}-${item.tag}`}><b>{item.tag}</b><span>{item.timeBlock}秒 · {item.action}</span><q>{item.dialogue}</q><small>{item.reaction} → {item.audienceInference}</small></div>)}</details>}<h4>完整前贴脚本</h4><p>{selected.script}</p></article><aside className={styles.deliveryCard}><div><div className={styles.resultHeader}><b>分镜脚本</b><span className={styles.storyboardTools}><select value={storyboardLanguage} onChange={(event) => void onStoryboardLanguageChange(selected, event.target.value as "英语" | "葡萄牙语" | "西班牙语")}><option>英语</option><option>葡萄牙语</option><option>西班牙语</option></select><button onClick={() => void copyText(storyboardVariants[`${selected.id}:${storyboardLanguage}`] || selected.storyboardScript || "", "分镜脚本")}>复制</button></span></div>{selected.storyboardScript ? <pre className={styles.storyboardScript}>{storyboardVariants[`${selected.id}:${storyboardLanguage}`] || selected.storyboardScript}</pre> : <p className={styles.storyboardFailure}>{selected.storyboardError || "正在生成分镜脚本…"}</p>}</div>{!selected.storyboardScript && <div className={styles.deliveryActions}><button disabled={isActionActive(`storyboard:${selected.id}`)} onClick={() => void onGenerateStoryboard(selected)}>{isActionActive(`storyboard:${selected.id}`) ? <><i className={styles.streamSpinner} aria-hidden="true" />正在生成分镜…</> : "重新生成分镜"}</button></div>}</aside></div>}</div>
      </div>
      <div className={styles.scoreRules}><b>质量门槛</b>{Object.entries(scoreWeights).map(([label, value]) => <span key={label}>{label} {value} 分</span>)}</div>
    </section>}
  </div>;
}
