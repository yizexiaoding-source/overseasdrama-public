export type PromptFissionVariant = {
  title: string;
  storyEngine: string;
  branch: "A" | "B" | "C";
  branchLabel: string;
  synopsis: string;
  prompt: string;
  storyboard: string[];
  preservedMechanisms: string[];
  changedContent: string[];
  changedDimension: string;
  directionTags: string[];
  difference: string;
  experiment?: string;
  hypothesis?: string;
  targetEvidence?: string[];
  creativeAdditions?: string[];
};

export type PromptFissionBaseline = {
  title: string;
  prompt: string;
  storyboard: string[];
  lockedElements: string[];
};

export type PromptFissionSourceDiagnosis = {
  summary: string;
  hookQuestion: string;
  narrativePromise: string;
  lockedElements: string[];
};
export type PromptFissionTargetMapping = {
  slot: string;
  sourceMechanism: string;
  targetApplication: string;
  evidence: string;
};
export type PromptFissionHandoff = {
  method: string;
  targetEntry: string;
  bridgeAction: string;
  bridgeAudio: string;
  handoffQuestion: string;
};

export type PromptFissionResult = {
  sourceDiagnosis: PromptFissionSourceDiagnosis;
  baseline: PromptFissionBaseline;
  variants: PromptFissionVariant[];
  targetMapping?: PromptFissionTargetMapping[];
  handoff?: PromptFissionHandoff;
};

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

const REQUIRED_STORY_ENGINES = new Set([
  "causal_transfer",
  "result_first",
  "misread_reversal",
  "anomaly_escalation",
  "double_misdirection",
]);

export function validatePromptFissionResult(
  value: unknown,
  lockedMechanisms: string[],
): PromptFissionResult {
  const source = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const rawDiagnosis = source.sourceDiagnosis && typeof source.sourceDiagnosis === "object"
    ? source.sourceDiagnosis as Record<string, unknown>
    : {};
  const sourceDiagnosis: PromptFissionSourceDiagnosis = {
    summary: String(rawDiagnosis.summary || "").trim(),
    hookQuestion: String(rawDiagnosis.hookQuestion || "").trim(),
    narrativePromise: String(rawDiagnosis.narrativePromise || "").trim(),
    lockedElements: strings(rawDiagnosis.lockedElements),
  };
  if (!sourceDiagnosis.summary || !sourceDiagnosis.hookQuestion || !sourceDiagnosis.narrativePromise || !sourceDiagnosis.lockedElements.length) {
    throw new Error("裂变方案缺少原前贴钩子基因诊断");
  }

  const rawBaseline = source.baseline && typeof source.baseline === "object"
    ? source.baseline as Record<string, unknown>
    : {};
  const baseline: PromptFissionBaseline = {
    title: String(rawBaseline.title || "V0 · 原结构复刻版").trim(),
    prompt: String(rawBaseline.prompt || "").trim(),
    storyboard: strings(rawBaseline.storyboard),
    lockedElements: strings(rawBaseline.lockedElements),
  };
  if (!baseline.prompt || baseline.storyboard.length < 3 || baseline.storyboard.length > 8 || !baseline.lockedElements.length) {
    throw new Error("V0 必须包含完整提示词、3 至 8 个连续分镜和锁定项");
  }

  if (!Array.isArray(source.variants) || source.variants.length !== 15) {
    throw new Error("提示词裂变必须完整返回五个故事引擎的十五组分支方案");
  }
  const required = strings(lockedMechanisms);
  const seenBranches = new Set<string>();
  const variants = source.variants.map((raw, index) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const storyboard = strings(item.storyboard);
    if (storyboard.length < 3 || storyboard.length > 8) {
      throw new Error(`第 ${index + 1} 组方案必须包含 3 至 8 个分镜步骤`);
    }
    const preservedMechanisms = strings(item.preservedMechanisms);
    const missing = required.find((mechanism) => !preservedMechanisms.includes(mechanism));
    if (missing) throw new Error(`第 ${index + 1} 组方案未保留锁定机制：${missing}`);
    const branch = String(item.branch || "").trim().toUpperCase();
    if (!/^[ABC]$/.test(branch)) throw new Error(`第 ${index + 1} 组方案缺少 A/B/C 分支标识`);
    const storyEngine = String(item.storyEngine || "").trim();
    const branchKey = `${storyEngine}:${branch}`;
    if (!REQUIRED_STORY_ENGINES.has(storyEngine) || seenBranches.has(branchKey)) throw new Error(`第 ${index + 1} 组方案的故事引擎与分支重复或缺失`);
    seenBranches.add(branchKey);
    const variant: PromptFissionVariant = {
      title: String(item.title || `裂变方案 ${index + 1}`).trim(),
      storyEngine,
      branch: branch as "A" | "B" | "C",
      branchLabel: String(item.branchLabel || "").trim(),
      synopsis: String(item.synopsis || "").trim(),
      prompt: String(item.prompt || "").trim(),
      storyboard,
      preservedMechanisms,
      changedContent: strings(item.changedContent),
      changedDimension: String(item.changedDimension || "").trim(),
      directionTags: strings(item.directionTags),
      difference: String(item.difference || "").trim(),
      experiment: String(item.experiment || "").trim() || undefined,
      hypothesis: String(item.hypothesis || "").trim() || undefined,
      targetEvidence: strings(item.targetEvidence),
      creativeAdditions: strings(item.creativeAdditions),
    };
    if (!variant.prompt || !variant.difference || !variant.changedContent.length || !variant.changedDimension || !variant.branchLabel || !variant.synopsis) {
      throw new Error(`第 ${index + 1} 组方案缺少故事摘要、分支说明、提示词或差异说明`);
    }
    return variant;
  });
  if (new Set(variants.map((item) => item.storyEngine)).size !== REQUIRED_STORY_ENGINES.size || variants.some((item) => variants.filter((candidate) => candidate.storyEngine === item.storyEngine).length !== 3)) {
    throw new Error("十五组方案必须覆盖五个故事引擎，且每个故事引擎各有 A/B/C 三个分支");
  }
  const targetMapping = Array.isArray(source.targetMapping)
    ? source.targetMapping.map((raw) => raw && typeof raw === "object" ? raw as Record<string, unknown> : {}).map((item) => ({
      slot: String(item.slot || "").trim(),
      sourceMechanism: String(item.sourceMechanism || "").trim(),
      targetApplication: String(item.targetApplication || "").trim(),
      evidence: String(item.evidence || "").trim(),
    })).filter((item) => item.slot && item.targetApplication)
    : undefined;
  const rawHandoff = source.handoff && typeof source.handoff === "object" ? source.handoff as Record<string, unknown> : undefined;
  const handoff = rawHandoff ? {
    method: String(rawHandoff.method || "").trim(),
    targetEntry: String(rawHandoff.targetEntry || "").trim(),
    bridgeAction: String(rawHandoff.bridgeAction || "").trim(),
    bridgeAudio: String(rawHandoff.bridgeAudio || "").trim(),
    handoffQuestion: String(rawHandoff.handoffQuestion || "").trim(),
  } : undefined;
  return { sourceDiagnosis, baseline, variants, targetMapping, handoff };
}
