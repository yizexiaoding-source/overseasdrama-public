import { extractStoryboardScript } from "./preface-storyboard-output.ts";

export type PrefaceCreativeMode = "planning" | "replicate" | "matching";
export type PrefaceCreativeModelProvider = "qwen" | "doubao" | "deepseek" | "gemini";
export type PrefaceCreationBasis = "synopsis" | "free";
export type PrefaceHandoffStrategy = "auto" | "manual" | "none";
export type PrefaceCreativeAnalysis = {
  genres: string[];
  worldView: string;
  characters: string[];
  relationshipNetwork: PrefaceRelationshipNode[];
  coreConflict: string;
  recommendedEmotions: string[];
  recommendedHandoff: string;
  specialSettings: string[];
};

export type PrefaceConflictUnit = {
  id: string;
  direction: string;
  powerStructure: string;
  audienceQuestion: string;
};

export type PrefaceHookReference = { family: string; type: string };

export type PrefaceHookSelection = PrefaceHookReference & {
  id: string;
  label: string;
};

export type PrefaceHookStrategyPlan = {
  conflictUnit: PrefaceConflictUnit;
  primaryHook: PrefaceHookReference;
  supportingHooks: PrefaceHookReference[];
  format: string;
  selectedHooks?: PrefaceHookSelection[];
  endingMode?: string;
  customHook?: string;
  selectedPlanId?: string;
  /** Up to three complete hook plans selected for matrix generation; selectedPlanId remains for legacy records. */
  selectedPlanIds?: string[];
  openingHook?: PrefaceOpeningHook;
  middleEscalation?: string;
  endingHook?: PrefaceEndingHook;
};

export type PrefaceCreativeInput = {
  creationSource?: string;
  creationBasis?: PrefaceCreationBasis;
  emotionTags?: string[];
  handoffStrategy?: PrefaceHandoffStrategy;
  analysis?: PrefaceCreativeAnalysis;
  genre: string;
  genreTags?: string[];
  targetMarket: string;
  targetLanguage: string;
  femaleLead: string;
  maleLead: string;
  maleSecond: string;
  relationship: string;
  emotion: string;
  hookStyle: string;
  targetBrief?: string;
  durationSeconds: string;
  worldLevel: string;
  violenceLevel: string;
  dramaIntensity: string;
  worldView?: string;
  worldViewCategory?: string;
  worldViewTags?: string[];
  relationshipTags?: string[];
  characterSettingTags?: string[];
  /** Canonical synopsis text supplied by the creator; targetBrief remains a legacy alias. */
  plotSynopsis?: string;
  /** Optional creator constraints kept separate from story facts. */
  supplementalRequirements?: string;
  aiRecommendedTags?: string[];
  needsHandoff?: string;
  preferredTransitionAnchor?: string;
  allowedSettings: string[];
  forbiddenSettings: string[];
  hookFamily?: string;
  hookType?: string;
  hookFormat?: string;
  conflictUnits?: PrefaceConflictUnit[];
  hookStrategyPlan?: PrefaceHookStrategyPlan;
  lockedTags?: string[];
  excludedTags?: string[];
  modelProvider?: PrefaceCreativeModelProvider;
};

const creativeTaskKeys: Array<keyof Pick<PrefaceCreativeInput, "genre" | "genreTags" | "worldViewCategory" | "worldViewTags" | "relationshipTags" | "characterSettingTags" | "targetBrief" | "plotSynopsis" | "supplementalRequirements" | "modelProvider">> = ["genre", "genreTags", "worldViewCategory", "worldViewTags", "relationshipTags", "characterSettingTags", "targetBrief", "plotSynopsis", "supplementalRequirements", "modelProvider"];

function taskValue(value: unknown) {
  if (Array.isArray(value)) return [...value].map(String).sort().join("\u0001");
  return String(value || "").trim();
}

export function hasCreativeTaskChanged(previous: Partial<PrefaceCreativeInput>, next: Partial<PrefaceCreativeInput>) {
  return creativeTaskKeys.some((key) => taskValue(previous[key]) !== taskValue(next[key]));
}

function hookStrategyValue(input: Partial<PrefaceCreativeInput>) {
  const strategy = input.hookStrategyPlan;
  return JSON.stringify({
    selectedHooks: (strategy?.selectedHooks || []).map((item) => item.id),
    selectedPlanIds: strategy?.selectedPlanIds || (strategy?.selectedPlanId ? [strategy.selectedPlanId] : []),
    endingMode: strategy?.endingMode || "",
    customHook: strategy?.customHook || "",
  });
}

export function hasHookStrategyChanged(previous: Partial<PrefaceCreativeInput>, next: Partial<PrefaceCreativeInput>) {
  return hookStrategyValue(previous) !== hookStrategyValue(next);
}

export type PrefaceDialogue = { speaker: string; english: string; translation: string };
export type PrefaceScoreBreakdown = Record<string, number>;
export type PrefaceRelationshipNode = { participants: string; relation: string; power: string; interest: string; emotion: string; secret: string; status: string };
export type PrefaceTimelineBeat = { time: string; characters: string[]; visual: string; action: string; dialogueIndex: number; storyPurpose: string; twistOrSuspense: string; handoff: string };

