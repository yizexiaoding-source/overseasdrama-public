import type {
  PrefaceCandidateSlot,
  PrefaceCreativeChangeDimension,
  PrefaceCreativeInput,
  PrefaceCreativeCandidate,
  PrefaceCreativeLane,
  PrefaceHookSelection,
  PrefaceTagAxis,
} from "./preface-creative-domain";

const sceneFamilies = ["私密关系", "公开压力", "权力交易", "离开阻拦", "危机处理", "仪式社交"] as const;

const conflictArchetypes = [
  "关系被公开切断",
  "资格或身份被剥夺",
  "关键利益被截走",
  "秘密证据突然出现",
  "保护者立场反转",
  "规则迫使人物选择",
  "错误指控当场成立",
  "控制与逃离正面碰撞",
  "隐瞒身份遭到质疑",
  "承诺与现实发生冲突",
  "生命安全受到威胁",
  "公开名誉即将崩塌",
] as const;

const protagonistGoals = [
  "夺回资格与话语权",
  "保护重要的人或秘密",
  "阻止不可逆的损失",
  "摆脱控制并立即离开",
  "迫使对方公开真相",
  "保住关键关系或承诺",
  "拿回被截走的利益",
  "在众人面前完成反击",
] as const;

const migratedChanges: PrefaceCreativeChangeDimension[][] = [
  ["具体场景", "核心事件"],
  ["人物关系", "冲突来源"],
  ["人物目标", "具体场景"],
  ["核心事件", "冲突来源"],
  ["人物关系", "人物目标"],
];

function unique(values: unknown[]) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function buildCreativeTagContract(input: Partial<PrefaceCreativeInput>) {
  const optionalStoryTags = unique([...(input.relationshipTags || []), ...(input.characterSettingTags || [])]);
  const optionalSet = new Set(optionalStoryTags);
  const explicitlyLockedContext = unique(input.lockedTags || []).filter((tag) => !optionalSet.has(tag));
  const requiredTags = unique([
    input.genre,
    ...(input.genreTags || []),
    input.worldViewCategory,
    input.worldView,
    ...(input.worldViewTags || []),
    ...explicitlyLockedContext,
  ]);
  const availableTags = unique([...optionalStoryTags, ...(input.aiRecommendedTags || [])]).filter((tag) => !requiredTags.includes(tag));
  const excludedTags = unique(input.excludedTags || []);
  const requiredDramaticTags: Array<{ tag: string; axis: PrefaceTagAxis }> = [
    ...(input.relationshipTags || []).map((tag) => ({ tag, axis: "relationship" as const })),
    ...(input.characterSettingTags || []).map((tag) => ({ tag, axis: "characterSetting" as const })),
  ].filter((item, index, rows) => item.tag.trim() && rows.findIndex((row) => row.tag === item.tag && row.axis === item.axis) === index);
  return { requiredTags, requiredContextTags: requiredTags, requiredDramaticTags, availableTags, excludedTags };
}

export function candidateHasRequiredDramaticEvidence(candidate: PrefaceCreativeCandidate, requiredTags: string[]) {
  if (!requiredTags.length) return true;
  const evidence = new Map((candidate.tagRealizations || []).map((item) => [item.tag, item]));
  return requiredTags.every((tag) => {
    const item = evidence.get(tag);
    return Boolean(item && item.priority === "required_dramatic" && item.action.trim() && item.dialogueIntent.trim() && item.reaction.trim() && item.audienceInference.trim());
  });
}

export function assignDramaticTagsForSlot(requiredTags: Array<{ tag: string; axis: PrefaceTagAxis }>, slotIndex: number) {
  const relationships = requiredTags.filter((item) => item.axis === "relationship");
  const characterSettings = requiredTags.filter((item) => item.axis === "characterSetting");
  return [
    relationships.length ? relationships[slotIndex % relationships.length] : undefined,
    characterSettings.length ? characterSettings[slotIndex % characterSettings.length] : undefined,
  ].filter((item): item is { tag: string; axis: PrefaceTagAxis } => Boolean(item));
}

export function buildCreativeSourceMaterial(input: Partial<PrefaceCreativeInput>, lane: PrefaceCreativeLane) {
  const sourceSynopsis = String(input.plotSynopsis || input.targetBrief || "").trim();
  const characterNames = unique([
    ...(input.analysis?.characters || []),
    input.femaleLead,
    input.maleLead,
    input.maleSecond,
  ]);
  const aiAnalysis = lane === "wild" && input.analysis ? {
    genres: input.analysis.genres,
    worldView: input.analysis.worldView,
    characters: input.analysis.characters,
    recommendedEmotions: input.analysis.recommendedEmotions,
    specialSettings: input.analysis.specialSettings,
  } : input.analysis || null;
  return {
    sourceSynopsis: lane === "wild" ? "" : sourceSynopsis,
    characterNames,
    knownRelationshipClues: lane === "anchored" ? String(input.relationship || "").trim() : "",
    aiAnalysis,
    wildSynopsisOmitted: lane === "wild",
  };
}

/** Compact story DNA keeps selected facts available to every creative lane. */
export function buildStoryDna(input: Partial<PrefaceCreativeInput>) {
  return {
    synopsisFacts: String(input.plotSynopsis || input.targetBrief || "").trim(),
    characterNames: unique([...(input.analysis?.characters || []), input.femaleLead, input.maleLead, input.maleSecond]),
    selectedRelationships: [...(input.relationshipTags || [])],
    selectedCharacterSettings: [...(input.characterSettingTags || [])],
    relationshipNetwork: input.analysis?.relationshipNetwork || [],
    coreConflict: input.analysis?.coreConflict || "",
    preservationRule: "已选择的人物关系与人设必须通过人物行动、自然对白和即时反应显影；未选择的关系和人设不得强加。",
  };
}

