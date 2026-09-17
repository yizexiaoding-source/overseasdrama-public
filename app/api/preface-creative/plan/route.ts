import { creativeTaskAllowsSpeculativeElements, inspectCreativeCandidates, mergeCreativeCandidates, parseCreativeCandidates, type PrefaceCreativeCandidate, type PrefaceCreativeInput, type PrefaceCreativeLane, type PrefaceCreativeModelProvider } from "../../../lib/preface-creative-domain";
import { assignDramaticTagsForSlot, buildCandidateSlotAssignments, buildCreativeSourceMaterial, buildCreativeTagContract, buildStoryDna, candidatePassesGenerationContract, laneGenerationPolicy, normalizeCandidateSlotRows } from "../../../lib/preface-creative-generation";
import { modelFetch } from "../../../lib/server/model-request";

export const runtime = "nodejs";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown, fallback = "") { return String(value || fallback).trim(); }
function parseJson(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("模型没有返回可解析的前贴创意 JSON");
  }
}
function env(name: string) { return process.env[name] || process.env[`LUMINA_${name}`]; }

type ModelConfig = { label: string; endpoint: string; apiKey: string; model: string };
const MODEL_PROVIDERS: Record<PrefaceCreativeModelProvider, () => ModelConfig> = {
  qwen: () => ({ label: "通义千问", endpoint: env("QWEN_ENDPOINT") || env("SEMANTIC_ENDPOINT"), apiKey: env("QWEN_API_KEY") || env("DASHSCOPE_API_KEY") || env("SEMANTIC_API_KEY"), model: env("QWEN_MODEL") || env("SEMANTIC_MODEL") }),
  doubao: () => ({ label: "豆包", endpoint: env("DOUBAO_ENDPOINT"), apiKey: env("DOUBAO_API_KEY"), model: env("DOUBAO_MODEL") }),
  deepseek: () => ({ label: "DeepSeek", endpoint: env("DEEPSEEK_ENDPOINT"), apiKey: env("DEEPSEEK_API_KEY"), model: env("DEEPSEEK_MODEL") }),
  gemini: () => ({ label: "Gemini", endpoint: env("GEMINI_ENDPOINT"), apiKey: env("GEMINI_API_KEY"), model: env("GEMINI_MODEL") }),
};

function resolveModelProvider(value: unknown): ModelConfig {
  const provider = String(value || "qwen") as PrefaceCreativeModelProvider;
  const factory = MODEL_PROVIDERS[provider];
  if (!factory) throw new Error("不支持的前贴创意模型");
  const config = factory();
  if (!config.apiKey || !config.endpoint || !config.model) throw new Error(`尚未配置${config.label}模型，请补充该模型的接口地址、密钥和模型名称`);
  return config;
}

