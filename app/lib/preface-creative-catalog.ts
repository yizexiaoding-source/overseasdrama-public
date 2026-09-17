import type { PrefaceConflictUnit, PrefaceCreativeInput } from "./preface-creative-domain";

export type CreativeTagAxis = "题材类型" | "人物关系" | "世界观" | "人物设定";
export type CreativeTagState = "recommended" | "locked" | "excluded";
export type CreativeTagSource = "user" | "ai";
export type HierarchicalTagGroup = { group: string; tags: readonly string[] };

export type CreativeTag = {
  id: string;
  axis: CreativeTagAxis;
  group: string;
  label: string;
  reason: string;
  confidence: number;
  impact: string;
  compatibleHooks: string[];
  conflicts: string[];
  source: CreativeTagSource;
};

export const genreTagGroups = [
  { group: "核心题材", tags: ["都市", "爱情", "家庭", "现实题材", "女性觉醒", "成长", "复仇", "甜爽复仇", "救赎", "重生", "逆袭", "逆风翻盘", "事业", "生存", "冒险", "悬疑", "动作", "战斗", "权力斗争", "宫斗", "豪门千金", "拯救世界", "热血", "群像"] },
  { group: "爱情题材 / 情感类型", tags: ["甜宠", "浪漫喜剧", "爱情拉扯", "慢热爱情", "二次爱情", "女性主导爱情", "多角恋爱", "LGBT+爱情", "虐恋", "禁忌爱情"] },
  { group: "剧情驱动类型", tags: ["身份秘密", "误会", "背叛", "欺骗", "被陷害", "失而复得", "久别重逢", "破镜重圆", "逃离 / 挣脱束缚", "悔恨", "残酷命运", "高风险危机", "剧情反转", "非常规脑洞", "复盘 / 回顾"] },
  { group: "情绪与观看体验", tags: ["治愈", "甜", "辣感 / 强刺激", "爽剧", "戏剧性", "悲剧结局（BE）"] },
] as const satisfies readonly HierarchicalTagGroup[];

export const relationshipTagGroups = [
  { group: "婚恋关系", tags: ["先婚后爱", "闪婚", "契约恋爱", "一夜情", "暗恋", "一见钟情", "灵魂伴侣", "旧爱复合", "二次爱情", "双向爱情", "恋人", "强制爱", "虐恋关系"] },
  { group: "情感结构", tags: ["三角恋", "多角恋", "后宫", "万人迷 / 团宠式爱情", "爱情拉扯", "慢热感情", "女性主导恋爱", "势均力敌情侣", "禁忌关系"] },
  { group: "身份差异型关系", tags: ["年龄差", "阶级差", "跨物种恋爱", "LGBT+关系", "权力不对等关系"] },
  { group: "家庭 / 血缘关系", tags: ["家庭关系", "母子 / 母女关系", "秘密宝宝", "萌宝", "隐秘亲子关系"] },
  { group: "关系冲突状态", tags: ["误会", "背叛", "欺骗", "分离", "重逢", "破镜重圆", "有毒关系", "虐待关系", "爱情纠葛"] },
] as const satisfies readonly HierarchicalTagGroup[];

export const worldViewTagGroups = [
  { group: "现实世界背景", tags: ["都市", "上流社会", "乡村", "80 / 90年代", "民国", "欧洲复古", "古代东方", "黑帮世界", "皇室社会"] },
  { group: "东方幻想体系", tags: ["东方幻想", "仙侠", "神仙世界", "妖魔世界", "超自然力量"] },
  { group: "西方幻想体系", tags: ["西方幻想", "西方神话", "狼人", "吸血鬼", "龙族", "法师", "超自然生物"] },
  { group: "科幻 / 系统类世界", tags: ["人工智能", "系统世界", "机械世界", "超能力", "超级英雄", "末日世界"] },
  { group: "时空类世界观", tags: ["穿越", "异世界穿越", "重生"] },
  { group: "特殊社会 / 权力结构", tags: ["皇室", "宫廷", "上流社会", "黑帮", "权力争夺", "贵族 / 精英阶层"] },
] as const satisfies readonly HierarchicalTagGroup[];

