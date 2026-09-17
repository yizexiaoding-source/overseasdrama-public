import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildPrefaceAnalysisView } from "../app/lib/preface-analysis-view-model.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("AI前贴库与创意母版使用同一分析视图", async () => {
  const source = await read("app/lib/preface-analysis-view-model.ts");
  assert.match(source, /buildPrefaceAnalysisView/);
  for (const field of ["creativeApproach", "replicationLines", "handoff", "evidence", "missing"]) {
    assert.match(source, new RegExp(field));
  }
  assert.match(await read("app/features/inspiration/MaterialLibraryPanelV2.tsx"), /buildPrefaceAnalysisView/);
  assert.match(await read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"), /buildPrefaceAnalysisView/);
});

test("AI前贴详情只呈现三段统一分析结构", async () => {
  const panel = await read("app/features/inspiration/MaterialLibraryPanelV2.tsx");
  assert.match(panel, /title: "创作思路"/);
  assert.match(panel, /title: "复刻思路"/);
  assert.match(panel, /title: "衔接正片方向"/);
});

test("空分析字段不会触发递归或阻断详情页", () => {
  const view = buildPrefaceAnalysisView({
    id: "asset-1",
    sourceMaterialId: "source-1",
    kind: "ai_preface",
    title: "空分析",
    clipStart: 0,
    clipEnd: 9,
    genres: [],
    promptBlueprint: {},
    hitReasons: [],
    adxMetrics: {},
    reviewStatus: "pending",
    sourceAnalysis: {},
  });

  assert.equal(view.creativeApproach, "");
  assert.ok(view.missing.includes("创作思路"));
});
