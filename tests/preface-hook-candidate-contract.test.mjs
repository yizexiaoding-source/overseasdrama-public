import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectCreativeCandidates, parseCreativeCandidates } from "../app/lib/preface-creative-domain.ts";

const validCandidate = {
  id: "candidate-1",
  lane: "migrated",
  title: "董事会撤销资格",
  sceneFamily: "权力交易",
  scene: "集团董事会会议室",
  coreEvent: "继承资格在会议中被当众撤销",
  singleScene: true,
  premise: "继承人在董事会上被突然取消资格。",
  openingAction: "律师当众宣读资格撤销文件。",
  escalation: ["继承人伸手索要文件，董事长命令保安阻止。", "文件落地，露出失踪亲人的签名。"],
  endingQuestion: "签名为什么会出现在撤销文件上？",
  audiencePromise: "查清资格被夺走的幕后原因",
  hookMechanism: "身份或资格反转＋真相只揭一半",
  relationshipPattern: "继承人对抗家族权力",
  conflictSource: "继承资格",
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
    { tag: "豪门千金", evidence: "董事会与继承资格构成豪门权力场景" },
    { tag: "权力不对等关系", evidence: "董事长可以命令保安阻止继承人" },
  ],
  usedHooks: [
    { hook: "身份或资格反转", role: "主钩子", stage: "开场", evidence: "开场当众撤销继承资格" },
    { hook: "真相只揭一半", role: "辅助钩子", stage: "结尾", evidence: "只露出异常签名而不解释原因" },
  ],
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
};

test("候选解析保留场景类型、内容标签证据和钩子证据", () => {
  const parsed = parseCreativeCandidates([validCandidate]);
  assert.equal(parsed[0].sceneFamily, "权力交易");
  assert.equal(parsed[0].usedTags[0].tag, "豪门千金");
  assert.equal(parsed[0].usedHooks[0].stage, "开场");
});

test("候选只能使用任务允许的标签和用户选中的钩子", () => {
  const accepted = inspectCreativeCandidates([validCandidate], {
    allowSpeculative: false,
    allowedTags: ["豪门千金", "权力不对等关系"],
    selectedHooks: ["身份或资格反转", "真相只揭一半"],
  });
  assert.equal(accepted.candidates.length, 1);

  const rejected = inspectCreativeCandidates([{ ...validCandidate, usedTags: [{ tag: "狼人", evidence: "突然变成狼人" }, validCandidate.usedTags[1]] }], {
    allowedTags: ["豪门千金", "权力不对等关系"],
    selectedHooks: ["身份或资格反转"],
  });
  assert.equal(rejected.candidates.length, 0);
  assert.match(rejected.rejections[0].reason, /未授权标签/);
});

test("第三步提供通俗多选钩子，生成请求包含槽位和标签合同", async () => {
  const [workflow, catalog, route] = await Promise.all([
    readFile(new URL("../app/features/preface-creative/PrefacePlanningWorkflow.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/preface-creative-catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/preface-creative/plan/route.ts", import.meta.url), "utf8"),
  ]);
  for (const label of ["关系突然破裂", "身份或资格反转", "利益遭到抢夺", "危险立即发生", "真相只揭一半", "人物被迫选择"]) {
    assert.match(catalog, new RegExp(label));
  }
  assert.match(workflow, /selectedHooks\.length >= 3/);
  assert.match(workflow, /内容标签/);
  assert.match(workflow, /钩子组合/);
  assert.match(route, /slotAssignments/);
  assert.match(route, /tagContract/);
  assert.match(route, /selectedHookContract/);
  assert.match(route, /sceneFamily/);
  assert.match(route, /contracts\.selectedHooks\.map\(\(item\) => item\.label\)/);
});