export const characterSettingTagGroups = [
  { group: "主角定位", tags: ["女主角", "另类女主", "女性主导型主角", "天才", "强者 / 战力天花板", "草根", "弱者逆袭型人物", "精英", "青少年", "中年人"] },
  { group: "财富 / 阶层身份", tags: ["总裁 / 亿万富豪", "豪门继承人", "千金", "平民", "统治者", "皇室成员", "王妃", "落魄家族", "上流社会人士"] },
  { group: "职业 / 社会身份", tags: ["战争英雄", "将军", "神医", "超级明星", "家庭主妇", "职业女性", "母亲", "情人 / 恋人"] },
  { group: "性格 / 人物原型", tags: ["坏男孩", "Alpha型角色", "甜心", "古灵精怪女主", "万人迷", "灰姑娘型人物", "弱者逆袭型人物", "天才型人物", "强势人物"] },
  { group: "特殊身份", tags: ["隐藏身份", "替身", "秘密孩子", "超能力者", "超级英雄", "狼人", "吸血鬼", "神祇", "恶魔", "法师", "异种族角色"] },
] as const satisfies readonly HierarchicalTagGroup[];

export const baseTagGroups = [
  { axis: "题材类型" as const, group: "题材一级分类", tags: genreTagGroups.map((item) => item.group) },
  ...genreTagGroups.map((item) => ({ axis: "题材类型" as const, ...item })),
  ...relationshipTagGroups.map((item) => ({ axis: "人物关系" as const, ...item })),
  ...worldViewTagGroups.map((item) => ({ axis: "世界观" as const, ...item })),
  ...characterSettingTagGroups.map((item) => ({ axis: "人物设定" as const, ...item })),
] as const;

export type StandardTagDefinition = {
  code: string; name: string; axis: string; group: string; description: string; multiSelect: boolean;
  compatibleGenres: string[]; compatibleRelationships: string[]; compatibleWorldViews: string[]; compatibleCharacters: string[];
  conflictIntensity: number; emotionIntensity: number; firstScreenVisibility: number; shootingDifficulty: number; productionCost: number; handoffAbility: number;
  exclusiveTags: string[]; recommendedCombinations: string[]; forbiddenCombinations: string[]; synonyms: string[];
  dataSource: string; confidence: number; confirmationState: "系统推荐" | "用户锁定" | "用户排除"; version: string;
};

export const standardTagCatalog: StandardTagDefinition[] = baseTagGroups.flatMap((section, sectionIndex) => section.tags.map((name, tagIndex) => ({
  code: `preface-tag-${String(sectionIndex + 1).padStart(2, "0")}-${String(tagIndex + 1).padStart(2, "0")}`,
  name, axis: section.axis, group: section.group, description: `${section.group}标准标签：${name}`, multiSelect: true,
  compatibleGenres: [], compatibleRelationships: [], compatibleWorldViews: [], compatibleCharacters: [],
  conflictIntensity: 0, emotionIntensity: 0, firstScreenVisibility: 0, shootingDifficulty: 0, productionCost: 0, handoffAbility: 0,
  exclusiveTags: [], recommendedCombinations: [], forbiddenCombinations: [], synonyms: [], dataSource: "专业方案标准标签库",
  confidence: 0, confirmationState: "系统推荐" as const, version: "preface-tag-v1",
})));

const tag = (id: string, axis: CreativeTagAxis, group: string, label: string, source: CreativeTagSource, confidence: number, reason: string, impact: string, hooks: string[], conflicts: string[] = []): CreativeTag => ({
  id, axis, group, label, source, confidence, reason, impact, compatibleHooks: hooks, conflicts,
});

export const genreOptions = genreTagGroups.map((item) => item.group);
export const worldViewOptions = worldViewTagGroups.flatMap((item) => item.tags);

export function genreOptionsForCategory(category: string): string[] {
  return [...(genreTagGroups.find((item) => item.group === category)?.tags || [])];
}

type TagSelection = { genre?: string; genreTags?: string[]; worldViewTags?: string[]; relationshipTags?: string[]; characterSettingTags?: string[] };

