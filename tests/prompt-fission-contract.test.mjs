import assert from "node:assert/strict";
import test from "node:test";
import { validatePromptFissionResult } from "../app/lib/prompt-fission-domain.ts";

const variants = Array.from({ length: 5 }, (_, index) => ({
  title: `方案 ${index + 1}`,
  prompt: `保留强冲突与信息差的完整提示词 ${index + 1}`,
  storyboard: ["建立人物与场景", "冲突爆发", "悬念卡断"],
  preservedMechanisms: ["强冲突", "信息差"],
  changedContent: ["人物", "场景"],
  changedDimension: `变量 ${index + 1}`,
  directionTags: ["首帧重构"],
  difference: `替换人物与场景 ${index + 1}`,
}));
const sourceDiagnosis = { summary: "异常事件制造信息差", hookQuestion: "为什么会发生？", narrativePromise: "结尾给出原因", lockedElements: ["强冲突", "信息差"] };
const baseline = { title: "V0 · 原结构复刻版", prompt: "完整基准提示词", storyboard: ["建立事件", "冲突发生", "悬念卡断"], lockedElements: ["强冲突", "信息差"] };
const plan = (items = variants) => ({ sourceDiagnosis, baseline, variants: items });

test("accepts exactly five complete variants that preserve every locked mechanism", () => {
  const result = validatePromptFissionResult(plan(), ["强冲突", "信息差"]);
  assert.equal(result.variants.length, 5);
});

test("rejects partial result instead of saving incomplete plans", () => {
  assert.throws(() => validatePromptFissionResult(plan(variants.slice(0, 4)), ["强冲突"]), /五组/);
});

test("rejects a variant that drops a locked mechanism", () => {
  const invalid = structuredClone(variants);
  invalid[2].preservedMechanisms = ["强冲突"];
  assert.throws(() => validatePromptFissionResult(plan(invalid), ["强冲突", "信息差"]), /信息差/);
});

test("requires three to eight storyboard steps", () => {
  const invalid = structuredClone(variants);
  invalid[0].storyboard = ["只有一步"];
  assert.throws(() => validatePromptFissionResult(plan(invalid), ["强冲突"]), /3 至 8/);
});
