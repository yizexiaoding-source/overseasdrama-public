import type { PrefaceCreativeCandidate, PrefaceCreativeIdea, PrefaceCreativeInput } from "./preface-creative-domain.ts";

export type PrefaceGenerationOrigin = "single" | "batch";

export type PrefaceCreativeFavorite = {
  id: string;
  candidate: PrefaceCreativeCandidate;
  input: Partial<PrefaceCreativeInput>;
  taskKey: string;
  savedAt: string;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function prefaceTaskKey(input: Partial<PrefaceCreativeInput>) {
  const normalized = {
    genre: input.genre || "",
    genreTags: [...(input.genreTags || [])].sort(),
    worldViewCategory: input.worldViewCategory || "",
    worldViewTags: [...(input.worldViewTags || [])].sort(),
    relationshipTags: [...(input.relationshipTags || [])].sort(),
    characterSettingTags: [...(input.characterSettingTags || [])].sort(),
    plotSynopsis: (input.plotSynopsis || input.targetBrief || "").trim(),
    supplementalRequirements: (input.supplementalRequirements || "").trim(),
    hooks: (input.hookStrategyPlan?.selectedHooks || []).map((item) => item.id).sort(),
    endingMode: input.hookStrategyPlan?.endingMode || "",
  };
  let hash = 2166136261;
  for (const character of JSON.stringify(normalized)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `preface-${(hash >>> 0).toString(36)}`;
}

export function createPrefaceCreativeFavorite(
  candidate: PrefaceCreativeCandidate,
  input: Partial<PrefaceCreativeInput>,
  savedAt = new Date().toISOString(),
): PrefaceCreativeFavorite {
  const snapshot = clone({ candidate, input });
  return {
    id: candidate.id,
    candidate: snapshot.candidate,
    input: snapshot.input,
    taskKey: prefaceTaskKey(input),
    savedAt,
  };
}

export function replaceCandidateBranches(
  current: PrefaceCreativeCandidate[],
  parentId: string,
  incoming: PrefaceCreativeCandidate[],
  limit = 60,
) {
  const preserved = current.filter((item) => item.parentId !== parentId);
  const ids = new Set(preserved.map((item) => item.id));
  const branches = incoming.filter((item) => item.parentId === parentId && !ids.has(item.id));
  return [...preserved, ...branches].slice(0, limit);
}

export function createPrefaceIdeaRecord(
  idea: PrefaceCreativeIdea,
  sourceCandidateId: string,
  input: Partial<PrefaceCreativeInput>,
  existing: PrefaceCreativeIdea[],
  generationOrigin: PrefaceGenerationOrigin,
  generatedAt = new Date().toISOString(),
): PrefaceCreativeIdea {
  const taskKey = prefaceTaskKey(input);
  const version = existing.filter((item) => item.sourceCandidateId === sourceCandidateId && item.taskKey === taskKey).reduce((max, item) => Math.max(max, item.version || 0), 0) + 1;
  return {
    ...idea,
    id: `${sourceCandidateId}-v${version}-${Date.parse(generatedAt) || Date.now()}`,
    sourceCandidateId,
    taskKey,
    generatedAt,
    generationOrigin,
    version,
  };
}

export function buildPrefaceTextExport(ideas: Partial<PrefaceCreativeIdea>[], kind: "script" | "storyboard" | "combined") {
  return ideas.map((idea, index) => {
    const heading = `${idea.title || `前贴脚本 ${index + 1}`} · V${idea.version || 1}`;
    const sections = [heading];
    if (kind !== "storyboard") sections.push(`\n完整前贴脚本\n${idea.script || "（尚未生成）"}`);
    if (kind !== "script") sections.push(`\n分镜脚本\n${idea.storyboardScript || idea.storyboardError || "（尚未生成）"}`);
    return sections.join("\n");
  }).join(`\n\n${"=".repeat(48)}\n\n`);
}

export type PrefaceBatchEntry<T> = { status: "fulfilled"; value: T; index: number } | { status: "rejected"; reason: unknown; index: number };

export async function runPrefaceBatch<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
  onSettled?: (entry: PrefaceBatchEntry<R>) => void,
) {
  const results = new Array<PrefaceBatchEntry<R>>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      let entry: PrefaceBatchEntry<R>;
      try { entry = { status: "fulfilled", value: await task(items[index], index), index }; }
      catch (reason) { entry = { status: "rejected", reason, index }; }
      results[index] = entry;
      onSettled?.(entry);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker()));
  return results;
}