function groupFor(axis: CreativeTagAxis, label: string) {
  const groups = axis === "题材类型" ? genreTagGroups : axis === "人物关系" ? relationshipTagGroups : axis === "世界观" ? worldViewTagGroups : axis === "人物设定" ? characterSettingTagGroups : [];
  return groups.find((item) => (item.tags as readonly string[]).includes(label))?.group || (axis === "题材类型" ? "题材一级分类" : "");
}

export function buildUserSelectedCreativeTags(selection: TagSelection): CreativeTag[] {
  const rows: Array<[CreativeTagAxis, string]> = [
    ...(selection.genre ? [["题材类型", selection.genre] as [CreativeTagAxis, string]] : []),
    ...(selection.genreTags || []).map((label) => ["题材类型", label] as [CreativeTagAxis, string]),
    ...(selection.worldViewTags || []).map((label) => ["世界观", label] as [CreativeTagAxis, string]),
    ...(selection.relationshipTags || []).map((label) => ["人物关系", label] as [CreativeTagAxis, string]),
    ...(selection.characterSettingTags || []).map((label) => ["人物设定", label] as [CreativeTagAxis, string]),
  ];
  return rows.map(([axis, label], index) => tag(`user-${index + 1}`, axis, groupFor(axis, label), label, "user", 100, "用户在创作任务中明确选择", "作为AI匹配与后续生成的锁定边界", ["由AI结合完整任务判断"]));
}

export function parseAiTagRecommendations(value: unknown, selection: TagSelection): CreativeTag[] {
  const selected = new Set(buildUserSelectedCreativeTags(selection).map((item) => `${item.axis}:${item.label}`));
  const allowed = new Set(baseTagGroups.flatMap((item) => item.tags.map((label) => `${item.axis}:${label}`)));
  const list = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return list.flatMap((entry, index) => {
    const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const axis = String(row.axis || "") as CreativeTagAxis;
    const label = String(row.label || "").trim();
    const key = `${axis}:${label}`;
    if (!allowed.has(key) || selected.has(key) || seen.has(key)) return [];
    seen.add(key);
    return [tag(
      `ai-${index + 1}`, axis, groupFor(axis, label), label, "ai",
      Math.max(0, Math.min(100, Number(row.confidence || 0))),
      String(row.reason || "AI根据已选标签与剧情简介推荐"),
      String(row.impact || "补充人物关系、世界规则或角色冲突信息"),
      Array.isArray(row.compatibleHooks) ? row.compatibleHooks.map(String).filter(Boolean) : ["由AI结合完整任务判断"],
      Array.isArray(row.conflicts) ? row.conflicts.map(String).filter(Boolean) : [],
    )];
  });
}

export const hookFamilies = [
  { family: "人物关系钩子", types: ["出轨抓现行", "替代者占位", "分手", "离婚", "前任重逢", "强制婚姻", "禁忌关系", "吃醋占有", "误认关系"] },
  { family: "身份地位钩子", types: ["隐藏大佬", "阶级羞辱", "资格剥夺", "冒名顶替", "身份错位", "秘密亲子"] },
  { family: "高冲突事件钩子", types: ["婚礼事故", "怀孕事件", "事故或死亡", "被赶走", "被开除", "被诬陷", "财产争夺", "限时危机"] },
  { family: "信息差悬念钩子", types: ["异常行为", "异常物件", "偷听秘密", "半截真相", "匿名消息", "记忆缺失"] },
  { family: "情绪刺激钩子", types: ["极致羞辱", "爽感打脸", "复仇期待", "追妻后悔", "保护欲", "不可逆后悔"] },
  { family: "权力利益钩子", types: ["权力剥夺", "继承争夺", "财富羞辱", "权威挑战"] },
  { family: "特殊机制钩子", types: ["系统任务", "强制情侣", "重生", "穿越", "超能力觉醒", "命定伴侣识别", "时间循环", "倒计时规则"] },
  { family: "视觉行为钩子", types: ["推门", "摘婚戒", "扔戒指", "撕协议", "摔照片", "泼酒", "打翻蛋糕", "抢手机", "拖走行李", "跪下", "冲入婚礼", "拦车", "保镖拦人", "管家开门", "众人起立", "董事会沉默", "记者围堵", "豪车停下", "司机开门", "合同被推到面前", "眼泪落下", "冷笑", "手指发抖", "后退", "突然松手", "转身离开", "跪下请求", "强忍情绪", "婚戒", "照片", "孕检报告", "亲子报告", "遗嘱", "邀请函", "钥匙", "项链", "合同", "股权文件"] },
] as const;