export type PrefaceCreativeLane = "anchored" | "migrated" | "wild";
export type PrefaceBranchSpec = { direction: "情绪升级" | "关系重排" | "冲突加码" | "核心事件替换" | "场景迁移" | "信息反转"; intensity: "轻度" | "明显" | "强烈"; preserve: string[] };
export type PrefaceCreativeChangeDimension = "冲突呈现" | "人物关系" | "具体场景" | "核心事件" | "冲突来源" | "人物目标";
export type PrefaceCandidateSlot = {
  id: string;
  lane: PrefaceCreativeLane;
  sceneFamily: string;
  conflictArchetype: string;
  protagonistGoal: string;
  requiredChangedDimensions: PrefaceCreativeChangeDimension[];
  primaryHook: string;
  supportingHook: string;
  endingMode: string;
};
export type PrefaceCandidateLocks = {
  audiencePromise?: boolean;
  hookMechanism?: boolean;
  relationshipPattern?: boolean;
  emotion?: boolean;
  openingVisual?: boolean;
  worldRules?: boolean;
  endingQuestion?: boolean;
};
export type PrefaceCreativeFingerprint = {
  relationship: string;
  goal: string;
  conflictSource: string;
  location: string;
  openingAction: string;
  keyObject: string;
  hookMechanism: string;
  twistType: string;
  endingQuestion: string;
  handoff: string;
};
export type PrefaceTagUsage = { tag: string; evidence: string };
export type PrefaceHookUsage = { hook: string; role: "主钩子" | "辅助钩子"; stage: "开场" | "升级" | "结尾"; evidence: string };
export type PrefaceDramaticEvidence = {
  relationship: { action: string; dialogue: string; reaction: string; audienceInference: string };
  characterSetting: { action: string; dialogue: string; reaction: string; audienceInference: string };
};
export type PrefaceTagAxis = "genre" | "worldView" | "relationship" | "characterSetting" | "ai";
export type PrefaceTagPriority = "required_context" | "required_dramatic" | "available";
export type PrefaceTagTimeBlock = "0-3" | "3-7" | "7-11" | "11-15";
export type PrefaceTagRealization = {
  tag: string;
  axis: PrefaceTagAxis;
  priority: PrefaceTagPriority;
  action: string;
  dialogueIntent: string;
  reaction: string;
  audienceInference: string;
  timeBlock: PrefaceTagTimeBlock;
};
export type PrefaceTagEvidence = PrefaceTagRealization & { dialogue: string };
export type PrefaceOpeningHook = { type: string; visibleAction: string; firstQuestion: string };
export type PrefaceEndingHook = { type: string; lastVisibleAction: string; lastDialogue: string; imminentConsequence: string; unansweredQuestion: string; handoffVisual: string };
export type PrefaceCreativeCandidate = {
  id: string;
  parentId?: string;
  generationSlot: string;
  lane: PrefaceCreativeLane;
  title: string;
  sceneFamily: string;
  scene: string;
  coreEvent: string;
  singleScene: boolean;
  premise: string;
  openingAction: string;
  escalation: string[];
  endingQuestion: string;
  audiencePromise: string;
  hookMechanism: string;
  relationshipPattern: string;
  conflictSource: string;
  conflictArchetype: string;
  protagonistGoal: string;
  changedDimensions: PrefaceCreativeChangeDimension[];
  twistType: string;
  emotion: string;
  worldRules: string;
  productionDifficulty: string;
  adPotential: number;
  noveltyScore: number;
  causalChain: string[];
  unusualElements: string[];
  logicScore: number;
  familiarityScore: number;
  genreFitScore: number;
  productionFeasibilityScore: number;
  usedTags: PrefaceTagUsage[];
  usedHooks: PrefaceHookUsage[];
  dramaticEvidence?: PrefaceDramaticEvidence;
  tagRealizations: PrefaceTagRealization[];
  openingHook: PrefaceOpeningHook;
  endingHook: PrefaceEndingHook;
  fingerprint: PrefaceCreativeFingerprint;
  locks: PrefaceCandidateLocks;
  riskNotes: string[];
};

const candidateLanes = new Set<PrefaceCreativeLane>(["anchored", "migrated", "wild"]);
const candidateLockKeys: Array<keyof PrefaceCandidateLocks> = ["audiencePromise", "hookMechanism", "relationshipPattern", "emotion", "openingVisual", "worldRules", "endingQuestion"];
const candidateFingerprintKeys: Array<keyof PrefaceCreativeFingerprint> = ["relationship", "goal", "conflictSource", "location", "openingAction", "keyObject", "hookMechanism", "twistType", "endingQuestion", "handoff"];