export function laneGenerationPolicy(lane: PrefaceCreativeLane) {
  if (lane === "anchored") return {
    sourceRole: "剧情简介是本赛道的事实底稿",
    mustPreserve: ["角色原名", "主要人物关系", "核心事件", "人物原目标"],
    mustChange: ["冲突呈现"],
    mustNotReuse: [] as string[],
    minimumChangedDimensions: 1,
  };
  if (lane === "migrated") return {
    sourceRole: "剧情简介只提供题材、世界规则、情绪承诺和冲突本质",
    mustPreserve: ["角色原名", "题材", "世界规则", "情绪承诺"],
    mustChange: ["以当前槽位 requiredChangedDimensions 为准，至少改变两项"],
    mustNotReuse: ["不得只换地点、道具或近义说法"],
    minimumChangedDimensions: 2,
  };
  return {
    sourceRole: "不提供完整简介，只保留角色原名、题材与世界规则",
    mustPreserve: ["角色原名", "题材", "世界规则", "用户禁用项"],
    mustChange: ["具体场景", "核心事件", "冲突来源", "人物关系或人物目标"],
    mustNotReuse: ["简介原场景", "简介核心事件", "简介冲突的同义改写"],
    minimumChangedDimensions: 4,
  };
}

export function buildCandidateSlotAssignments(
  selectedHooks: PrefaceHookSelection[],
  count: number,
  offset: number,
  lane: PrefaceCreativeLane,
  endingMode = "AI自动安排",
): PrefaceCandidateSlot[] {
  const laneShift = lane === "anchored" ? 0 : lane === "migrated" ? 2 : 4;
  return Array.from({ length: count }, (_, index) => {
    const absoluteIndex = offset + index;
    const primary = selectedHooks[absoluteIndex % selectedHooks.length];
    const supporting = selectedHooks.length > 1 ? selectedHooks[(absoluteIndex + 1) % selectedHooks.length] : undefined;
    const requiredChangedDimensions: PrefaceCreativeChangeDimension[] = lane === "anchored"
      ? ["冲突呈现"]
      : lane === "migrated"
        ? migratedChanges[absoluteIndex % migratedChanges.length]
        : ["具体场景", "核心事件", "冲突来源", absoluteIndex % 2 ? "人物关系" : "人物目标"];
    return {
      id: `slot-${absoluteIndex + 1}`,
      lane,
      sceneFamily: sceneFamilies[(absoluteIndex + laneShift) % sceneFamilies.length],
      conflictArchetype: conflictArchetypes[absoluteIndex % conflictArchetypes.length],
      protagonistGoal: protagonistGoals[(absoluteIndex + laneShift) % protagonistGoals.length],
      requiredChangedDimensions,
      primaryHook: primary?.label || "",
      supportingHook: supporting?.label || "",
      endingMode,
    };
  });
}

function normalizeSlotLabel(value: string) {
  return String(value || "").trim().toLowerCase().replace(/[\s·:：()（）【】\[\]]/g, "").replace(/(场景|类型|钩子|方向|机制|方式)$/g, "");
}

export function candidateMatchesSlot(sceneFamily: string, primaryHook: string, slot: PrefaceCandidateSlot) {
  const scene = normalizeSlotLabel(sceneFamily);
  const expectedScene = normalizeSlotLabel(slot.sceneFamily);
  const hook = normalizeSlotLabel(primaryHook);
  const expectedHook = normalizeSlotLabel(slot.primaryHook);
  return scene === expectedScene && (!expectedHook || hook === expectedHook || hook.startsWith(expectedHook));
}

/** Final slot gate used after quality inspection. Context tags establish the
 * story boundary; only relationship/persona tags assigned to this slot become
 * hard dramatic-evidence requirements. Unselected tags are never inferred. */
export function candidatePassesGenerationContract(candidate: PrefaceCreativeCandidate, slot: PrefaceCandidateSlot | undefined, requiredTags: string[], _availableTags: string[], requiredDramaticTags: string[] = []) {
  void _availableTags;
  if (!slot) return false;
  const primaryHook = candidate.usedHooks.find((item) => item.role === "主钩子");
  const usedTags = new Set(candidate.usedTags.map((item) => item.tag));
  return Boolean(primaryHook && candidateMatchesSlot(candidate.sceneFamily, primaryHook.hook, slot) && requiredTags.some((tag) => usedTags.has(tag)) && candidateHasRequiredDramaticEvidence(candidate, requiredDramaticTags));
}

/** Recover only omitted routing metadata from a model response. Content is not
 * rewritten; this prevents a valid candidate from being discarded solely
 * because the model forgot the slot labels in its JSON envelope. */
export function normalizeCandidateSlotRows(candidates: PrefaceCreativeCandidate[], slots: PrefaceCandidateSlot[], lane: PrefaceCreativeLane) {
  if (!slots.length) return candidates;
  return candidates.map((candidate, index) => {
    const fallback = slots[index % slots.length];
    const matched = slots.find((slot) => slot.id === candidate.generationSlot);
    const target = matched || fallback;
    return {
      ...candidate,
      generationSlot: matched ? candidate.generationSlot : target.id,
      lane: candidate.lane || lane,
      sceneFamily: candidate.sceneFamily === "其他适配场景" || !candidate.sceneFamily ? target.sceneFamily : candidate.sceneFamily,
      conflictArchetype: candidate.conflictArchetype || target.conflictArchetype,
      protagonistGoal: candidate.protagonistGoal || target.protagonistGoal,
    };
  });
}

export { conflictArchetypes, protagonistGoals, sceneFamilies };