export const hookFormats = ["对白暴击型", "结果先行型", "异常画面型", "公开羞辱型", "证据物件型", "突发闯入型", "倒计时型", "两难选择型", "误会视角型", "一句秘密型", "关系反差型", "身份反差型"] as const;

export const hookDirectionOptions = [
  { id: "relationship-break", label: "关系突然破裂", description: "亲密、家庭或合作关系在事件中突然翻脸", example: "婚礼开始前，新郎当众取消婚约", family: "人物关系钩子", type: "关系破裂" },
  { id: "status-reversal", label: "身份或资格反转", description: "人物的身份、位置或资格突然被揭露或夺走", example: "董事会开场便撤销继承资格", family: "身份地位钩子", type: "资格反转" },
  { id: "interest-loss", label: "利益遭到抢夺", description: "财产、机会、权力或重要资源正在被夺走", example: "遗嘱宣读时，全部股份转给陌生人", family: "权力利益钩子", type: "利益抢夺" },
  { id: "immediate-danger", label: "危险立即发生", description: "人物一出场就面对追捕、驱逐、事故或倒计时", example: "安全门即将关闭，她却被留在门外", family: "高冲突事件钩子", type: "即时危险" },
  { id: "partial-truth", label: "真相只揭一半", description: "证据或秘密已经出现，但原因暂时不解释", example: "亲子报告上只露出一个熟悉的姓氏", family: "信息差悬念钩子", type: "半截真相" },
  { id: "forced-choice", label: "人物被迫选择", description: "人物必须当场在关系、利益或后果之间作决定", example: "签下协议就能救孩子，但必须永远离开", family: "情绪刺激钩子", type: "两难选择" },
] as const;

export const hookAxisOptions = [
  { axis: "人物关系钩子", description: "让关系变化在第一个动作里被看懂" },
  { axis: "情绪钩子", description: "先让观众感到羞辱、恐惧、心碎或复仇期待" },
  { axis: "情节事件钩子", description: "用一个可见事件立刻推动人物行动" },
  { axis: "身份权力钩子", description: "让资格、身份或决定权当场发生变化" },
  { axis: "信息悬念钩子", description: "露出一半真相，让观众追问原因" },
] as const;

export const hookRecipeOptions = [
  ["人物关系钩子", hookFamilies.find((item) => item.family === "人物关系钩子")?.types || []],
  ["情绪钩子", ["极致羞辱", "保护欲", "心碎后反击", "复仇期待", "不可逆后悔"]],
  ["情节事件钩子", ["被赶走", "重要物品被夺", "强行阻拦", "限时危机", "被迫选择"]],
  ["身份权力钩子", ["资格剥夺", "身份揭露", "权力反转", "冒名顶替", "阶级羞辱"]],
  ["信息悬念钩子", ["半截真相", "秘密泄露", "误会反转", "异常行为", "关键人物闯入"]],
] as const;

export const hookEndingOptions = ["AI自动安排", "动作即将完成时切断", "身份即将揭晓时切断", "人物尚未做出选择", "后果即将发生时切断", "关键人物突然出现"] as const;

export type HookPairOption = {
  id: string;
  title: string;
  description: string;
  hook: { id: string; label: string; family: string; type: string };
  openingHook: { type: string; visibleAction: string; firstQuestion: string };
  middleEscalation: string;
  endingHook: { type: string; lastVisibleAction: string; lastDialogue: string; imminentConsequence: string; unansweredQuestion: string; handoffVisual: string };
  recommendationReason?: string;
};