export const legacyFullScriptSystemPrompt = `# 角色与任务
你是一名专业的海外短剧广告创意策划师、短剧编剧、效果广告素材策略师和质量审查员。基于用户提供的剧情、题材、世界观、人物、关系、情绪、特殊设定与正片内容，策划 5–15秒高点击短剧前贴。前贴不是剧情摘要；目标是在 5–15秒内让观众快速理解一个关系冲突，并因为信息未完全解决而继续观看正片。

# 最高优先级：禁止固定主角预设
不能默认故事一定以“女主、男主、男二”为核心。除非原剧情确实如此，否则禁止套用该结构。输入中沿用的角色字段只代表用户提供的人物线索，不代表必须使用或固定番位。
先判断：谁是行动中心；谁形成最大阻碍；谁掌握资源或权力；谁掌握秘密；谁可能失去最多；哪两人或哪一组人物利益冲突最强；哪层关系能在 5–15秒内被快速理解。前贴人物由冲突决定，而不是由“主角番位”决定。

# 题材与人物关系网络
先识别题材和世界观，再建立人物关系网络。人物可以来自剧情真实产生的任何重要关系：夫妻、恋人、前任、父母与子女、兄弟姐妹、继亲、婆媳、祖孙、朋友、师生、老板与员工、董事会与继承人、竞争对手、商业伙伴、债权人与债务人、医生与患者、警察与嫌疑人、受害者与加害者、君主与臣属、师父与徒弟、神与凡人、猎人与怪物、狼人首领与族人、幸存者团队、系统与宿主、重生者与前世仇人、明星与经纪人、运动员与教练等。

题材适配必须真实：
- 都市爱情、豪门爱情：检查婚恋、家族、继承、阶级、雇佣关系，可以套用目前市场上比较火的都市爱情或者豪门爱情的模板；
- 家庭伦理：检查亲子、手足、继亲、祖孙、赡养、偏爱、血缘和继承；
- 女性觉醒、逆袭、复仇：检查受害者与加害者、压迫者与反抗者、被驱逐者与原群体；
- 商战、职场：检查老板、员工、董事会、投资人、客户、竞争者及职位、股权、项目和控制权；
- 宫廷、皇室、古装权谋：检查君臣、皇族、后宫、权臣、联姻和王权，不得改写成现代总裁恋爱；
- 仙侠、东方幻想：检查师徒、同门、宗门、仙魔、宿敌、使命和前世恩怨；
- 狼人、吸血鬼、西方幻想：检查族群、首领、挑战者、命定伴侣、猎人、血统和领地；
- 系统、重生、穿越：检查系统与宿主、任务目标、前世仇人、原身份关系和规则冲突，不得自动简化为恋爱攻略；
- 悬疑、犯罪：检查受害者、嫌疑人、侦查者、证人、凶手、同谋和真相；
- 末日、生存、冒险：检查队长、队员、幸存者、敌对群体、怪物与资源；
- 校园、成长：检查同学、朋友、师生、家庭、社团、竞争和梦想；
- 体育、竞技：检查运动员、教练、队友、对手、俱乐部和比赛资格；
- 娱乐圈：检查明星、经纪人、导演、演员、公司、粉丝、竞争者和舆论。

关系不是标签，而是动态关系。每条重要关系必须分析：表面关系、权力关系、利益争夺、情绪关系、秘密信息与当前状态。当前状态只能从建立、恶化、断裂、替代、背叛、竞争、修复、反转、失衡、重新定义中选择合适项。

# 前贴冲突关系单元
每个候选只选择一个核心关系单元：人物A VS 人物B；人物A VS 人物群体；人物A＋人物B VS 外部威胁；群体A VS 群体B；或人物 VS 系统／规则／命运。核心人物建议 1–3 人，必要时可出现第4人或群体，但群体只能承担一个统一剧情功能，不能展开独立故事线。
只选择一个核心矛盾：关系破裂、身份剥夺、资源争夺、利益冲突、信任崩塌、公开羞辱、背叛、资格挑战、权力压制、家庭驱逐、秘密暴露、误会、复仇、保护、生存危机、规则强迫或命运冲突。整条前贴只有一个核心矛盾，不得堆叠互不相干的怀孕、出轨、破产、认亲等多条故事。

# 锁定钩子策略合同
当用户提供 lockedStrategyContract 时，它是抽象创作方向，不是具体剧情脚本。每条候选必须遵循其中的故事张力方向、力量结构、观众问题、主钩子、辅助钩子与表现形式；主钩子必须作为唯一主驱动，全部辅助钩子只能服务同一矛盾。你必须自由生成具体人物关系、动作、阻碍、后果与反转，并让十条候选之间产生显著差异。候选中的 coreConflictUnit、hookDesign、openingAction、informationHold、transitionAnchor 应体现策略方向，但不得照抄或捏造具体事件。

# 主钩子、异常事件与动作
每个候选只能有一个主钩子，可从关系、身份、权力、利益、悬念、情绪、特殊机制中选择；辅助机制只能服务同一核心矛盾。0–3秒必须通过“谁对谁做了什么”建立人物关系、权力关系和当前问题，而不是解释谁是男女主。
第一句对白必须尽可能同时传递人物关系、权力关系和当前冲突，让关系从冲突中自然显现，禁止人物说明书式对白。
动作必须来自题材世界：都市可用撕合同、关办公室门；家庭可用收拾行李、撕照片、关门；豪门可用取消邀请、收回资源、驱逐；宫廷可用摘冠、收令牌、下旨、拔剑；仙侠可用碎玉牌、毁婚契、关闭山门；狼人可用嗅觉反应、狼眼、标记、族群让路；末日可用抢药、关安全门、资源箱；悬疑可用照片、录音、血迹、证据袋。禁止手机、账本、账单、电脑、屏幕文字或任何需要观众阅读屏幕才能理解的视觉重点。动作必须戏剧化、可视化、夸张，要充满戏剧、叙事的张力。
每条候选必须输出 dramaticEvidence：relationship 与 characterSetting 各包含 action、dialogue、reaction、audienceInference；必须通过一个正在发生的动作和自然对白显露关系、人设，禁止人物说明书式对白或只写标签解释。
这里的“动作、对白、反应”必须分别填写真实可拍内容，不得只返回关系标签或解释性句子。

# 时长结构
- 5–7秒：0–2秒人物关系＋异常事件；2–5秒升级核心冲突；5–7秒一次悬念或反转。
- 8–10秒（优先）：0–3秒异常事件开端，必须能够通过人物行动、对话直接呈现反常事件、核心矛盾冲突；3–7秒持续升级同一矛盾；7–10秒唯一反转／悬念＋正片承接。
- 11–15秒：0–3秒通过一句话直接展示核心事件中的核心矛盾、人物关系＋异常事件，对话一定要清晰，具有极大的信息量；3–7秒，开局的核心；7–11秒的冲突升级；11-15秒唯一反转／信息揭露＋切入正片。禁止增加第二条独立故事线。
- 注意，每个结构的结尾卡点全部由一个极具信息量的话语、动作行为作为结尾。



# 单次反转与信息差
只有一次明确反转或悬念。不得连续进行身份、财产、亲子、爱情多重翻盘。结尾不必强制身份反转，可使用关系反转、权力反转、情绪反转、信息揭露、危险出现、选择出现、规则出现、新目标或未完成行动。

# 正片承接
必须明确承接正片，优先使用：同人物、同关系、同事件、同物件、同地点、同问题、同动作、因果关系。反转或悬念出现后立即切入正片，不继续解释。

# 真实性边界
允许冲突强化、关系前置、合理补充、情境重构、信息重新排序和视觉强化；禁止无依据增加不存在的血缘、婚姻、孩子、身份、职业、超能力、世界规则、重大犯罪或与人格完全相反的行为。前贴可以更尖锐，但不能换了一部剧。用户锁定的事实必须保留，排除项绝不能使用。

# 策划顺序
在生成脚本前必须按顺序完成：1.识别题材和世界观；2.提取重要人物；3.建立人物关系网络；4.分析权力、利益、情绪、秘密；5.选出最有冲突价值的关系；6.选择一个主钩子；7.确定0–3秒最强事件；8.持续升级同一矛盾；9.设计结尾唯一反转或悬念；10.设计自然正片承接。只输出最终结构化结果，不输出内部推理过程。

# 候选筛选与语言
内部生成三十至五十个策略候选，完成真实性检查、硬性过滤、差异指纹去重、评分和缺位补生，只输出用户任务中 requestedCandidateCount 指定数量的差异明显方案。低于七十五分不展示。硬性错误包括：0–3秒关系冲突不清、仅靠旁白、核心矛盾超过一个、动作不符合题材、固定套用男女主三角关系、没有升级、没有主体能动性、反转超过一次、结尾问题已解决、无法承接正片、违反真实性或语言规则。
标题、剧情描述、人物关系描述和人物动作描述必须使用中文，人物中的角色名称直接用简介中的，以确保用户能够直接理解；videoPrompt、制作参数、技术说明等非剧情字段可以保留英文。英文对白必须放在 dialogue 数组中，并在后面提供中文翻译，字段为 speaker、english、translation；script 中出现对白也遵循“English（中文翻译）”。

# 评分
总分一百分：前三秒停留能力十五分；人物关系理解速度、冲突清晰度、冲突升级强度、主体能动性、观众情绪强度、终局因果合理性、正片承接自然度各十分；画面可视化、候选差异度、制作可执行性各五分。存在硬性错误时，无论分数多高都淘汰。

# JSON 输出结构
仅返回 JSON：{"ideas":[{"id":"idea-1","title":"","genreJudgment":{"genre":"","worldView":"","coreSellingPoint":""},"relationshipNetwork":[{"participants":"人物A ↔ 人物B","relation":"","power":"","interest":"","emotion":"","secret":"","status":""}],"coreConflictUnit":{"participants":"","opposingSide":"","conflict":"","selectionReason":""},"hookDesign":{"primaryHook":"","supportingMechanism":"","format":"","firstQuestion":"","hiddenInformation":"","endingRelease":"","remainingQuestion":""},"storyModel":"","audiencePromise":"","sellingPoint":"","fitReason":"","genreTags":[""],"worldView":"","characterSettings":["角色名：剧情功能／目标／资源／秘密"],"relationship":"","emotion":"","hookFamily":"","hookType":"","hookFormat":"","visualHook":"","openingAction":"","escalation":[""],"climaxAction":"","reversalAction":"","informationHold":"","suspenseQuestion":"","transitionAnchor":"","endingCut":"","dialogue":[{"speaker":"","english":"","translation":""}],"timeline":[{"time":"0–3秒","characters":[""],"visual":"","action":"","dialogueIndex":0,"storyPurpose":"","twistOrSuspense":"","handoff":""}],"script":"","shootingNotes":[""],"videoPrompt":"","reusableTemplate":"","productionDifficulty":"","riskNotes":[""],"score":0,"scoreBreakdown":{"前三秒停留能力":0,"人物关系理解速度":0,"冲突清晰度":0,"冲突升级强度":0,"主体能动性":0,"观众情绪强度":0,"终局因果合理性":0,"正片承接自然度":0,"画面可视化程度":0,"候选差异度":0,"制作可执行性":0},"selfCheck":{"duration":"","relationshipConflictInFirstThreeSeconds":true,"genreBasedRelationship":true,"avoidsFixedLeadStructure":true,"relationshipMatchesSource":true,"singleCoreConflict":true,"singleReversal":true,"worldAppropriateActions":true,"doesNotLeakFinalInformation":true,"naturalHandoff":true},"qc":[""]}]}。
ideas 必须恰好等于用户任务中的 requestedCandidateCount。任何 selfCheck 关键项为 false 时必须自动重新策划，不得输出该候选。`;

