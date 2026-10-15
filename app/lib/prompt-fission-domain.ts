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
  failures: string[];
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

export function creativeMechanisms(values: string[]) {
  return strings(values).filter((value) => !/人工确认|人工复核|证据不足/.test(value));
}

export function validatePromptFissionResult(
  value: unknown,
  lockedMechanisms: string[],
): PromptFissionResult {
  const failures: string[] = [];
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
    failures.push("原前贴钩子基因诊断不完整");
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
    failures.push("V0 部分说明不完整，保留现有内容供预览");
  }

  const rawVariants = Array.isArray(source.variants) ? source.variants : [];
  const required = creativeMechanisms(lockedMechanisms);
  const seenBranches = new Set<string>();
  const variants = rawVariants.flatMap((raw, index) => {
    try {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const storyboard = strings(item.storyboard);
    if (storyboard.length < 3 || storyboard.length > 8) {
      failures.push(`第 ${index + 1} 组方案分镜数量不在建议范围，已保留内容`);
    }
    const preservedMechanisms = strings(item.preservedMechanisms);
    const missing = required.find((mechanism) => !preservedMechanisms.includes(mechanism));
    if (missing) failures.push(`第 ${index + 1} 组方案需复核锁定机制：${missing}`);
    const branch = String(item.branch || "").trim().toUpperCase();
    if (!/^[ABC]$/.test(branch)) failures.push(`第 ${index + 1} 组方案分支标识待补充`);
    const storyEngine = String(item.storyEngine || "").trim();
    const branchKey = `${storyEngine}:${branch}`;
    if (!REQUIRED_STORY_ENGINES.has(storyEngine) || seenBranches.has(branchKey)) failures.push(`第 ${index + 1} 组方案分支需复核，已保留内容`);

    const variant: PromptFissionVariant = {
      title: String(item.title || `裂变方案 ${index + 1}`).trim(),
      storyEngine,
      branch: branch as "A" | "B" | "C",
      branchLabel: String(item.branchLabel || "").trim(),
      synopsis: String(item.synopsis || "").trim(),
      prompt: String(item.prompt || storyboard.join("\n")).trim(),
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
      failures.push(`第 ${index + 1} 组方案部分说明缺失，已保留提示词`);
    }
    if (!variant.prompt) throw new Error(`第 ${index + 1} 组方案没有可展示的提示词或分镜`);
    seenBranches.add(branchKey);
    return [variant];
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "方案校验失败");
      return [];
    }
  });
  for (const engine of REQUIRED_STORY_ENGINES) { for (const branch of ["A", "B", "C"]) { if (!seenBranches.has(`${engine}:${branch}`)) failures.push(`${engine} / ${branch}：未生成有效方案`); } }
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
  return { sourceDiagnosis, baseline, variants, targetMapping, handoff, failures };
}