const hookPairCatalog: HookPairOption[] = [
  { id: "relationship-break", title: "关系爆破", description: "先让关系边界被打破，再停在人物即将公开选择的瞬间。", hook: { id: "relationship-break", label: "关系公开爆破", family: "人物关系钩子", type: "关系破裂" }, openingHook: { type: "关系边界被打破", visibleAction: "一方用身体动作阻断、夺回或否认一段关系", firstQuestion: "他们之间究竟是什么关系？" }, middleEscalation: "被阻拦的人立即反向行动，让关系无法继续隐藏。", endingHook: { type: "人物选择前切断", lastVisibleAction: "行动主体朝被保护或被否认的人伸出手", lastDialogue: "用一句自然对白明确立场但不解释背景", imminentConsequence: "这次公开选择将立刻改变原有关系", unansweredQuestion: "人物会为这次选择付出什么代价？", handoffVisual: "反对者刚要采取下一步行动时切入正片" } },
  { id: "identity-reveal", title: "身份谜面", description: "先让身份线索失控露出，再停在真相即将被确认之前。", hook: { id: "identity-reveal", label: "身份线索暴露", family: "身份地位钩子", type: "身份揭露" }, openingHook: { type: "身份线索被撞见", visibleAction: "人物当众抢回、遮住或认出一件暴露身份的实物", firstQuestion: "他／她究竟是谁？" }, middleEscalation: "目击者逼近追问，行动主体必须立刻阻止身份被确认。", endingHook: { type: "真相确认前切断", lastVisibleAction: "目击者伸手揭开最后一层遮掩", lastDialogue: "一句认出身份前的短促质问", imminentConsequence: "身份一旦确认，现场关系将立刻翻转", unansweredQuestion: "隐藏身份究竟会改变谁的命运？", handoffVisual: "关键证据刚被碰到时切入正片" } },
  { id: "power-reversal", title: "权力反转", description: "先发生资格或控制权变化，再停在反转即将落地的动作上。", hook: { id: "power-reversal", label: "权力当场反转", family: "身份地位钩子", type: "权力反转" }, openingHook: { type: "资格或控制权变化", visibleAction: "掌权者当众夺走位置、资格或决定权", firstQuestion: "谁真正拥有决定权？" }, middleEscalation: "被压制的人以可见行动夺回主动权，并迫使现场人物表态。", endingHook: { type: "反转落地前切断", lastVisibleAction: "行动主体完成最后一步夺权动作", lastDialogue: "一句改变现场权力关系的短对白", imminentConsequence: "原掌权者即将失去控制", unansweredQuestion: "真正的身份或权力归属是什么？", handoffVisual: "现场所有人转向新的行动主体时切入正片" } },
  { id: "event-crisis", title: "事件危机", description: "先让危机直接发生，再停在后果不可逆之前。", hook: { id: "event-crisis", label: "危机立即发生", family: "高冲突事件钩子", type: "即时危险" }, openingHook: { type: "危机突然发生", visibleAction: "人物被拦、被带走或重要行动被强行打断", firstQuestion: "人物能否阻止眼前的后果？" }, middleEscalation: "人物马上反抗或营救，让危机从个人升级为公开冲突。", endingHook: { type: "后果发生前切断", lastVisibleAction: "人物扑向即将关闭、带走或摧毁的目标", lastDialogue: "一句阻止后果的短促喊话", imminentConsequence: "下一秒将发生不可逆后果", unansweredQuestion: "人物能否及时阻止？", handoffVisual: "最后动作尚未完成时切入正片" } },
  { id: "secret-gap", title: "秘密露角", description: "先让观众看见不该出现的线索，再停在人物即将说破的瞬间。", hook: { id: "secret-gap", label: "秘密只露一角", family: "信息差悬念钩子", type: "半截真相" }, openingHook: { type: "异常线索被发现", visibleAction: "人物突然夺走、藏起或撕开一件让旁人起疑的实物", firstQuestion: "这条线索到底说明了什么？" }, middleEscalation: "发现线索的人不肯退让，迫使隐藏者做出更激烈的反应。", endingHook: { type: "真相说破前切断", lastVisibleAction: "知情者逼近，准备说出关键事实", lastDialogue: "一句只说到一半的真相", imminentConsequence: "被隐藏的事实即将改变所有人的判断", unansweredQuestion: "被隐瞒的真相是什么？", handoffVisual: "知情者开口的瞬间切入正片" } },
  { id: "emotional-choice", title: "情绪抉择", description: "先让人物为爱、保护或复仇做出反常行动，再停在代价即将落下之前。", hook: { id: "emotional-choice", label: "情绪选择失控", family: "情绪刺激钩子", type: "被迫选择" }, openingHook: { type: "情绪驱动的反常行动", visibleAction: "人物冲上前保护、推开、放开或当众拒绝重要的人", firstQuestion: "他／她为什么要做出这个选择？" }, middleEscalation: "另一方用更高代价逼迫行动主体收回选择。", endingHook: { type: "代价落下前切断", lastVisibleAction: "行动主体仍不松手，准备承担后果", lastDialogue: "一句明确选择但不解释过去的短对白", imminentConsequence: "这次选择将造成无法挽回的关系或利益损失", unansweredQuestion: "他／她会失去什么？", handoffVisual: "反对者准备兑现代价时切入正片" } },
  { id: "rule-anomaly", title: "规则异变", description: "先让世界规则在人物身上异常生效，再停在规则后果爆发之前。", hook: { id: "rule-anomaly", label: "规则突然失控", family: "特殊机制钩子", type: "规则异常" }, openingHook: { type: "世界规则异常生效", visibleAction: "人物身上的标记、力量或规则反应迫使现场所有人后退或让路", firstQuestion: "这条规则为什么偏偏在他／她身上失效？" }, middleEscalation: "人物立刻用行动压住或利用异常，其他人被迫按规则站队。", endingHook: { type: "规则后果前切断", lastVisibleAction: "异常力量或规则即将完成最后一次反应", lastDialogue: "一句点出规则代价的短对白", imminentConsequence: "规则后果将彻底改变人物之间的立场", unansweredQuestion: "异常会带来什么代价？", handoffVisual: "规则反应即将完成时切入正片" } },
];