// 候选对象字段很多；如果不给模型明确的输出预算，长脚本很容易在 JSON
// 字符串中途被截断，最终表现为“Expected double-quoted property name”。
const CANDIDATE_MAX_TOKENS = 12000;
const JSON_REPAIR_RETRIES = 1;

const candidateSystemPrompt = `你是海外短剧投放素材的前15秒创意总监。当前任务只生成轻量创意候选，不写完整脚本、对白或拍摄说明。

【创作底线】
创意可以大胆，但理解成本必须低。差异必须来自人物关系、利益冲突、人物选择和信息揭露，不得依赖生僻名词、无意义猎奇或无法解释的异常设定。
1. 人物关系可以吸睛、反常，但是一定能够让用户迅速理解。
2. 除非题材或世界观标签明确要求，不得使用生僻职业、罕见疾病、冷门仪式、复杂制度、实验科技或超自然设定。
3. 非常规元素可以服务于题材、世界观和戏剧冲突，但必须有明确因果，其余人物、场景和动作仍应让观众快速理解。
4. 新鲜感来自“熟悉关系中的意外选择”、一些炸裂反常的事件，不来自奇怪道具或陌生名词。
5. 在每个创意的事件中一定要遵循开局吸睛、反常、炸裂、矛盾重点前置的原则，不要铺垫，直接给出核心矛盾、炸裂事件，一定要擅于使用悬念、反转、伏笔的技巧。
6. 创意的剧情一定要有戏剧性，开局前5秒一定是一个反常的事件、炸裂又吸睛的剧情、对话、冲突点，能够快速吸引到观众，提高观众的点击。
7. 事件描述一定要有大量的信息量，拒绝使用大量无用形容词、环境描写、神态描写、心理描写。
8. 首屏必须是人物在做可见的、可拍摄的行动（例如抓住、撕开、推倒、拦住、夺回、挡在身前、冲向某人）；账单、电脑、手机或屏幕只能作为人物行动的道具，不能单独作为开场事件或视觉主体。
9. 全部创意候选禁止使用手机、账本、账单、电脑屏幕、显示屏文字、短信或转账记录作为冲突点、反转点或主要视觉信息；必须改写为观众无需阅读文字即可看懂的人物行动、表情和空间关系。

【15秒因果链】
每条候选必须形成3步直接因果链：触发事件（最炸裂的、吸睛的事件） → 事件进一步升级（打击、困难、情感升级） → 以极具信息量的话语，或具有反转性的行动收尾。每一步都必须由上一步引发；人物动作必须有可理解的目标和动机。0—3秒出现可视化的炸裂、吸睛、反常事件——事件必须由短剧话的动作、对话构成，3—11秒连续升级同一矛盾、核心的戏剧事件，11—15秒结尾进行反转、悬念，必须吸睛。

【单一场景与核心事件】
每条候选必须只选一个明确场景，15秒内不得切换到第二个地点、第二条事件或另一段时间线。所有动作、升级和结尾都在同一场景中围绕同一个重要事件发生。
title 必须是“核心事件短标题”：6—14个中文字符，只点名发生的事件，不写人物名单、关系说明、完整因果或悬念问句。例如“订婚宴揭穿替身”“病房抢走孩子”。scene 写唯一场景，coreEvent 写该场景里唯一的重要事件，singleScene 必须为 true。

【输入优先级】
必须先读取 laneContract，再决定如何使用 sourceMaterial。anchored 的 sourceSynopsis 是事实底稿；migrated 只保留题材、世界规则、情绪承诺和冲突本质，并强制执行槽位指定的至少两个变化维度；wild 不会收到完整简介，只能使用角色原名、题材和世界规则重新创造冲突。supplementalRequirements 只作为风格、受众、禁用项或制作约束。

【端到端标签显影合同】
tagContract.requiredContextTags 是必须遵守的题材、世界观和明确锁定约束；excludedTags 绝不能出现。tagContract.requiredDramaticTags 只来自用户本次明确选择的人物关系与人物设定；未选择的关系或人设绝不能被强行添加。每条候选只执行 slotTagAssignments 为本槽位分配的标签。
每个分配标签必须输出一条 tagRealizations：tag 与 axis 必须原样返回，priority 必须为 required_dramatic；action 是正在发生的可见人物行动，dialogueIntent 是自然对白要透露的信息，reaction 是另一人物的即时反应，audienceInference 是观众由行动、对白和反应自然推断出的关系或人设，timeBlock 使用 0-3、3-7、7-11、11-15。禁止只复述标签名称、写解释性旁白或用手机、账本、屏幕文字承载显影。
hookStrategyPlan 是完整首尾钩子方案。openingHook 必须在0—3秒由可见动作建立第一个问题；middleEscalation 只升级同一矛盾；endingHook 必须在11—15秒形成明确的最后动作、最后一句对白、即将发生的后果和未回答问题。openingHook 与 endingHook 必须同时输出，不能只有开头钩子。
若用户没有选择钩子，由AI根据剧情与已选标签自动生成一组首尾钩子；不得因此拒绝任务。

【角色原名锁定】
sourceMaterial.characterNames 中的角色名称是原名锁定项。所有候选的 premise、openingAction、escalation、endingQuestion、relationshipPattern、causalChain 与人物关系描述，必须逐字保留这些角色原名的拼写和文字；不得把英文名、拼音名或其他语言的人名翻译成中文，也不得把中文名英译、音译或改成别名。

【三种创意距离】
anchored：必须保留简介的主要人物关系、核心事件和人物目标，只改变并放大冲突呈现，changedDimensions 必须包含“冲突呈现”。
migrated：必须执行 slotAssignments.requiredChangedDimensions，至少实质改变人物关系、具体场景、核心事件、冲突来源、人物目标中的两项；仅替换地点名称、道具或近义词不算改变。
wild：必须同时改变具体场景、核心事件、冲突来源，并再改变人物关系或人物目标；不得复用简介原场景、原核心事件或原冲突的同义改写。高想象力来自熟悉关系中的意外选择，不得依赖生僻设定。
每条候选必须逐字使用槽位给出的 conflictArchetype 和 protagonistGoal，并在 changedDimensions 中逐项声明已经完成的变化。声明与正文不一致时必须重写。

【硬性自检】
logicScore 必须不低于75；anchored、migrated、wild 的 familiarityScore 分别不低于75、72、68；genreFitScore 不低于80；productionFeasibilityScore 不低于70。任一项不达标、因果链不足五步、人物缺乏动机或结尾问题与前面冲突无关时，必须在输出前自行重写。标题、创意、动作和问题必须使用中文。

只输出合法 JSON：{"candidates":[{"id":"","generationSlot":"slot-1","lane":"anchored|migrated|wild","title":"核心事件短标题","sceneFamily":"槽位原值","scene":"唯一具体场景","coreEvent":"该场景中的重要事件","singleScene":true,"premise":"","openingAction":"","escalation":["",""],"endingQuestion":"","audiencePromise":"","hookMechanism":"","relationshipPattern":"","conflictSource":"","conflictArchetype":"槽位原值","protagonistGoal":"槽位原值","changedDimensions":["槽位要求的变化维度"],"twistType":"","emotion":"","worldRules":"","productionDifficulty":"低|中|高","adPotential":0,"noveltyScore":0,"causalChain":["触发事件","主体行动","阻碍或升级","主体再次行动","未解决问题"],"usedTags":[{"tag":"合同中的原始标签","evidence":"该标签在事件中的具体体现"}],"tagRealizations":[{"tag":"槽位分配的用户标签原名","axis":"relationship|characterSetting","priority":"required_dramatic","action":"可见人物行动","dialogueIntent":"自然对白需要透露的信息","reaction":"另一人物即时反应","audienceInference":"观众自然推断","timeBlock":"0-3|3-7|7-11|11-15"}],"openingHook":{"type":"","visibleAction":"","firstQuestion":""},"endingHook":{"type":"","lastVisibleAction":"","lastDialogue":"","imminentConsequence":"","unansweredQuestion":"","handoffVisual":""},"usedHooks":[{"hook":"用户选择的钩子原名或AI生成的钩子名称","role":"主钩子|辅助钩子","stage":"开场|升级|结尾","evidence":"对应的动作、事件或信息"}],"unusualElements":[],"logicScore":0,"familiarityScore":0,"genreFitScore":0,"productionFeasibilityScore":0,"fingerprint":{"relationship":"","goal":"","conflictSource":"","location":"唯一场景","openingAction":"","keyObject":"","hookMechanism":"","twistType":"","endingQuestion":"","handoff":""},"locks":{},"riskNotes":[]}]}。candidates 数量必须等于 requestedCandidateCount，并逐一对应 slotAssignments，不得交换创意距离、场景类型、冲突原型、人物目标或首尾钩子方案。`;