export function parseCreativeCandidates(value: unknown, options: { defaultLane?: PrefaceCreativeLane } = {}): PrefaceCreativeCandidate[] {
  const list = Array.isArray(value) ? value : [];
  return list.flatMap((item, index) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const rawLane = String(row.lane || "").trim();
    const localizedLane: Record<string, PrefaceCreativeLane> = { "原剧情放大": "anchored", "横向迁移": "migrated", "想象突破": "wild" };
    const localizedMatch = Object.keys(localizedLane).find((label) => rawLane === label || rawLane.startsWith(label));
    const lane = (candidateLanes.has(rawLane as PrefaceCreativeLane) ? rawLane : localizedMatch ? localizedLane[localizedMatch] : (rawLane ? "" : options.defaultLane || "")) as PrefaceCreativeLane;
    const title = String(row.title || "").trim();
    const scene = String(row.scene || "").trim();
    const coreEvent = String(row.coreEvent || "").trim();
    const singleScene = row.singleScene === true;
    const premise = String(row.premise || "").trim();
    const openingAction = String(row.openingAction || "").trim();
    const endingQuestion = String(row.endingQuestion || "").trim();
    if (!candidateLanes.has(lane) || !title || !premise || !openingAction || !endingQuestion) return [];
    const rawLocks = row.locks && typeof row.locks === "object" ? row.locks as Record<string, unknown> : {};
    const rawFingerprint = row.fingerprint && typeof row.fingerprint === "object" ? row.fingerprint as Record<string, unknown> : {};
    const usedTags = Array.isArray(row.usedTags) ? row.usedTags.flatMap((item) => {
      const usage = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const tag = String(usage.tag || "").trim();
      const evidence = String(usage.evidence || "").trim();
      return tag && evidence ? [{ tag, evidence }] : [];
    }).slice(0, 5) : [];
    const usedHooks = Array.isArray(row.usedHooks) ? row.usedHooks.flatMap((item) => {
      const usage = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const hook = String(usage.hook || "").trim();
      const evidence = String(usage.evidence || "").trim();
      const role = usage.role === "辅助钩子" ? "辅助钩子" : "主钩子";
      const stage = usage.stage === "升级" || usage.stage === "结尾" ? usage.stage : "开场";
      if (!hook || !evidence) return [];
      const hookParts = hook.split(/[＋+、/]/).map((value) => value.trim()).filter(Boolean);
      return hookParts.map((part, partIndex) => ({ hook: part, role: partIndex === 0 ? role : "辅助钩子", stage: partIndex === 0 ? stage : "升级", evidence }));
    }).slice(0, 3) as PrefaceHookUsage[] : [];
    const locks = Object.fromEntries(candidateLockKeys.map((key) => [key, Boolean(rawLocks[key])])) as PrefaceCandidateLocks;
    const fingerprint = Object.fromEntries(candidateFingerprintKeys.map((key) => [key, String(rawFingerprint[key] || (key === "openingAction" ? openingAction : key === "endingQuestion" ? endingQuestion : "")).trim()])) as PrefaceCreativeFingerprint;
    const openingHookRow = row.openingHook && typeof row.openingHook === "object" ? row.openingHook as Record<string, unknown> : {};
    const endingHookRow = row.endingHook && typeof row.endingHook === "object" ? row.endingHook as Record<string, unknown> : {};
    const tagRealizations = Array.isArray(row.tagRealizations) ? row.tagRealizations.flatMap((value) => {
      const evidence = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const tag = String(evidence.tag || "").trim();
      const axis = String(evidence.axis || "ai") as PrefaceTagAxis;
      const priority = String(evidence.priority || "available") as PrefaceTagPriority;
      const timeBlock = String(evidence.timeBlock || "7-11") as PrefaceTagTimeBlock;
      if (!tag || !["genre", "worldView", "relationship", "characterSetting", "ai"].includes(axis)) return [];
      return [{ tag, axis, priority, action: String(evidence.action || ""), dialogueIntent: String(evidence.dialogueIntent || ""), reaction: String(evidence.reaction || ""), audienceInference: String(evidence.audienceInference || ""), timeBlock }];
    }) : [];
    return [{
      id: String(row.id || `candidate-${index + 1}`), parentId: row.parentId ? String(row.parentId) : undefined, generationSlot: String(row.generationSlot || ""), lane, title, sceneFamily: String(row.sceneFamily || "其他适配场景"), scene, coreEvent, singleScene, premise, openingAction,
      escalation: Array.isArray(row.escalation) ? row.escalation.map(String).filter(Boolean).slice(0, 2) : [], endingQuestion,
      audiencePromise: String(row.audiencePromise || ""), hookMechanism: String(row.hookMechanism || ""), relationshipPattern: String(row.relationshipPattern || ""),
      conflictSource: String(row.conflictSource || ""), conflictArchetype: String(row.conflictArchetype || row.conflictSource || ""), protagonistGoal: String(row.protagonistGoal || rawFingerprint.goal || ""),
      changedDimensions: Array.isArray(row.changedDimensions) ? [...new Set(row.changedDimensions.map(String).map((value) => value.trim()).filter(Boolean))] as PrefaceCreativeChangeDimension[] : [],
      twistType: String(row.twistType || ""), emotion: String(row.emotion || ""), worldRules: String(row.worldRules || ""),
      productionDifficulty: String(row.productionDifficulty || "待评估"), adPotential: Math.max(0, Math.min(100, Number(row.adPotential || 0))), noveltyScore: Math.max(0, Math.min(100, Number(row.noveltyScore || 0))),
      causalChain: Array.isArray(row.causalChain) ? row.causalChain.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 5) : [],
      unusualElements: Array.isArray(row.unusualElements) ? row.unusualElements.map(String).map((value) => value.trim()).filter(Boolean) : [],
      logicScore: Math.max(0, Math.min(100, Number(row.logicScore || 0))), familiarityScore: Math.max(0, Math.min(100, Number(row.familiarityScore || 0))),
      genreFitScore: Math.max(0, Math.min(100, Number(row.genreFitScore || 0))), productionFeasibilityScore: Math.max(0, Math.min(100, Number(row.productionFeasibilityScore || 0))), usedTags, usedHooks,
      fingerprint, locks, dramaticEvidence: row.dramaticEvidence && typeof row.dramaticEvidence === "object" ? (() => { const evidence = row.dramaticEvidence as Record<string, unknown>; const read = (key: string) => { const item = evidence[key] && typeof evidence[key] === "object" ? evidence[key] as Record<string, unknown> : {}; return { action: String(item.action || ""), dialogue: String(item.dialogue || ""), reaction: String(item.reaction || ""), audienceInference: String(item.audienceInference || "") }; }; return { relationship: read("relationship"), characterSetting: read("characterSetting") }; })() : undefined,
      tagRealizations,
      openingHook: { type: String(openingHookRow.type || row.hookMechanism || ""), visibleAction: String(openingHookRow.visibleAction || openingAction), firstQuestion: String(openingHookRow.firstQuestion || "") },
      endingHook: { type: String(endingHookRow.type || row.twistType || ""), lastVisibleAction: String(endingHookRow.lastVisibleAction || ""), lastDialogue: String(endingHookRow.lastDialogue || ""), imminentConsequence: String(endingHookRow.imminentConsequence || ""), unansweredQuestion: String(endingHookRow.unansweredQuestion || endingQuestion), handoffVisual: String(endingHookRow.handoffVisual || "") },
      riskNotes: Array.isArray(row.riskNotes) ? row.riskNotes.map(String).filter(Boolean) : [],
    }];
  });
}

