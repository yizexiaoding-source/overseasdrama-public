import assert from "node:assert/strict";
import test from "node:test";

import { inspectCreativeCandidates, mergeCreativeCandidates, normalizeCreativeIdeaEnvelope, parseCreativeCandidates, parseCreativeIdeas, restoreCreativeCandidates } from "../app/lib/preface-creative-domain.ts";
import { extractStoryboardScript } from "../app/lib/preface-storyboard-output.ts";

const candidate = (id, lane, title, openingAction, conflictSource = "家族规则") => ({
  id,
  lane,
  title,
  scene: "订婚宴会厅",
  coreEvent: title,
  singleScene: true,
  premise: `${title}的一句话创意`,
  openingAction,
  escalation: ["压力升级", "人物立即反击"],
  endingQuestion: "她接下来会如何选择？",
  audiencePromise: "看弱势人物夺回主动权",
  hookMechanism: "身份错位",
  relationshipPattern: "个人与掌权群体",
  conflictSource,
  twistType: "信息揭露",
  productionDifficulty: "低",
  adPotential: 82,
  noveltyScore: 78,
  causalChain: ["资格被取消", openingAction, "对方阻止她入场", "她拿出股权文件", "她是否会公开真实身份"],
  unusualElements: [],
  logicScore: 88,
  familiarityScore: 91,
  genreFitScore: 90,
  productionFeasibilityScore: 86,
  fingerprint: { relationship: "个人与掌权群体", goal: "夺回资格", conflictSource, location: "宴会", openingAction, keyObject: "邀请函", hookMechanism: "身份错位", twistType: "信息揭露", endingQuestion: "身份是谁", handoff: "同物件" },
});

test("完整脚本兼容 ideas、idea 和直接对象三种模型外壳", () => {
  const idea = { title: "她撕掉婚约", script: "女主当众撕掉婚约。" };
  assert.deepEqual(normalizeCreativeIdeaEnvelope({ ideas: [idea] }), [idea]);
  assert.deepEqual(normalizeCreativeIdeaEnvelope({ idea }), [idea]);
  assert.deepEqual(normalizeCreativeIdeaEnvelope(idea), [idea]);
});

test("候选质量门槛会淘汰低逻辑和过度生僻创意", () => {
  const grounded = candidate("grounded", "migrated", "婚礼现场撤回股份", "女主当众撕碎股份转让书");
  const bizarre = {
    ...candidate("bizarre", "wild", "量子祭司交换胎记", "量子祭司把发光胎记投进族谱仪"),
    unusualElements: [],
    logicScore: 92,
    familiarityScore: 92,
    genreFitScore: 92,
  };
  const inspected = inspectCreativeCandidates([grounded, bizarre]);
  assert.deepEqual(inspected.candidates.map((item) => item.id), ["grounded"]);
  assert.equal(inspected.rejections.length, 1);
  assert.match(inspected.rejections[0].reason, /生僻|逻辑|题材/);
});

test("候选不再因为包含多个非常规元素被拦截", () => {
  const imaginative = {
    ...candidate("imaginative", "wild", "婚宴出现两份遗嘱", "女主把两份遗嘱同时拍在婚宴长桌上"),
    unusualElements: ["第二份遗嘱", "加密录音"],
  };
  assert.deepEqual(inspectCreativeCandidates([imaginative]).candidates.map((item) => item.id), ["imaginative"]);
});

test("分镜输出只保留 JSON 之后的分镜脚本文本", () => {
  const raw = '[{"role_name":"视觉叙事"}]\n\n分镜脚本（总时长：12秒）\n场景：宴会厅\n镜头1：[0-3秒] 镜头：中景；画面描述：女主拍下遗嘱。';
  assert.equal(extractStoryboardScript(raw), "分镜脚本（总时长：12秒）\n场景：宴会厅\n镜头1：[0-3秒] 镜头：中景；画面描述：女主拍下遗嘱。");
});

test("分镜模型返回多个版本时只保留第一版", () => {
  const raw = '[{"role_name":"视觉叙事"}]\n\n分镜脚本1（总时长：15秒）\n场景：宴会厅\n镜头1：女主拍下遗嘱。\n\n分镜脚本2（总时长：15秒）\n场景：走廊\n镜头1：男主冲向电梯。\n\n分镜脚本3（总时长：15秒）\n场景：病房\n镜头1：护士关上门。';
  const result = extractStoryboardScript(raw);
  assert.match(result, /^分镜脚本1/);
  assert.match(result, /女主拍下遗嘱/);
  assert.doesNotMatch(result, /分镜脚本2|分镜脚本3|男主冲向电梯|护士关上门/);
});

test("分镜脚本外层总时长标题不会遮住第一版正文", () => {
  const raw = '分镜脚本（总时长：15秒）\n分镜脚本1（总时长：15秒）\n镜头1：她冲向门口。\n\n分镜脚本2（总时长：15秒）\n镜头1：他关上门。';
  const result = extractStoryboardScript(raw);
  assert.match(result, /^分镜脚本1/);
  assert.match(result, /她冲向门口/);
  assert.doesNotMatch(result, /分镜脚本2|他关上门/);
});

