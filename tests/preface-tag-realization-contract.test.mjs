import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseCreativeCandidates, parseCreativeIdeas } from "../app/lib/preface-creative-domain.ts";
import { buildCreativeTagContract, buildStoryDna, candidateHasRequiredDramaticEvidence } from "../app/lib/preface-creative-generation.ts";
import { recommendHookPairs } from "../app/lib/preface-creative-catalog.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const baseCandidate = {
  id: "candidate-1", generationSlot: "slot-1", lane: "anchored", title: "当众拒绝牵手", sceneFamily: "公开压力", scene: "家族宴会厅", coreEvent: "两人在家族面前被迫否认关系", singleScene: true,
  premise: "Emma伸手牵住James，James的母亲当众挡开两人。", openingAction: "母亲抬手挡开Emma伸向James的手。", escalation: ["James重新握住Emma。", "母亲命令James当众作出选择。"], endingQuestion: "James会不会承认这段关系？",
  audiencePromise: "看James是否公开选择Emma", hookMechanism: "关系公开爆破", relationshipPattern: "秘密恋人对抗家族", conflictSource: "家族阻止关系公开", conflictArchetype: "关系被公开切断", protagonistGoal: "保住关键关系或承诺", changedDimensions: ["冲突呈现"], twistType: "公开选择", emotion: "压迫与反抗", worldRules: "现代上流社会", productionDifficulty: "低", adPotential: 90, noveltyScore: 80,
  causalChain: ["母亲挡手", "James重新牵手", "母亲施压", "James拒绝放开", "要求公开选择"], unusualElements: [], logicScore: 90, familiarityScore: 90, genreFitScore: 90, productionFeasibilityScore: 90,
  usedTags: [{ tag: "现代都市", evidence: "现代宴会" }, { tag: "秘密恋爱", evidence: "两人被迫否认关系" }], usedHooks: [{ hook: "关系公开爆破", role: "主钩子", stage: "开场", evidence: "母亲挡开两人的手" }],
  fingerprint: { relationship: "秘密恋人", goal: "公开承认", conflictSource: "家族阻止", location: "宴会厅", openingAction: "挡开牵手", keyObject: "", hookMechanism: "关系爆破", twistType: "选择", endingQuestion: "是否承认", handoff: "公开选择" }, locks: {}, riskNotes: [],
};

test("用户选择的关系与人设进入必显影合同，未选择时不强加", () => {
  const selected = buildCreativeTagContract({ genre: "爱情", worldViewTags: ["现代都市"], relationshipTags: ["秘密恋爱"], characterSettingTags: ["强势母亲"] });
  assert.deepEqual(selected.requiredDramaticTags, [
    { tag: "秘密恋爱", axis: "relationship" },
    { tag: "强势母亲", axis: "characterSetting" },
  ]);
  const empty = buildCreativeTagContract({ genre: "爱情", worldViewTags: ["现代都市"] });
  assert.deepEqual(empty.requiredDramaticTags, []);
});

test("剧情DNA同时保留简介事实、角色网络和本次选择的关系人设", () => {
  const dna = buildStoryDna({ plotSynopsis: "Stella被母亲赶出学校", femaleLead: "Stella", relationshipTags: ["母女关系"], characterSettingTags: ["被排斥者"] });
  assert.equal(dna.synopsisFacts, "Stella被母亲赶出学校");
  assert.deepEqual(dna.characterNames, ["Stella"]);
  assert.deepEqual(dna.selectedRelationships, ["母女关系"]);
  assert.deepEqual(dna.selectedCharacterSettings, ["被排斥者"]);
});

test("候选必须为分配到的必显影标签提供动作、对白意图、反应与观众推断", () => {
  const complete = {
    ...baseCandidate,
    tagRealizations: [{ tag: "秘密恋爱", axis: "relationship", priority: "required_dramatic", action: "James重新握住Emma的手", dialogueIntent: "James拒绝继续隐瞒", reaction: "母亲立即挡在两人之间", audienceInference: "两人原本一直秘密交往", timeBlock: "7-11" }],
  };
  assert.equal(candidateHasRequiredDramaticEvidence(complete, ["秘密恋爱"]), true);
  assert.equal(candidateHasRequiredDramaticEvidence({ ...complete, tagRealizations: [] }, ["秘密恋爱"]), false);
});