export type PrefaceCreativeCandidateRejection = { id: string; reason: string };
export type PrefaceCreativeCandidateInspection = { candidates: PrefaceCreativeCandidate[]; rejections: PrefaceCreativeCandidateRejection[] };

const nicheElementPattern = /量子|祭司|神谕|血契|灵魂交换|记忆芯片|基因仪|族谱仪|克隆人|外星|赛博|超能力|预言仪式|秘教/;
const visibleHumanActionPattern = /(?:撕|抢|夺|抓|拦|挡|推|拉|按|拍|砸|扔|关|开|冲|撞|跪|拔|举|亮出|掏|扯|拽|抱|踢|摔|打|咬|站起|转身|扑|挡住|拦住|按住|扯下|撕开|宣读|递出|翻开|摁住|扭头|抬手|伸手|追上|拦下|逼近)/;
const nonActionDisplayPattern = /(?:账单|电脑|手机|屏幕|显示屏|监控|邮件|短信|界面).{0,12}(?:显示|弹出|亮起|跳出|出现|滚动)/;
const forbiddenVisualPropPattern = /手机|账单|账本|电脑屏幕|显示屏|屏幕文字|转账记录/;

export function creativeTaskAllowsSpeculativeElements(input: Partial<PrefaceCreativeInput>) {
  const selectedWorld = [input.genre, ...(input.genreTags || []), input.worldView, ...(input.worldViewTags || [])].join("、");
  return /科幻|奇幻|玄幻|仙侠|超自然|异能|狼人|吸血鬼|末日|未来|星际|魔法/.test(selectedWorld);
}

export type PrefaceCandidateInspectionOptions = { allowSpeculative?: boolean; allowedTags?: string[]; selectedHooks?: string[]; synopsis?: string; slots?: PrefaceCandidateSlot[]; defaultLane?: PrefaceCreativeLane };

function normalizedCreativeText(value: string) {
  return value.toLowerCase()
    .replace(/赶出|赶走|逐出|驱逐|轰出|拖走/g, "驱逐")
    .replace(/取消|撤销|剥夺/g, "撤销")
    .replace(/揭穿|揭露|曝光|公开/g, "揭露")
    .replace(/抢走|夺走|截走|霸占/g, "夺取")
    .replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()《》【】\-_]/g, "");
}

function ngrams(value: string, size = 2) {
  const normalized = normalizedCreativeText(value);
  if (!normalized) return new Set<string>();
  if (normalized.length <= size) return new Set([normalized]);
  return new Set(Array.from({ length: normalized.length - size + 1 }, (_, index) => normalized.slice(index, index + size)));
}

function containment(left: string, right: string) {
  const leftNormalized = normalizedCreativeText(left);
  const rightNormalized = normalizedCreativeText(right);
  if (!leftNormalized || !rightNormalized) return 0;
  if (rightNormalized.includes(leftNormalized)) return 1;
  const leftParts = ngrams(leftNormalized);
  const rightParts = ngrams(rightNormalized);
  const shared = [...leftParts].filter((part) => rightParts.has(part)).length;
  return leftParts.size ? shared / leftParts.size : 0;
}

