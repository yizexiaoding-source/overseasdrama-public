import type { MaterialLibraryAsset } from "./material-library-store";

type ReplicationLine = {
  label: "保留" | "关系" | "开场" | "节奏";
  value: string;
};

export type PrefaceAnalysisView = {
  creativeApproach: string;
  replicationLines: ReplicationLine[];
  handoff: string;
  evidence: Array<{ start: number; end: number; text: string }>;
  missing: string[];
};

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const rows = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.map(object).filter((row) => Object.keys(row).length) : [];

const text = (value: unknown): string => {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("、");
  const row = object(value);
  if (!Object.keys(row).length) return "";
  for (const key of ["value", "label", "text", "summary", "description", "event", "actionObserved"]) {
    if (row[key] == null || row[key] === value) continue;
    const result = text(row[key]);
    if (result) return result;
  }
  return "";
};

const first = (...values: unknown[]) => {
  for (const value of values) {
    const result = text(value);
    if (result && !["未判定", "待分析", "unknown", "undetermined"].includes(result.toLowerCase())) return result;
  }
  return "";
};

const labels = (value: unknown) => rows(value).map((row) => first(row.label, row.value, row.name)).filter(Boolean);

export function buildPrefaceAnalysisView(asset: MaterialLibraryAsset): PrefaceAnalysisView {
  const analysis = object(asset.sourceAnalysis);
  const content = object(analysis.content);
  const creative = object(analysis.creative);
  const hook = object(creative.hook);
  const transitions = rows(creative.transitions);
  const relations = [...labels(content.relations), ...labels(content.relationships)].filter((value, index, all) => all.indexOf(value) === index);
  const creativeApproach = first(
    creative.creativeSummary,
    content.summary,
    asset.promptBlueprint.summary,
    asset.promptBlueprint.storySummary,
  );
  const mechanism = first(
    creative.replicationMechanism,
    hook.conflict,
    hook.hookType,
    hook.narrativePromise,
    asset.promptBlueprint.mechanism,
    asset.promptBlueprint.conflict,
    asset.hitReasons[0]?.reason,
  );
  const opening = first(
    creative.openingAction,
    hook.visualSummary,
    hook.plotSummary,
    asset.promptBlueprint.openingAction,
    asset.promptBlueprint.hookEvent,
  );
  const handoff = first(
    creative.handoff,
    creative.continuation,
    creative.nextEpisode,
    transitions[0]?.description,
    transitions[0]?.label,
    asset.promptBlueprint.handoff,
    asset.promptBlueprint.transition,
  );
  const evidence = rows(content.observations)
    .map((row) => ({
      start: Number(row.start ?? 0),
      end: Number(row.end ?? row.start ?? 0),
      text: first(row.description, row.text, row.actionObserved, row.event),
    }))
    .filter((row) => Number.isFinite(row.start) && Number.isFinite(row.end) && row.end >= asset.clipStart && row.start <= asset.clipEnd && row.text);
  const replicationLines: ReplicationLine[] = [
    { label: "保留", value: mechanism },
    { label: "关系", value: relations.join("、") },
    { label: "开场", value: opening },
  ].filter((row) => row.value) as ReplicationLine[];
  const missing = [
    ["创作思路", creativeApproach],
    ["复刻机制", mechanism],
    ["开场动作", opening],
    ["衔接正片方向", handoff],
  ].filter(([, value]) => !value).map(([label]) => label);
  return { creativeApproach, replicationLines, handoff, evidence, missing };
}