test("钩子推荐会按当前题材、关系、人设与世界观动态选择三组完整首尾方案", () => {
  const mystery = recommendHookPairs({ genreTags: ["悬疑", "身份秘密"], relationshipTags: ["隐秘亲子关系"], characterSettingTags: ["隐藏身份"], worldViewTags: ["都市"] });
  assert.equal(mystery.length, 3);
  assert.deepEqual(new Set(mystery.map((item) => item.id)).size, 3);
  assert.equal(mystery[0].id, "secret-gap");
  assert.ok(mystery.some((item) => item.id === "identity-reveal"));

  const fantasy = recommendHookPairs({ genreTags: ["爱情"], relationshipTags: ["跨物种恋爱"], characterSettingTags: ["狼人"], worldViewTags: ["狼人", "西方幻想"] });
  assert.equal(fantasy[0].id, "rule-anomaly");
});

test("候选与脚本解析器保留首尾钩子和标签证据账本", () => {
  const [candidate] = parseCreativeCandidates([{ ...baseCandidate, openingHook: { type: "关系爆破", visibleAction: "母亲挡手", firstQuestion: "两人是什么关系？" }, endingHook: { type: "选择前切断", lastVisibleAction: "James伸手推开母亲", lastDialogue: "I choose her.", imminentConsequence: "家族即将公开反对", unansweredQuestion: "James会付出什么代价？", handoffVisual: "母亲抬手示意保安上前" }, tagRealizations: [{ tag: "秘密恋爱", axis: "relationship", priority: "required_dramatic", action: "重新牵手", dialogueIntent: "拒绝隐瞒", reaction: "母亲阻拦", audienceInference: "两人秘密交往", timeBlock: "7-11" }] }]);
  assert.equal(candidate.tagRealizations[0].tag, "秘密恋爱");
  assert.equal(candidate.endingHook.lastVisibleAction, "James伸手推开母亲");

  const [idea] = parseCreativeIdeas([{ title: "公开选择", script: "0—3秒：母亲挡开两人的手。", tagEvidenceLedger: [{ tag: "秘密恋爱", axis: "relationship", priority: "required_dramatic", action: "James重新牵手", dialogueIntent: "拒绝隐瞒", dialogue: "I choose her.", reaction: "母亲后退", audienceInference: "两人秘密交往", timeBlock: "7-11" }] }]);
  assert.equal(idea.tagEvidenceLedger[0].dialogue, "I choose her.");
});

test("第三步展示动态推荐的三选一首尾钩子方案，脚本和分镜继续传递显影证据", async () => {
  const [workflow, catalog, plan, script, storyboard] = await Promise.all([
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/lib/preface-creative-catalog.ts"),
    read("app/api/preface-creative/plan/route.ts"),
    read("app/api/preface-creative/script/route.ts"),
    read("app/api/preface-creative/storyboard/route.ts"),
  ]);
  for (const copy of ["首尾钩子方案", "开头钩子", "结尾卡点", "高级调整"]) assert.match(workflow, new RegExp(copy));
  assert.doesNotMatch(workflow, /可多选 · 最多 3 项/);
  assert.match(catalog, /hookPairOptions/);
  assert.match(catalog, /recommendHookPairs/);
  assert.match(workflow, /recommendHookPairs\(input\)/);
  assert.match(plan, /tagRealizations/);
  assert.doesNotMatch(plan, /请先选择至少一个钩子方向/);
  assert.match(script, /tagEvidenceLedger/);
  assert.match(storyboard, /tagEvidenceLedger/);
  assert.match(storyboard, /只输出一个分镜脚本/);
});