type HookRecommendationInput = Pick<PrefaceCreativeInput, "genre" | "genreTags" | "worldView" | "worldViewTags" | "relationshipTags" | "characterSettingTags" | "plotSynopsis" | "targetBrief">;

const hookEngineSignals: Record<string, { terms: string[]; reason: string }> = {
  "relationship-break": { terms: ["爱情", "恋", "婚", "家庭", "亲子", "母", "父", "关系", "背叛", "分离", "重逢", "禁忌"], reason: "当前关系标签适合先用人物动作把关系边界打破" },
  "identity-reveal": { terms: ["身份", "隐藏", "替身", "继承", "千金", "皇室", "秘密孩子", "秘密宝宝", "阶级"], reason: "当前人设或剧情线索适合先露出身份谜面" },
  "power-reversal": { terms: ["权力", "总裁", "豪门", "继承", "统治", "宫廷", "黑帮", "上流", "资格", "强势"], reason: "当前权力或阶层结构适合直接让控制权变化" },
  "event-crisis": { terms: ["危机", "生存", "战斗", "动作", "逃离", "事故", "拯救", "末日", "追", "险"], reason: "当前事件线索适合先让不可逆后果逼近" },
  "secret-gap": { terms: ["悬疑", "秘密", "误会", "欺骗", "身份秘密", "线索", "真相", "记忆", "被陷害"], reason: "当前题材适合先让观众看到一角秘密" },
  "emotional-choice": { terms: ["复仇", "救赎", "悔恨", "虐恋", "保护", "治愈", "甜", "心", "牺牲", "选择"], reason: "当前情绪承诺适合以反常选择建立牵引" },
  "rule-anomaly": { terms: ["狼人", "吸血鬼", "龙族", "法师", "神", "恶魔", "超能力", "系统", "穿越", "重生", "幻想", "异种", "末日"], reason: "当前世界观适合先让规则异常作用于人物" },
};