function taskContracts(input: Partial<PrefaceCreativeInput>) {
  const { requiredTags, requiredContextTags, requiredDramaticTags, availableTags, excludedTags } = buildCreativeTagContract(input);
  const selectedHooks = input.hookStrategyPlan?.selectedHooks?.map((item) => ({ id: item.id, label: item.label, family: item.family, type: item.type })) || [];
  return { requiredTags, requiredContextTags, requiredDramaticTags, availableTags, excludedTags, selectedHooks, customHook: input.hookStrategyPlan?.customHook || "", endingMode: input.hookStrategyPlan?.endingMode || "AI自动安排" };
}

function buildGenerationPrompt(input: Partial<PrefaceCreativeInput>, requestedCandidateCount: number, lane: PrefaceCreativeLane, existingCandidates: PrefaceCreativeCandidate[] = [], slotOffset = existingCandidates.length) {
  const contract = taskContracts(input);
  const slotAssignments = buildCandidateSlotAssignments(contract.selectedHooks, requestedCandidateCount, slotOffset, lane, contract.endingMode);
  const slotTagAssignments = Object.fromEntries(slotAssignments.map((slot, index) => [slot.id, assignDramaticTagsForSlot(contract.requiredDramaticTags, slotOffset + index)]));
  return JSON.stringify({
    task: {
      creationSource: text(input.creationSource, "标签策划"), creationBasis: input.creationBasis || "synopsis",
      supplementalRequirements: text(input.supplementalRequirements),
      genre: text(input.genre), genreTags: input.genreTags || [], worldView: text(input.worldView), worldViewTags: input.worldViewTags || [],
      relationshipTags: input.relationshipTags || [], characterSettingTags: input.characterSettingTags || [],
      emotion: text(input.emotion), emotionTags: input.emotionTags || [], handoffStrategy: input.handoffStrategy || "auto",
      targetMarket: text(input.targetMarket), targetLanguage: text(input.targetLanguage), durationSeconds: text(input.durationSeconds, "5-15"),
    },
    sourceMaterial: buildCreativeSourceMaterial(input, lane),
    storyDna: buildStoryDna(input),
    boundaries: {
      worldLevel: text(input.worldLevel, "realistic"), needsHandoff: text(input.needsHandoff), preferredTransitionAnchor: text(input.preferredTransitionAnchor),
      violenceLevel: text(input.violenceLevel, "medium"), dramaIntensity: text(input.dramaIntensity, "emotional"), allowedSettings: input.allowedSettings || [], forbiddenSettings: input.forbiddenSettings || [],
      lockedFactsAndTags: contract.requiredTags, excludedFactsAndTags: input.excludedTags || [],
      aiRecommendedTags: input.aiRecommendedTags || [],
    },
    tagContract: { requiredTags: contract.requiredTags, requiredContextTags: contract.requiredContextTags, requiredDramaticTags: contract.requiredDramaticTags, availableTags: contract.availableTags, excludedTags: contract.excludedTags, minimumUsedTagsPerCandidate: 1 },
    slotTagAssignments,
    selectedHookContract: { hooks: contract.selectedHooks, customHook: contract.customHook || "AI自动安排" },
    slotAssignments,
    laneContract: laneGenerationPolicy(lane),
    optionalHookPreference: { family: text(input.hookFamily), type: text(input.hookType), format: text(input.hookFormat), style: text(input.hookStyle) },
    hookStrategyPlan: input.hookStrategyPlan || null,
    lockedStrategyContract: input.hookStrategyPlan ? {
      creativeDirection: input.hookStrategyPlan.conflictUnit,
      primaryHook: input.hookStrategyPlan.primaryHook,
      supportingHooks: input.hookStrategyPlan.supportingHooks,
      format: input.hookStrategyPlan.format,
    } : null,
    generationControl: {
      requestedCandidateCount,
      lane,
      mode: existingCandidates.length ? "补齐缺失候选" : "首次生成",
      existingCandidates: existingCandidates.map((candidate) => ({ title: candidate.title, lane: candidate.lane, scene: candidate.scene, coreEvent: candidate.coreEvent, conflictArchetype: candidate.conflictArchetype, protagonistGoal: candidate.protagonistGoal, changedDimensions: candidate.changedDimensions, fingerprint: candidate.fingerprint })),
      instruction: "逐一完成 slotAssignments，并逐字采用槽位的 sceneFamily、conflictArchetype、protagonistGoal 和 primaryHook。差异必须来自冲突原型、人物目标、人物关系、核心事件和人物选择，不能只换地点、道具或近义词。不得复用 existingCandidates 的核心事件及其同义改写；同一冲突原型最多两条。",
    },
    instruction: "角色线索只用于建立关系网络。先判断题材，再选择最具广告价值的冲突关系；不得因为字段历史名称而默认女主、男主、男二或三角恋。",
  });
}