function candidateQualityReason(candidate: PrefaceCreativeCandidate, options: PrefaceCandidateInspectionOptions) {
  const reasons: string[] = [];
  const narrative = [candidate.title, candidate.premise, candidate.openingAction, ...candidate.escalation, candidate.endingQuestion, ...candidate.causalChain].join("、");
  if (!candidate.scene || !candidate.singleScene) reasons.push("未锁定为单一场景");
  if (!candidate.coreEvent) reasons.push("缺少核心事件");
  if (forbiddenVisualPropPattern.test(narrative)) reasons.push("创意不得使用手机、账本、账单或电脑屏幕文字作为视觉重点");
  const firstSeconds = [candidate.openingAction, candidate.escalation[0] || ""].join("、");
  if (!visibleHumanActionPattern.test(firstSeconds) || (nonActionDisplayPattern.test(firstSeconds) && !visibleHumanActionPattern.test(firstSeconds.replace(nonActionDisplayPattern, "")))) reasons.push("0—3秒缺少人物可见行动，不能只展示账单、电脑或手机屏幕变化");
  if (Array.from(candidate.title).length > 16) reasons.push("标题未收敛为核心事件短标题");
  if (candidate.causalChain.length < 5) reasons.push("因果链不完整");
  if (!options.allowSpeculative && nicheElementPattern.test(narrative)) reasons.push("现实题材中出现未经允许的生僻或超现实设定");
  if (options.allowedTags) {
    if (candidate.usedTags.length < 2) reasons.push("内容标签使用证据不足");
    const allowed = new Set(options.allowedTags);
    const unknown = candidate.usedTags.find((item) => !allowed.has(item.tag));
    if (unknown) reasons.push(`使用了未授权标签：${unknown.tag}`);
  }
  if (options.selectedHooks?.length) {
    if (!candidate.usedHooks.length) reasons.push("缺少钩子使用证据");
    const selected = new Set(options.selectedHooks);
    const unknown = candidate.usedHooks.find((item) => !selected.has(item.hook));
    if (unknown) reasons.push(`使用了未选择钩子：${unknown.hook}`);
    if (!candidate.usedHooks.some((item) => item.role === "主钩子" && item.stage === "开场")) reasons.push("主钩子没有落在开场");
  }
  if (options.slots) {
    const slot = options.slots.find((item) => item.id === candidate.generationSlot);
    if (!slot) reasons.push("没有对应的创意差异槽位");
    else {
      if (candidate.lane !== slot.lane) reasons.push("创意距离与槽位不一致");
      if (candidate.conflictArchetype !== slot.conflictArchetype) reasons.push("没有执行槽位指定的冲突原型");
      if (candidate.protagonistGoal !== slot.protagonistGoal) reasons.push("没有执行槽位指定的人物目标");
      const changed = new Set(candidate.changedDimensions);
      const missingChanges = slot.requiredChangedDimensions.filter((dimension) => !changed.has(dimension));
      if (missingChanges.length) reasons.push(`未执行槽位要求的变化维度：${missingChanges.join("、")}`);
      const minimumChanges = candidate.lane === "anchored" ? 1 : candidate.lane === "migrated" ? 2 : 4;
      if (changed.size < minimumChanges) reasons.push(`${candidate.lane === "migrated" ? "横向迁移" : candidate.lane === "wild" ? "想象突破" : "原剧情放大"}必须至少改变${minimumChanges}个维度`);
    }
    if (candidate.lane === "wild" && options.synopsis) {
      const reused = [candidate.scene, candidate.coreEvent, candidate.conflictSource].some((segment) => containment(segment, options.synopsis || "") >= 0.78);
      if (reused) reasons.push("想象突破不能复用简介原场景、核心事件或冲突的同义改写");
    }
  }
  if (candidate.logicScore < 75) reasons.push("逻辑分低于75");
  const familiarityFloor = candidate.lane === "wild" ? 68 : candidate.lane === "migrated" ? 72 : 75;
  if (candidate.familiarityScore < familiarityFloor) reasons.push(`大众理解分低于${familiarityFloor}`);
  if (candidate.genreFitScore < 80) reasons.push("题材匹配分低于80");
  if (candidate.productionFeasibilityScore < 70) reasons.push("制作可执行分低于70");
  return reasons.join("；");
}

export function inspectCreativeCandidates(value: unknown, options: PrefaceCandidateInspectionOptions = {}): PrefaceCreativeCandidateInspection {
  const candidates: PrefaceCreativeCandidate[] = [];
  const rejections: PrefaceCreativeCandidateRejection[] = [];
  parseCreativeCandidates(value, { defaultLane: options.defaultLane }).forEach((candidate) => {
    const reason = candidateQualityReason(candidate, options);
    if (reason) rejections.push({ id: candidate.id, reason });
    else candidates.push(candidate);
  });
  return { candidates, rejections };
}

export function restoreCreativeCandidates(value: unknown) {
  // Cached candidates were already checked against their task-specific genre
  // before persistence, so restore only validates the versioned quality fields.
  return inspectCreativeCandidates(value, { allowSpeculative: true }).candidates;
}

function candidateFingerprint(candidate: PrefaceCreativeCandidate) {
  return candidateFingerprintKeys.map((key) => candidate.fingerprint[key].trim().toLowerCase()).join("|");
}