export function recommendHookPairs(input: Partial<HookRecommendationInput>): HookPairOption[] {
  const source = [input.genre, ...(input.genreTags || []), input.worldView, ...(input.worldViewTags || []), ...(input.relationshipTags || []), ...(input.characterSettingTags || []), input.plotSynopsis, input.targetBrief]
    .filter(Boolean).join("、");
  const scored = hookPairCatalog.map((option, index) => {
    const signal = hookEngineSignals[option.id];
    const matches = signal.terms.filter((term) => source.includes(term)).length;
    const relationshipBonus = option.id === "relationship-break" ? (input.relationshipTags || []).length * 3 : 0;
    const characterBonus = option.id === "identity-reveal" ? (input.characterSettingTags || []).filter((tag) => /隐藏|替身|继承|千金|皇室|秘密/.test(tag)).length * 4 : 0;
    const mysteryGenreBonus = option.id === "secret-gap" ? (input.genreTags || []).filter((tag) => /悬疑|身份秘密|误会|欺骗|被陷害/.test(tag)).length * 3 : 0;
    const fantasyWorldBonus = option.id === "rule-anomaly" ? (input.worldViewTags || []).filter((tag) => /狼人|吸血鬼|龙族|法师|神|恶魔|超能力|系统|穿越|重生|幻想|异种|末日/.test(tag)).length * 5 : 0;
    const score = 1 + matches * 4 + relationshipBonus + characterBonus + mysteryGenreBonus + fantasyWorldBonus;
    return { option, index, score, reason: matches || relationshipBonus || characterBonus ? signal.reason : "作为与当前剧情不同的备选开场方向" };
  }).sort((left, right) => right.score - left.score || left.index - right.index);
  return scored.slice(0, 3).map(({ option, reason }) => ({ ...option, hook: { ...option.hook }, openingHook: { ...option.openingHook }, endingHook: { ...option.endingHook }, recommendationReason: reason }));
}

// 保留基础三组，供旧数据、测试与无任务上下文时使用；工作流页面改由 recommendHookPairs 动态取三组。
export const hookPairOptions = hookPairCatalog.filter((item) => ["relationship-break", "power-reversal", "event-crisis"].includes(item.id));

function conflictUnit(value: Partial<PrefaceConflictUnit>, index: number): PrefaceConflictUnit {
  return {
    id: String(value.id || `direction-${index + 1}`),
    direction: String(value.direction || "关系或利益受到挑战"),
    powerStructure: String(value.powerStructure || "个人与个人、群体或规则之间存在力量失衡"),
    audienceQuestion: String(value.audienceQuestion || "接下来谁会先行动，局面会如何改变？"),
  };
}

export function parseConflictUnits(value: unknown): PrefaceConflictUnit[] {
  const list = Array.isArray(value) ? value : [];
  return list.slice(0, 5).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const unit = conflictUnit(item as Partial<PrefaceConflictUnit>, index);
    return unit.direction ? [unit] : [];
  });
}

export function buildConflictUnits(input: Pick<PrefaceCreativeInput, "conflictUnits" | "genreTags" | "worldViewTags" | "relationshipTags" | "targetBrief" | "preferredTransitionAnchor">): PrefaceConflictUnit[] {
  const fromAi = parseConflictUnits(input.conflictUnits);
  if (fromAi.length) return fromAi;
  const relationship = input.relationshipTags?.join("、") || "当前人物关系";
  const theme = input.genreTags?.join("、") || "当前题材";
  const world = input.worldViewTags?.join("、") || "当前世界观";
  return [
    conflictUnit({ direction: `${relationship}中的位置或信任受到挑战`, powerStructure: "人物之间或人物与群体之间出现明显失衡", audienceQuestion: "谁在推动这场变化，行动主体会如何回应？" }, 0),
    conflictUnit({ direction: `${theme}中的身份、资格或关键利益发生动摇`, powerStructure: `${world}中的规则、资源或权力正在影响人物选择`, audienceQuestion: "人物能否夺回主动权，隐藏原因是什么？" }, 1),
    conflictUnit({ direction: "异常线索让原有关系或判断开始失效", powerStructure: "人物面对未知信息、秘密或规则带来的压力", audienceQuestion: "线索意味着什么，真相会改变谁的命运？" }, 2),
  ];
}

export const scoreWeights = { 前三秒停留能力: 15, 人物关系理解速度: 10, 冲突清晰度: 10, 冲突升级强度: 10, 主角能动性: 10, 观众情绪强度: 10, 终局动作的因果合理性: 10, 正片承接自然度: 10, 画面可视化程度: 5, 候选差异度: 5, 制作可执行性: 5 } as const;
