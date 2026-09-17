import assert from "node:assert/strict";
import test from "node:test";

import { inspectCreativeCandidates, mergeCreativeCandidates, parseCreativeCandidates } from "../app/lib/preface-creative-domain.ts";
import { buildCandidateSlotAssignments, buildCreativeSourceMaterial, buildCreativeTagContract, candidateMatchesSlot, candidatePassesGenerationContract, normalizeCandidateSlotRows } from "../app/lib/preface-creative-generation.ts";

const hooks = [{ id: "hook-1", label: "身份或资格反转", family: "身份地位钩子", type: "资格反转" }];

const candidate = (overrides = {}) => ({
  id: "candidate-1",
  generationSlot: "slot-1",
  lane: "migrated",
  title: "董事会撤销资格",
  sceneFamily: "权力交易",
  scene: "集团董事会会议室",
  coreEvent: "继承资格在会议中被当众撤销",
  singleScene: true,
  premise: "继承人在董事会上被突然取消资格。",
  openingAction: "律师当众宣读资格撤销文件。",
  escalation: ["继承人伸手索要文件。", "文件落地露出异常签名。"],
  endingQuestion: "签名为什么会出现在撤销文件上？",
  audiencePromise: "查清资格被夺走的幕后原因",
  hookMechanism: "身份或资格反转",
  relationshipPattern: "继承人对抗家族权力",
  conflictSource: "继承资格被撤销",
  conflictArchetype: "资格或身份被剥夺",
  protagonistGoal: "夺回资格与话语权",
  changedDimensions: ["具体场景", "核心事件"],
  twistType: "半截真相",
  emotion: "压迫与反击",
  worldRules: "豪门家族权力",
  productionDifficulty: "低",
  adPotential: 90,
  noveltyScore: 82,
  causalChain: ["宣读撤销", "索要文件", "保安阻止", "文件落地", "异常签名出现"],
  unusualElements: [],
  logicScore: 88,
  familiarityScore: 90,
  genreFitScore: 91,
  productionFeasibilityScore: 86,
  usedTags: [
    { tag: "豪门", evidence: "董事会与继承资格构成豪门权力场景" },
    { tag: "权力不对等关系", evidence: "董事长可以命令保安阻止继承人" },
  ],
  usedHooks: [{ hook: "身份或资格反转", role: "主钩子", stage: "开场", evidence: "开场撤销资格" }],
  fingerprint: {
    relationship: "继承人对抗家族",
    goal: "保住继承资格",
    conflictSource: "资格撤销",
    location: "董事会会议室",
    openingAction: "宣读撤销文件",
    keyObject: "撤销文件",
    hookMechanism: "身份反转",
    twistType: "半截真相",
    endingQuestion: "签名来源",
    handoff: "调查签名",
  },
  locks: {},
  riskNotes: [],
  ...overrides,
});

test("人物关系和人物设定标签是候选材料而不是每条候选的硬标签", () => {
  const contract = buildCreativeTagContract({
    genre: "豪门",
    genreTags: ["继承争夺"],
    worldView: "现代都市",
    worldViewCategory: "现实世界",
    worldViewTags: ["上流社会"],
    relationshipTags: ["隐婚"],
    characterSettingTags: ["落魄千金"],
    lockedTags: ["隐婚", "落魄千金", "必须保留的品牌限制"],
  });

  assert.deepEqual(contract.requiredTags, ["豪门", "继承争夺", "现实世界", "现代都市", "上流社会", "必须保留的品牌限制"]);
  assert.deepEqual(contract.availableTags, ["隐婚", "落魄千金"]);
});

test("可选的人物关系或人设标签未被模型使用时不会导致候选整批失败", () => {
  const [slot] = buildCandidateSlotAssignments(hooks, 1, 0, "migrated");
  const candidateForSlot = candidate({ generationSlot: slot.id, lane: slot.lane, sceneFamily: slot.sceneFamily, conflictArchetype: slot.conflictArchetype, protagonistGoal: slot.protagonistGoal, changedDimensions: slot.requiredChangedDimensions });
  assert.equal(candidatePassesGenerationContract(candidateForSlot, slot, ["豪门"], ["豪门", "隐婚"]), true);
});

test("模型漏填创意槽位元数据时按返回顺序补齐，不误报槽位分配失败", () => {
  const [slot] = buildCandidateSlotAssignments(hooks, 1, 0, "migrated");
  const row = candidate({ generationSlot: "", sceneFamily: "", conflictArchetype: "", protagonistGoal: "" });
  const [normalized] = normalizeCandidateSlotRows([row], [slot], "migrated");
  assert.equal(normalized.generationSlot, slot.id);
  assert.equal(normalized.sceneFamily, slot.sceneFamily);
  assert.equal(normalized.conflictArchetype, slot.conflictArchetype);
  assert.equal(normalized.protagonistGoal, slot.protagonistGoal);
});