test("恢复旧候选时也会把缓存中的多版分镜压缩为一版", () => {
  const idea = {
    title: "她撕掉婚约",
    script: "她当众撕掉婚约，所有人愣住。",
    storyboardScript: "分镜脚本1（总时长：15秒）\n镜头1：她撕掉婚约。\n\n分镜脚本2（总时长：15秒）\n镜头1：他转身离开。",
  };
  const [parsed] = parseCreativeIdeas([idea]);
  assert.match(parsed.storyboardScript, /分镜脚本1|她撕掉婚约/);
  assert.doesNotMatch(parsed.storyboardScript, /分镜脚本2|他转身离开/);
});

test("同一前贴出现第二个15秒分镜头时只保留分镜头1", () => {
  const raw = "分镜脚本（总时长：15秒）\n场景：学校门口\n分镜头1（总时长：15秒）\n镜头1：[0-3秒] Stella冲向校门。\n镜头2：[3-7秒] 母亲拽住她。\n\n分镜头2（总时长：15秒）\n镜头1：[0-3秒] Stella抓住栏杆。";
  const result = extractStoryboardScript(raw);
  assert.match(result, /分镜头1/);
  assert.doesNotMatch(result, /分镜头2|抓住栏杆/);
});

test("同一分镜的四个时间动作块不会被误当成重复版本截断", () => {
  const raw = "分镜脚本（总时长：15秒）\n场景：学校门口\n分镜头1（0-3秒）\n分镜头1：\n镜头1：[0-3秒] Stella冲向校门。\n分镜头2（3-7秒）\n分镜头2：\n镜头1：[3-7秒] 母亲拽住她。\n分镜头3（7-11秒）\n镜头1：[7-11秒] Stella抓住栏杆。\n分镜头4（11-15秒）\n镜头1：[11-15秒] Stella抬头反击。";
  const result = extractStoryboardScript(raw);
  assert.match(result, /Stella冲向校门/);
  assert.match(result, /母亲拽住她/);
  assert.match(result, /Stella抓住栏杆/);
  assert.match(result, /Stella抬头反击/);
  assert.doesNotMatch(result, /分镜头1（0-3秒）|分镜头2（3-7秒）|分镜头3（7-11秒）|分镜头4（11-15秒）/);
});

test("候选开场必须包含人物可见行动，不能只描述账单或屏幕变化", () => {
  const objectOnly = candidate("object-only", "migrated", "账单弹出秘密", "手机屏幕弹出一张账单");
  const inspected = inspectCreativeCandidates([objectOnly]);
  assert.deepEqual(inspected.candidates.map((item) => item.id), []);
  assert.match(inspected.rejections[0].reason, /人物.*行动|可见行动/);
});

test("候选不得把手机、账本、账单或电脑屏幕文字作为创意视觉点", () => {
  const screenDriven = candidate("screen-driven", "migrated", "手机亮出转账记录", "Stella掏出手机亮出转账记录");
  const inspected = inspectCreativeCandidates([screenDriven]);
  assert.deepEqual(inspected.candidates.map((item) => item.id), []);
  assert.match(inspected.rejections[0].reason, /手机|账单|账本|屏幕/);
});

test("候选必须以单一场景中的核心事件为标题与完整事件边界", () => {
  const focused = candidate("focused", "anchored", "订婚宴揭穿替身", "女主举起替身证据");
  const sceneHopping = { ...candidate("scene-hopping", "migrated", "医院揭露秘密", "女主冲进病房"), scene: "", singleScene: false };
  const inspected = inspectCreativeCandidates([focused, sceneHopping]);
  assert.deepEqual(inspected.candidates.map((item) => item.id), ["focused"]);
  assert.match(inspected.rejections[0].reason, /场景|核心事件/);
});

test("浏览器恢复候选时会丢弃旧版未经过质量校验的缓存", () => {
  const legacy = candidate("legacy", "anchored", "旧版候选", "女主推开会议室门");
  delete legacy.causalChain;
  delete legacy.logicScore;
  delete legacy.familiarityScore;
  delete legacy.genreFitScore;
  delete legacy.productionFeasibilityScore;
  assert.deepEqual(restoreCreativeCandidates([legacy]), []);
});

test("轻量候选保留三种创意距离和可锁定维度", () => {
  const parsed = parseCreativeCandidates([
    { ...candidate("a", "anchored", "原剧情放大", "当众撕掉邀请函"), locks: { audiencePromise: true, worldRules: true } },
    candidate("b", "migrated", "关系迁移", "陌生人按停电梯"),
    candidate("c", "wild", "想象突破", "整面镜子同时碎裂"),
  ]);

  assert.deepEqual(parsed.map((item) => item.lane), ["anchored", "migrated", "wild"]);
  assert.equal(parsed[0].locks.audiencePromise, true);
  assert.equal(parsed[0].locks.worldRules, true);
  assert.equal(parsed[0].premise, "原剧情放大的一句话创意");
});

test("候选合并按创意指纹去重而不是只比较标题", () => {
  const first = parseCreativeCandidates([candidate("a", "anchored", "标题甲", "当众撕掉邀请函")]);
  const duplicate = candidate("b", "migrated", "完全不同的标题", "当众撕掉邀请函");
  const distinct = candidate("c", "wild", "全新方向", "电梯突然坠停", "未知规则");
  const merged = mergeCreativeCandidates(first, parseCreativeCandidates([duplicate, distinct]), 24);

  assert.deepEqual(merged.map((item) => item.title), ["标题甲", "全新方向"]);
});
