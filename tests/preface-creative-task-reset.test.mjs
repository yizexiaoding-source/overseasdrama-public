import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hasCreativeTaskChanged, hasHookStrategyChanged } from "../app/lib/preface-creative-domain.ts";

const baseTask = {
  genre: "都市情感",
  genreTags: ["豪门"],
  worldViewCategory: "现代都市",
  worldViewTags: ["上流社会"],
  relationshipTags: ["先婚后爱"],
  characterSettingTags: ["隐忍女主"],
  targetBrief: "女主带着孩子离开豪门。",
  modelProvider: "gemini",
};

test("创作任务核心输入变化时应作废后续策划结果", () => {
  assert.equal(hasCreativeTaskChanged(baseTask, { ...baseTask, worldViewTags: ["职场规则"] }), true);
  assert.equal(hasCreativeTaskChanged(baseTask, { ...baseTask, targetBrief: "女主决定公开秘密。" }), true);
  assert.equal(hasCreativeTaskChanged(baseTask, { ...baseTask, modelProvider: "deepseek" }), true);
});

test("未改变创作任务时不应作废后续策划结果", () => {
  assert.equal(hasCreativeTaskChanged(baseTask, { ...baseTask, hookFormat: "公开羞辱型" }), false);
  assert.equal(hasCreativeTaskChanged(baseTask, { ...baseTask }), false);
});

test("钩子多选或结尾方式变化时只作废候选及脚本", () => {
  const strategy = { selectedHooks: [{ id: "a", label: "真相只揭一半", family: "信息差悬念钩子", type: "半截真相" }], endingMode: "AI自动安排" };
  assert.equal(hasHookStrategyChanged({ hookStrategyPlan: strategy }, { hookStrategyPlan: { ...strategy, endingMode: "身份即将揭晓时切断" } }), true);
  assert.equal(hasHookStrategyChanged({ hookStrategyPlan: strategy }, { hookStrategyPlan: strategy }), false);
});

test("任务变化会清空当前候选但保留已归档脚本与独立收藏", async () => {
  const workspace = await readFile(new URL("../app/features/preface-creative/PrefaceCreativeWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /hasCreativeTaskChanged/);
  assert.match(workspace, /setRecommendedTags\(\[\]\)/);
  assert.match(workspace, /setCandidates\(\[\]\)/);
  assert.doesNotMatch(workspace, /setIdeas\(\[\]\)/);
  assert.doesNotMatch(workspace, /localStorage\.removeItem\("lumina:preface-creative-ideas"\)/);
  assert.match(workspace, /prefaceFavorites/);
  assert.match(workspace, /planningRevision/);
});