export function mergeCreativeCandidates(existing: PrefaceCreativeCandidate[], replacements: PrefaceCreativeCandidate[], limit = 24): PrefaceCreativeCandidate[] {
  const seen = new Set<string>();
  const sceneCounts = new Map<string, number>();
  const seenSceneRecipes = new Set<string>();
  const conflictArchetypeCounts = new Map<string, number>();
  const accepted: PrefaceCreativeCandidate[] = [];
  return [...existing, ...replacements].filter((candidate) => {
    const fingerprint = candidateFingerprint(candidate);
    if (seen.has(fingerprint)) return false;
    const scene = candidate.scene.trim().toLowerCase();
    const recipe = [scene, candidate.relationshipPattern, candidate.usedHooks.map((item) => item.hook).join("+")].join("|").toLowerCase();
    const hasTraceableRecipe = Boolean(candidate.relationshipPattern && candidate.usedHooks.length);
    const archetype = candidate.conflictArchetype.trim().toLowerCase();
    const semanticDuplicate = Boolean(archetype) && accepted.some((other) => {
      if (other.conflictArchetype.trim().toLowerCase() !== archetype) return false;
      const eventSimilarity = Math.max(containment(candidate.coreEvent, other.coreEvent), containment(other.coreEvent, candidate.coreEvent));
      const conflictSimilarity = Math.max(containment(candidate.conflictSource, other.conflictSource), containment(other.conflictSource, candidate.conflictSource));
      return Math.max(eventSimilarity, conflictSimilarity) >= 0.72;
    });
    if ((sceneCounts.get(scene) || 0) >= 2 || (hasTraceableRecipe && seenSceneRecipes.has(recipe)) || semanticDuplicate || (archetype && (conflictArchetypeCounts.get(archetype) || 0) >= 2)) return false;
    seen.add(fingerprint);
    sceneCounts.set(scene, (sceneCounts.get(scene) || 0) + 1);
    if (hasTraceableRecipe) seenSceneRecipes.add(recipe);
    if (archetype) conflictArchetypeCounts.set(archetype, (conflictArchetypeCounts.get(archetype) || 0) + 1);
    accepted.push(candidate);
    return true;
  }).slice(0, limit);
}

export type PrefaceCreativeIdea = {
  id: string;
  sourceCandidateId?: string;
  taskKey?: string;
  generatedAt?: string;
  generationOrigin?: "single" | "batch";
  version?: number;
  title: string;
  genreJudgment: { genre: string; worldView: string; coreSellingPoint: string };
  relationshipNetwork: PrefaceRelationshipNode[];
  coreConflictUnit: { participants: string; opposingSide: string; conflict: string; selectionReason: string };
  hookDesign: { primaryHook: string; supportingMechanism: string; format: string; firstQuestion: string; hiddenInformation: string; endingRelease: string; remainingQuestion: string };
  storyModel: string;
  audiencePromise: string;
  sellingPoint: string;
  fitReason: string;
  genreTags: string[];
  worldView: string;
  characterSettings: string[];
  relationship: string;
  emotion: string;
  openingAction: string;
  escalation: string[];
  climaxAction: string;
  reversalAction: string;
  endingCut: string;
  script: string;
  score: number;
  qc: string[];
  hookFamily: string;
  hookType: string;
  hookFormat: string;
  visualHook: string;
  informationHold: string;
  suspenseQuestion: string;
  transitionAnchor: string;
  productionDifficulty: string;
  riskNotes: string[];
  shootingNotes: string[];
  videoPrompt: string;
  reusableTemplate: string;
  scoreBreakdown: PrefaceScoreBreakdown;
  timeline: PrefaceTimelineBeat[];
  selfCheck: Record<string, string | boolean>;
  dialogue: PrefaceDialogue[];
  tagEvidenceLedger: PrefaceTagEvidence[];
  storyboardScript?: string;
  storyboardError?: string;
};

export function normalizeCreativeIdeaEnvelope(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  if (Array.isArray(row.ideas)) return row.ideas;
  if (row.idea && typeof row.idea === "object") return [row.idea];
  if (row.script || row.title) return [row];
  return [];
}

export type PrefaceMatchReport = {
  templateId: string;
  targetId: string;
  compatibility: { score: number; level: string; reasons: string[]; blockers: string[] };
  mapping: Array<{ dimension: string; templateValue: string; targetEvidence: string; status: string }>;
  handoff: { targetEntry: string; bridgeAction: string; bridgeVisual: string; bridgeAudio: string };
};

function narrativeFieldsAreChinese(item: PrefaceCreativeIdea): boolean {
  const relationshipFields = item.relationshipNetwork.flatMap((node) => [node.participants, node.relation, node.power, node.interest, node.emotion, node.secret, node.status]);
  const timelineFields = item.timeline.flatMap((beat) => [beat.time, ...beat.characters, beat.visual, beat.action, beat.storyPurpose, beat.twistOrSuspense, beat.handoff]);
  const fields = [item.title, item.genreJudgment.genre, item.genreJudgment.worldView, item.genreJudgment.coreSellingPoint, ...relationshipFields, ...Object.values(item.coreConflictUnit), ...Object.values(item.hookDesign), item.storyModel, item.audiencePromise, item.sellingPoint, item.fitReason, ...item.characterSettings, item.relationship, item.emotion, item.visualHook, item.openingAction, ...item.escalation, item.climaxAction, item.reversalAction, item.endingCut, item.informationHold, item.suspenseQuestion, item.transitionAnchor, ...item.shootingNotes, ...timelineFields, item.script];
  // 每个剧情/动作字段只要包含中文即可；script 可以同时包含英文对白。
  // 技术提示词、制作参数、风险备注和标签不参与语言淘汰。
  return fields.filter(Boolean).every((field) => /[\u3400-\u9fff]/.test(field));
}

