import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const {
  genreTagGroups,
  relationshipTagGroups,
  worldViewTagGroups,
  characterSettingTagGroups,
  buildUserSelectedCreativeTags,
  parseAiTagRecommendations,
} = await import("../app/lib/preface-creative-catalog.ts");

test("题材标签两级分类与文档完全一致，并与人物关系标签分离", () => {
  assert.deepEqual(genreTagGroups, [
    { group: "核心题材", tags: ["都市", "爱情", "家庭", "现实题材", "女性觉醒", "成长", "复仇", "甜爽复仇", "救赎", "重生", "逆袭", "逆风翻盘", "事业", "生存", "冒险", "悬疑", "动作", "战斗", "权力斗争", "宫斗", "豪门千金", "拯救世界", "热血", "群像"] },
    { group: "爱情题材 / 情感类型", tags: ["甜宠", "浪漫喜剧", "爱情拉扯", "慢热爱情", "二次爱情", "女性主导爱情", "多角恋爱", "LGBT+爱情", "虐恋", "禁忌爱情"] },
    { group: "剧情驱动类型", tags: ["身份秘密", "误会", "背叛", "欺骗", "被陷害", "失而复得", "久别重逢", "破镜重圆", "逃离 / 挣脱束缚", "悔恨", "残酷命运", "高风险危机", "剧情反转", "非常规脑洞", "复盘 / 回顾"] },
    { group: "情绪与观看体验", tags: ["治愈", "甜", "辣感 / 强刺激", "爽剧", "戏剧性", "悲剧结局（BE）"] },
  ]);
  assert.notDeepEqual(genreTagGroups, relationshipTagGroups);
});

test("人物关系两级标签与文档完全一致", () => {
  assert.deepEqual(relationshipTagGroups, [
    { group: "婚恋关系", tags: ["先婚后爱", "闪婚", "契约恋爱", "一夜情", "暗恋", "一见钟情", "灵魂伴侣", "旧爱复合", "二次爱情", "双向爱情", "恋人", "强制爱", "虐恋关系"] },
    { group: "情感结构", tags: ["三角恋", "多角恋", "后宫", "万人迷 / 团宠式爱情", "爱情拉扯", "慢热感情", "女性主导恋爱", "势均力敌情侣", "禁忌关系"] },
    { group: "身份差异型关系", tags: ["年龄差", "阶级差", "跨物种恋爱", "LGBT+关系", "权力不对等关系"] },
    { group: "家庭 / 血缘关系", tags: ["家庭关系", "母子 / 母女关系", "秘密宝宝", "萌宝", "隐秘亲子关系"] },
    { group: "关系冲突状态", tags: ["误会", "背叛", "欺骗", "分离", "重逢", "破镜重圆", "有毒关系", "虐待关系", "爱情纠葛"] },
  ]);
});

test("世界观两级标签与文档完全一致", () => {
  assert.deepEqual(worldViewTagGroups, [
    { group: "现实世界背景", tags: ["都市", "上流社会", "乡村", "80 / 90年代", "民国", "欧洲复古", "古代东方", "黑帮世界", "皇室社会"] },
    { group: "东方幻想体系", tags: ["东方幻想", "仙侠", "神仙世界", "妖魔世界", "超自然力量"] },
    { group: "西方幻想体系", tags: ["西方幻想", "西方神话", "狼人", "吸血鬼", "龙族", "法师", "超自然生物"] },
    { group: "科幻 / 系统类世界", tags: ["人工智能", "系统世界", "机械世界", "超能力", "超级英雄", "末日世界"] },
    { group: "时空类世界观", tags: ["穿越", "异世界穿越", "重生"] },
    { group: "特殊社会 / 权力结构", tags: ["皇室", "宫廷", "上流社会", "黑帮", "权力争夺", "贵族 / 精英阶层"] },
  ]);
});

test("人物设定两级标签与文档完全一致", () => {
  assert.deepEqual(characterSettingTagGroups, [
    { group: "主角定位", tags: ["女主角", "另类女主", "女性主导型主角", "天才", "强者 / 战力天花板", "草根", "弱者逆袭型人物", "精英", "青少年", "中年人"] },
    { group: "财富 / 阶层身份", tags: ["总裁 / 亿万富豪", "豪门继承人", "千金", "平民", "统治者", "皇室成员", "王妃", "落魄家族", "上流社会人士"] },
    { group: "职业 / 社会身份", tags: ["战争英雄", "将军", "神医", "超级明星", "家庭主妇", "职业女性", "母亲", "情人 / 恋人"] },
    { group: "性格 / 人物原型", tags: ["坏男孩", "Alpha型角色", "甜心", "古灵精怪女主", "万人迷", "灰姑娘型人物", "弱者逆袭型人物", "天才型人物", "强势人物"] },
    { group: "特殊身份", tags: ["隐藏身份", "替身", "秘密孩子", "超能力者", "超级英雄", "狼人", "吸血鬼", "神祇", "恶魔", "法师", "异种族角色"] },
  ]);
});

test("用户选择被锁定，AI只保留标签库中尚未选择的推荐", () => {
  const selected = { genre: "核心题材", genreTags: ["爱情"], worldViewTags: ["都市"], relationshipTags: ["闪婚"], characterSettingTags: ["女主角"] };
  const userTags = buildUserSelectedCreativeTags(selected);
  const aiTags = parseAiTagRecommendations([
    { axis: "人物关系", label: "闪婚", reason: "重复项", confidence: 99 },
    { axis: "人物关系", label: "先婚后爱", reason: "关系升级清晰", confidence: 91 },
    { axis: "世界观", label: "上流社会", reason: "适配权力冲突", confidence: 88 },
    { axis: "人物设定", label: "豪门继承人", reason: "适配身份冲突", confidence: 90 },
    { axis: "人物设定", label: "不存在的标签", reason: "越界项", confidence: 100 },
  ], selected);

  assert.deepEqual(userTags.map((item) => [item.axis, item.label, item.source]), [
    ["题材类型", "核心题材", "user"], ["题材类型", "爱情", "user"], ["世界观", "都市", "user"], ["人物关系", "闪婚", "user"], ["人物设定", "女主角", "user"],
  ]);
  assert.deepEqual(aiTags.map((item) => [item.axis, item.label, item.source]), [
    ["人物关系", "先婚后爱", "ai"], ["世界观", "上流社会", "ai"], ["人物设定", "豪门继承人", "ai"],
  ]);
});

test("模型限流时会重试并返回可识别的 429 提示", async () => {
  const route = await readFile(new URL("../app/api/preface-creative/analyze/route.ts", import.meta.url), "utf8");
  assert.match(route, /MODEL_RATE_LIMIT_RETRIES/);
  assert.match(route, /status: 429/);
  assert.match(route, /Retry-After/);
});