test("想象突破请求不携带完整简介，只携带角色原名和基础世界规则", () => {
  const input = {
    plotSynopsis: "Luna在订婚宴被Ethan的家族当众赶走。",
    genre: "爱情",
    worldView: "现代都市",
    analysis: {
      genres: ["爱情"],
      worldView: "现代都市",
      characters: ["Luna", "Ethan"],
      relationshipNetwork: [{ participants: "Luna ↔ Ethan", relation: "恋人" }],
      coreConflict: "家族阻止订婚",
      recommendedEmotions: ["爽感"],
      recommendedHandoff: "",
      specialSettings: [],
    },
  };

  const anchored = buildCreativeSourceMaterial(input, "anchored");
  const wild = buildCreativeSourceMaterial(input, "wild");
  assert.equal(anchored.sourceSynopsis, input.plotSynopsis);
  assert.equal(wild.sourceSynopsis, "");
  assert.deepEqual(wild.characterNames, ["Luna", "Ethan"]);
  assert.equal("coreConflict" in wild.aiAnalysis, false);
  assert.equal("relationshipNetwork" in wild.aiAnalysis, false);
});

test("横向迁移必须执行槽位指定的至少两个变化维度", () => {
  const [slot] = buildCandidateSlotAssignments(hooks, 1, 0, "migrated");
  const invalid = candidate({
    generationSlot: slot.id,
    sceneFamily: slot.sceneFamily,
    conflictArchetype: slot.conflictArchetype,
    protagonistGoal: slot.protagonistGoal,
    changedDimensions: [slot.requiredChangedDimensions[0]],
  });

  const inspected = inspectCreativeCandidates([invalid], { slots: [slot], synopsis: "家族在订婚宴上取消她的继承资格。" });
  assert.equal(inspected.candidates.length, 0);
  assert.match(inspected.rejections[0].reason, /至少改变2个维度|未执行槽位要求/);
});

test("候选接口已知当前赛道时可规范化模型返回的中文赛道名称", () => {
  const localized = candidate({ lane: "原剧情放大" });
  const parsed = parseCreativeCandidates([localized], { defaultLane: "anchored" });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].lane, "anchored");
});

test("带有候选或方向后缀的中文赛道名称也能规范化", () => {
  const localized = candidate({ lane: "原剧情放大候选" });
  const parsed = parseCreativeCandidates([localized], { defaultLane: "anchored" });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].lane, "anchored");
});

test("槽位匹配兼容模型给场景和钩子添加说明性后缀", () => {
  const [slot] = buildCandidateSlotAssignments(hooks, 1, 0, "anchored");
  assert.equal(candidateMatchesSlot("私密关系场景", "身份或资格反转钩子", slot), true);
});

test("模型把主钩子和辅助钩子合并写在一项时仍能拆分校验", () => {
  const combo = candidate({ usedHooks: [{ hook: "身份或资格反转＋真相只揭一半", role: "主钩子", stage: "开场", evidence: "开场先反转资格，结尾露出半截真相" }] });
  const inspected = inspectCreativeCandidates([combo], { selectedHooks: ["身份或资格反转", "真相只揭一半"] });
  assert.equal(inspected.candidates.length, 1);
});

test("想象突破不能复用简介中的核心事件或原场景", () => {
  const [slot] = buildCandidateSlotAssignments(hooks, 1, 0, "wild");
  const invalid = candidate({
    lane: "wild",
    generationSlot: slot.id,
    sceneFamily: slot.sceneFamily,
    conflictArchetype: slot.conflictArchetype,
    protagonistGoal: slot.protagonistGoal,
    changedDimensions: slot.requiredChangedDimensions,
    scene: "订婚宴",
    coreEvent: "当众取消她的继承资格",
    conflictSource: "继承资格被取消",
  });

  const inspected = inspectCreativeCandidates([invalid], { slots: [slot], synopsis: "家族在订婚宴上当众取消她的继承资格。" });
  assert.equal(inspected.candidates.length, 0);
  assert.match(inspected.rejections[0].reason, /想象突破.*复用/);
});

test("语义相同但换了标题和措辞的同类冲突只保留一条", () => {
  const first = parseCreativeCandidates([candidate({ id: "first", lane: "anchored", title: "婚宴赶走新娘", coreEvent: "家族当众把新娘赶出婚宴", conflictSource: "家族驱逐", conflictArchetype: "关系被公开切断" })]);
  const paraphrase = candidate({
    id: "second",
    lane: "migrated",
    title: "订婚礼驱逐未婚妻",
    coreEvent: "掌权家族公开驱逐未婚妻离场",
    conflictSource: "家族公开驱逐",
    conflictArchetype: "关系被公开切断",
    fingerprint: { ...candidate().fingerprint, relationship: "未婚妻对抗掌权家族", location: "订婚礼大厅", openingAction: "保安拖走未婚妻" },
  });

  const merged = mergeCreativeCandidates(first, parseCreativeCandidates([paraphrase]), 24);
  assert.deepEqual(merged.map((item) => item.id), ["first"]);
});