function normalizeCreativeIdeas(value: unknown): PrefaceCreativeIdea[] {
  const list = Array.isArray(value) ? value : [];
  return list.map((item, index) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const genreJudgment = row.genreJudgment && typeof row.genreJudgment === "object" ? row.genreJudgment as Record<string, unknown> : {};
    const coreConflictUnit = row.coreConflictUnit && typeof row.coreConflictUnit === "object" ? row.coreConflictUnit as Record<string, unknown> : {};
    const hookDesign = row.hookDesign && typeof row.hookDesign === "object" ? row.hookDesign as Record<string, unknown> : {};
    const tagEvidenceLedger = Array.isArray(row.tagEvidenceLedger) ? row.tagEvidenceLedger.flatMap((value) => {
      const evidence = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const tag = String(evidence.tag || "").trim();
      if (!tag) return [];
      return [{ tag, axis: String(evidence.axis || "ai") as PrefaceTagAxis, priority: String(evidence.priority || "available") as PrefaceTagPriority, action: String(evidence.action || ""), dialogueIntent: String(evidence.dialogueIntent || ""), dialogue: String(evidence.dialogue || ""), reaction: String(evidence.reaction || ""), audienceInference: String(evidence.audienceInference || ""), timeBlock: String(evidence.timeBlock || "7-11") as PrefaceTagTimeBlock }];
    }) : [];
    return {
      id: String(row.id || `idea-${index + 1}`),
      sourceCandidateId: String(row.sourceCandidateId || "") || undefined,
      taskKey: String(row.taskKey || "") || undefined,
      generatedAt: String(row.generatedAt || "") || undefined,
      generationOrigin: row.generationOrigin === "batch" ? "batch" : row.generationOrigin === "single" ? "single" : undefined,
      version: Number(row.version || 0) || undefined,
      title: String(row.title || `前贴创意 ${index + 1}`),
      genreJudgment: { genre: String(genreJudgment.genre || ""), worldView: String(genreJudgment.worldView || ""), coreSellingPoint: String(genreJudgment.coreSellingPoint || "") },
      relationshipNetwork: Array.isArray(row.relationshipNetwork) ? row.relationshipNetwork.map((value) => {
        const node = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return { participants: String(node.participants || ""), relation: String(node.relation || ""), power: String(node.power || ""), interest: String(node.interest || ""), emotion: String(node.emotion || ""), secret: String(node.secret || ""), status: String(node.status || "") };
      }).filter((node) => node.participants) : [],
      coreConflictUnit: { participants: String(coreConflictUnit.participants || ""), opposingSide: String(coreConflictUnit.opposingSide || ""), conflict: String(coreConflictUnit.conflict || ""), selectionReason: String(coreConflictUnit.selectionReason || "") },
      hookDesign: { primaryHook: String(hookDesign.primaryHook || ""), supportingMechanism: String(hookDesign.supportingMechanism || ""), format: String(hookDesign.format || ""), firstQuestion: String(hookDesign.firstQuestion || ""), hiddenInformation: String(hookDesign.hiddenInformation || ""), endingRelease: String(hookDesign.endingRelease || ""), remainingQuestion: String(hookDesign.remainingQuestion || "") },
      storyModel: String(row.storyModel || ""),
      audiencePromise: String(row.audiencePromise || ""),
      sellingPoint: String(row.sellingPoint || row.audiencePromise || ""),
      fitReason: String(row.fitReason || ""),
      genreTags: Array.isArray(row.genreTags) ? row.genreTags.map(String).filter(Boolean) : [],
      worldView: String(row.worldView || ""),
      characterSettings: Array.isArray(row.characterSettings) ? row.characterSettings.map(String).filter(Boolean) : [],
      relationship: String(row.relationship || ""),
      emotion: String(row.emotion || ""),
      openingAction: String(row.openingAction || ""),
      escalation: Array.isArray(row.escalation) ? row.escalation.map(String).filter(Boolean) : [],
      climaxAction: String(row.climaxAction || ""),
      reversalAction: String(row.reversalAction || ""),
      endingCut: String(row.endingCut || ""),
      script: String(row.script || ""),
      score: Math.max(0, Math.min(100, Number(row.score || 0))),
      qc: Array.isArray(row.qc) ? row.qc.map(String).filter(Boolean) : [],
      hookFamily: String(row.hookFamily || ""),
      hookType: String(row.hookType || ""),
      hookFormat: String(row.hookFormat || ""),
      visualHook: String(row.visualHook || ""),
      informationHold: String(row.informationHold || ""),
      suspenseQuestion: String(row.suspenseQuestion || ""),
      transitionAnchor: String(row.transitionAnchor || ""),
      productionDifficulty: String(row.productionDifficulty || "待评估"),
      riskNotes: Array.isArray(row.riskNotes) ? row.riskNotes.map(String).filter(Boolean) : [],
      shootingNotes: Array.isArray(row.shootingNotes) ? row.shootingNotes.map(String).filter(Boolean) : [],
      videoPrompt: String(row.videoPrompt || ""),
      reusableTemplate: String(row.reusableTemplate || ""),
      scoreBreakdown: row.scoreBreakdown && typeof row.scoreBreakdown === "object" ? Object.fromEntries(Object.entries(row.scoreBreakdown as Record<string, unknown>).map(([key, value]) => [key, Number(value || 0)])) : {},
      timeline: Array.isArray(row.timeline) ? row.timeline.map((value) => {
        const beat = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return { time: String(beat.time || ""), characters: Array.isArray(beat.characters) ? beat.characters.map(String).filter(Boolean) : [], visual: String(beat.visual || ""), action: String(beat.action || ""), dialogueIndex: Number(beat.dialogueIndex ?? -1), storyPurpose: String(beat.storyPurpose || ""), twistOrSuspense: String(beat.twistOrSuspense || ""), handoff: String(beat.handoff || "") };
      }).filter((beat) => beat.time) : [],
      selfCheck: row.selfCheck && typeof row.selfCheck === "object" ? Object.fromEntries(Object.entries(row.selfCheck as Record<string, unknown>).map(([key, value]) => [key, typeof value === "boolean" ? value : String(value || "")])) : {},
      dialogue: Array.isArray(row.dialogue) ? row.dialogue.map((line) => {
        const item = line && typeof line === "object" ? line as Record<string, unknown> : {};
        return { speaker: String(item.speaker || ""), english: String(item.english || ""), translation: String(item.translation || "") };
      }).filter((line) => line.speaker && line.english && line.translation) : [],
      tagEvidenceLedger,
      storyboardScript: extractStoryboardScript(String(row.storyboardScript || "")),
      storyboardError: String(row.storyboardError || ""),
    };
  });
}