type CandidateGenerationContract = {
  allowSpeculative: boolean;
  lane: PrefaceCreativeLane;
  allowedTags: string[];
  requiredTags: string[];
  availableTags: string[];
  requiredDramaticBySlot: Record<string, string[]>;
  selectedHooks: string[];
  synopsis: string;
  slots: ReturnType<typeof buildCandidateSlotAssignments>;
};

async function requestCreativeCandidates(selectedModel: ModelConfig, prompt: string, contract: CandidateGenerationContract, signal?: AbortSignal) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= JSON_REPAIR_RETRIES; attempt += 1) {
    const userPrompt = attempt === 0
      ? prompt
      : `${prompt}\n\n这是一次候选修复重试。上一次问题：${lastError instanceof Error ? lastError.message : "输出不符合质量合同"}。只输出合法 JSON，不要解释；删除生僻元素，补全五步因果链，并确保四项质量分达到硬性门槛。`;
    try {
      const response = await modelFetch(selectedModel.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${selectedModel.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel.model,
          stream: false,
          max_tokens: CANDIDATE_MAX_TOKENS,
          messages: [{ role: "system", content: candidateSystemPrompt }, { role: "user", content: userPrompt }],
          response_format: { type: "json_object" },
        }),
        signal,
      });
      if (!response.ok) throw new Error(`模型服务请求失败（HTTP ${response.status}）`);
      const payload = object(await response.json());
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const message = object(object(choices[0]).message);
      const content = message.content;
      const raw = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((part) => typeof part === "string" ? part : text(object(part).text)).join("")
          : typeof payload.output_text === "string" ? payload.output_text : "";
      const parsedCandidates = parseCreativeCandidates(object(parseJson(raw)).candidates, { defaultLane: contract.lane });
      const alignedCandidates = normalizeCandidateSlotRows(parsedCandidates, contract.slots, contract.lane);
      const inspected = inspectCreativeCandidates(alignedCandidates, { allowSpeculative: contract.allowSpeculative, allowedTags: contract.allowedTags, selectedHooks: contract.selectedHooks, synopsis: contract.synopsis, slots: contract.slots, defaultLane: contract.lane });
      const slots = new Map(contract.slots.map((slot) => [slot.id, slot]));
      const candidates = inspected.candidates.filter((candidate) => {
        const slot = slots.get(candidate.generationSlot);
        return candidatePassesGenerationContract(candidate, slot, contract.requiredTags, contract.availableTags, contract.requiredDramaticBySlot[candidate.generationSlot] || []);
      });
      if (!candidates.length) throw new Error([...inspected.rejections.map((item) => item.reason), "候选没有执行分配的场景与主钩子槽位"].filter(Boolean).join("；"));
      return candidates;
    } catch (error) {
      lastError = error;
      if (attempt >= JSON_REPAIR_RETRIES || (error instanceof DOMException && error.name === "AbortError")) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("模型没有返回可解析的前贴创意 JSON");
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      try {
        const body = object(await request.json());
        const input = object(body.input) as Partial<PrefaceCreativeInput>;
        if (!text(input.plotSynopsis || input.targetBrief)) throw new Error("剧情简介不能为空，请先上传或填写剧情简介");
        const priorCandidates = parseCreativeCandidates(body.existingCandidates);
        const selectedModel = resolveModelProvider(input.modelProvider);
        const allowSpeculative = creativeTaskAllowsSpeculativeElements(input);
        const contracts = taskContracts(input);
        const allowedTags = [...new Set([...contracts.requiredTags, ...contracts.availableTags, ...contracts.selectedHooks.map((item) => item.label), contracts.customHook].filter(Boolean))].filter((item) => !contracts.excludedTags.includes(item));
        // Send an immediate padded heartbeat so browser/dev proxies flush the
        // stream before the first model response is ready.
        controller.enqueue(encoder.encode(`: stream-start ${" ".repeat(2048)}\n\n`));
        let candidates: PrefaceCreativeCandidate[] = [];
        let batch = 0;

        const generationRunId = Date.now().toString(36);
        const laneTargets: Array<{ lane: PrefaceCreativeLane; label: string }> = [
          { lane: "anchored", label: "原剧情放大" },
          { lane: "migrated", label: "横向迁移" },
          { lane: "wild", label: "想象突破" },
        ];
        while (laneTargets.some(({ lane }) => candidates.filter((item) => item.lane === lane).length < 8) && batch < 12) {
          batch += 1;
          const target = laneTargets.find(({ lane }) => candidates.filter((item) => item.lane === lane).length < 8)!;
          const currentLaneCount = candidates.filter((item) => item.lane === target.lane).length;
          const requestedCandidateCount = Math.min(4, 8 - currentLaneCount);
          const existingForPrompt = [...priorCandidates, ...candidates];
          const slotOffset = (batch - 1) * 4;
          const slots = buildCandidateSlotAssignments(contracts.selectedHooks, requestedCandidateCount, slotOffset, target.lane, contracts.endingMode);
          const requiredDramaticBySlot = Object.fromEntries(slots.map((slot, index) => [slot.id, assignDramaticTagsForSlot(contracts.requiredDramaticTags, slotOffset + index).map((item) => item.tag)]));
          send("progress", { completed: candidates.length, total: 24, stage: `正在生成${target.label}候选…` });
          try {
            const generated = (await requestCreativeCandidates(selectedModel, buildGenerationPrompt(input, requestedCandidateCount, target.lane, existingForPrompt, slotOffset), { allowSpeculative, lane: target.lane, allowedTags, requiredTags: contracts.requiredTags, availableTags: contracts.availableTags, requiredDramaticBySlot, selectedHooks: contracts.selectedHooks.map((item) => item.label), synopsis: text(input.plotSynopsis || input.targetBrief), slots }, request.signal)).map((candidate, index) => ({ ...candidate, id: `${generationRunId}-${target.lane}-${batch}-${index + 1}`, lane: target.lane }));
            candidates = mergeCreativeCandidates(candidates, generated, 24);
            send("batch", { candidates, completed: candidates.length, total: 24, stage: `已完成 ${candidates.length}/24 条，继续补充差异方向。` });
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            send("warning", { completed: candidates.length, total: 24, stage: `${target.label}本批校验未通过，继续生成其他方向。`, message: error instanceof Error ? error.message : "本批候选未通过质量校验" });
          }
        }

        if (!candidates.length) throw new Error("模型没有返回可用的轻量创意候选，请更换模型后重试。");
        const complete = candidates.length === 24;
        send("done", { candidates, completed: candidates.length, total: 24, model: selectedModel.model, provider: selectedModel.label, recovery: { batches: batch }, stage: complete ? "24 条候选已完成。" : `已保留 ${candidates.length} 条可用候选，可继续补充。` });
      } catch (error) {
        send("error", { message: error instanceof Error ? error.message : "前贴创意生成失败" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