export type PrefaceCreativeIdeaRejection = { id: string; reason: "缺少可执行脚本" | "标题或剧情动作描述缺少中文" };
export type PrefaceCreativeIdeaInspection = { ideas: PrefaceCreativeIdea[]; rejections: PrefaceCreativeIdeaRejection[] };

export function ideaHasRequiredTagEvidence(idea: PrefaceCreativeIdea, required: PrefaceTagRealization[]) {
  if (!required.length) return true;
  const ledger = new Map(idea.tagEvidenceLedger.map((item) => [item.tag, item]));
  return required.every((contract) => {
    const evidence = ledger.get(contract.tag);
    return Boolean(evidence
      && evidence.priority === "required_dramatic"
      && evidence.action.trim()
      && evidence.dialogueIntent.trim()
      && evidence.dialogue.trim()
      && evidence.reaction.trim()
      && evidence.audienceInference.trim()
      && idea.script.includes(evidence.dialogue.trim()));
  });
}

function rejectionReason(item: PrefaceCreativeIdea): PrefaceCreativeIdeaRejection["reason"] | "" {
  if (!item.script.trim()) return "缺少可执行脚本";
  if (!narrativeFieldsAreChinese(item)) return "标题或剧情动作描述缺少中文";
  return "";
}

export function inspectCreativeIdeas(value: unknown): PrefaceCreativeIdeaInspection {
  const ideas: PrefaceCreativeIdea[] = [];
  const rejections: PrefaceCreativeIdeaRejection[] = [];
  normalizeCreativeIdeas(value).forEach((item) => {
    const reason = rejectionReason(item);
    if (reason) rejections.push({ id: item.id, reason });
    else ideas.push(item);
  });
  return { ideas, rejections };
}

export function parseCreativeIdeas(value: unknown): PrefaceCreativeIdea[] {
  return inspectCreativeIdeas(value).ideas;
}

export function mergeCreativeIdeas(existing: PrefaceCreativeIdea[], replacements: PrefaceCreativeIdea[], limit = 10): PrefaceCreativeIdea[] {
  const seen = new Set<string>();
  return [...existing, ...replacements].filter((item) => {
    const fingerprint = [item.title, item.hookDesign.primaryHook || item.hookType, item.openingAction].map((value) => value.trim()).join("|");
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  }).slice(0, limit).map((item, index) => ({ ...item, id: `idea-${index + 1}` }));
}

export function parseMatchReport(value: unknown): PrefaceMatchReport {
  const root = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const compatibility = root.compatibility && typeof root.compatibility === "object" ? root.compatibility as Record<string, unknown> : {};
  const handoff = root.handoff && typeof root.handoff === "object" ? root.handoff as Record<string, unknown> : {};
  const mapping = Array.isArray(root.mapping) ? root.mapping : [];
  return {
    templateId: String(root.templateId || ""),
    targetId: String(root.targetId || ""),
    compatibility: {
      score: Math.max(0, Math.min(100, Number(compatibility.score || 0))),
      level: String(compatibility.level || "待判断"),
      reasons: Array.isArray(compatibility.reasons) ? compatibility.reasons.map(String).filter(Boolean) : [],
      blockers: Array.isArray(compatibility.blockers) ? compatibility.blockers.map(String).filter(Boolean) : [],
    },
    mapping: mapping.map((item) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return { dimension: String(row.dimension || ""), templateValue: String(row.templateValue || ""), targetEvidence: String(row.targetEvidence || ""), status: String(row.status || "待判断") };
    }).filter((item) => item.dimension),
    handoff: { targetEntry: String(handoff.targetEntry || ""), bridgeAction: String(handoff.bridgeAction || ""), bridgeVisual: String(handoff.bridgeVisual || ""), bridgeAudio: String(handoff.bridgeAudio || "") },
  };
}
