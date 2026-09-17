import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("前贴创意策划完整实现文档规定的五步低频监督工作流", async () => {
  const [catalog, domain, planning, route] = await Promise.all([
    read("app/lib/preface-creative-catalog.ts"),
    read("app/lib/preface-creative-domain.ts"),
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/api/preface-creative/plan/route.ts"),
  ]);
  for (const step of ["一、创作任务", "二、内容标签", "三、钩子策略", "四、创意候选", "五、脚本与分镜"]) assert.match(planning, new RegExp(step));
  for (const state of ["系统推荐", "用户锁定", "用户排除"]) assert.match(planning, new RegExp(state));
  for (const action of ["收藏", "淘汰", "锁定部分设定", "生成3个变体", "选择并生成脚本", "下载所选 Word", "脚本记录"]) assert.match(planning, new RegExp(action));
  assert.doesNotMatch(planning, /对比已选/);
  for (const axis of ["题材类型", "人物关系", "世界观", "人物设定"]) assert.match(catalog, new RegExp(axis));
  for (const family of ["人物关系钩子", "身份地位钩子", "高冲突事件钩子", "信息差悬念钩子", "情绪刺激钩子", "权力利益钩子", "特殊机制钩子", "视觉行为钩子"]) assert.match(catalog, new RegExp(family));
  for (const format of ["对白暴击型", "结果先行型", "异常画面型", "公开羞辱型", "证据物件型", "突发闯入型", "倒计时型", "两难选择型", "误会视角型", "一句秘密型", "关系反差型", "身份反差型"]) assert.match(catalog, new RegExp(format));
  assert.match(domain, /scoreBreakdown/);
  assert.match(domain, /productionDifficulty/);
  assert.match(domain, /riskNotes/);
  assert.match(route, /低于七十五分不展示/);
  assert.match(route, /硬性错误/);
  assert.match(route, /内部生成三十至五十个/);
  assert.match(route, /持续升级同一矛盾/);
  assert.match(route, /标题、剧情描述、人物关系描述和人物动作描述.*中文/);
  assert.match(route, /英文对白.*中文翻译/);
  for (const provider of ["通义千问", "豆包", "DeepSeek", "Gemini"]) assert.match(planning, new RegExp(provider));
  assert.match(route, /MODEL_PROVIDERS/);
});

test("creative idea parser preserves hook metadata and bilingual dialogue", async () => {
  const source = await read("app/lib/preface-creative-domain.ts");
  assert.match(source, /dialogue/);
  assert.match(source, /informationHold/);
  assert.match(source, /transitionAnchor/);
  for (const field of ["genreJudgment", "relationshipNetwork", "coreConflictUnit", "hookDesign", "timeline", "selfCheck"]) assert.match(source, new RegExp(field));
});

test("分镜提示词要求宏观镜头块，禁止把动作拆成亚秒级镜头", async () => {
  const prompt = await read("app/lib/preface-storyboard-prompt.ts");
  assert.match(prompt, /每个分镜脚本.*2~4 个镜头/s);
  assert.match(prompt, /0[—-]3.*3[—-]7.*7[—-]11.*11[—-]15/s);
  assert.match(prompt, /禁止.*亚秒|不得.*亚秒|不要.*亚秒/s);
  assert.match(prompt, /连续动作块|宏观动作块/);
  assert.doesNotMatch(prompt, /每一个独立的视觉细节.*必须对应一次景别切换/);
});

test("分镜提示词要求一条前贴只生成一个分镜脚本并禁用不可读屏幕道具", async () => {
  const prompt = await read("app/lib/preface-storyboard-prompt.ts");
  assert.match(prompt, /只输出一个分镜脚本|仅输出一个分镜脚本/);
  assert.match(prompt, /不得.*分镜脚本2|禁止.*分镜脚本2/);
  assert.match(prompt, /手机.*账单.*账本|账单.*手机.*电脑/);
  assert.match(prompt, /不得.*屏幕文字|禁止.*屏幕文字/);
});

test("专业短剧前贴 Prompt V2 先分析题材关系且不套用固定男女主结构", async () => {
  const route = await read("app/api/preface-creative/plan/route.ts");
  for (const rule of [
    "不能默认故事一定以.*女主.*男主.*男二.*为核心",
    "人物关系网络",
    "前贴冲突关系单元",
    "人物A.*人物B",
    "人物.*系统.*规则.*命运",
    "关系不是标签.*动态关系",
    "前贴人物由冲突决定",
    "动作必须来自题材世界",
    "5.*15秒",
    "只有一个核心矛盾",
    "只有一次明确反转",
    "真实性边界",
    "同人物.*同关系.*同事件.*同物件.*同地点.*同问题.*同动作.*因果关系",
  ]) assert.match(route, new RegExp(rule, "s"));
  assert.doesNotMatch(route, /每条只允许女主、男主、男二三个核心人物/);
  assert.doesNotMatch(route, /最后 1—2 秒男主用动作介入/);
  for (const genre of ["家庭", "宫廷", "仙侠", "狼人", "末日", "系统", "校园", "体育", "娱乐圈"]) assert.match(route, new RegExp(genre));
  assert.match(route, /第一句对白.*人物关系.*权力关系.*当前冲突/s);
});

test("第一步由用户选择题材、世界观，可选关系与剧情简介", async () => {
  const [planning, domain, analysisRoute] = await Promise.all([
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/lib/preface-creative-domain.ts"),
    read("app/api/preface-creative/analyze/route.ts"),
  ]);
  for (const copy of ["选择题材类型", "选择世界观", "人物关系（可选）", "人物设定（可选）", "剧情简介", "AI匹配内容标签"]) assert.match(planning, new RegExp(copy));
  assert.doesNotMatch(planning, /自由创意/);
  assert.doesNotMatch(planning, /希望强化的观看情绪/);
  assert.doesNotMatch(planning, /AI分析并推荐前贴方向/);
  assert.doesNotMatch(planning, /女主 · 剧情功能与当前目标/);
  assert.match(planning, /选择AI模型/);
  assert.match(domain, /creationBasis/);
  assert.match(domain, /emotionTags/);
  assert.match(domain, /handoffStrategy/);
  assert.match(domain, /PrefaceCreativeAnalysis/);
  assert.match(analysisRoute, /内容标签匹配模型/);
});

test("剧情简介先于标签输入，并支持独立的补充要求上传与传递", async () => {
  const [planning, workspace, domain, analysisRoute, planRoute] = await Promise.all([
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
    read("app/lib/preface-creative-domain.ts"),
    read("app/api/preface-creative/analyze/route.ts"),
    read("app/api/preface-creative/plan/route.ts"),
  ]);
  for (const copy of ["上传剧情简介", "补充要求", "plotSynopsis", "supplementalRequirements", "accept=\".txt,.md,.json\""]) assert.match(planning, new RegExp(copy));
  assert.match(planning, /剧情简介.*题材类型/s);
  assert.match(planning, /\.text\(\)/);
  assert.match(workspace, /supplementalRequirements/);
  assert.match(domain, /supplementalRequirements/);
  assert.match(analysisRoute, /plotSynopsis/);
  assert.match(analysisRoute, /supplementalRequirements/);
  assert.match(analysisRoute, /剧情简介不能为空/);
  assert.match(planRoute, /plotSynopsis/);
  assert.match(planRoute, /supplementalRequirements/);
  assert.match(planRoute, /剧情简介不能为空/);
});

test("内容标签按题材匹配人物关系与人设，不使用固定角色模板", async () => {
  const [planning, catalog, workspace, analysisRoute] = await Promise.all([
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/lib/preface-creative-catalog.ts"),
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
    read("app/api/preface-creative/analyze/route.ts"),
  ]);
  for (const name of ["genreTagGroups", "relationshipTagGroups", "worldViewTagGroups", "characterSettingTagGroups", "parseAiTagRecommendations"]) assert.match(catalog, new RegExp(name));
  for (const field of ["genreTags", "worldViewTags", "relationshipTags", "characterSettingTags", "modelProvider"]) assert.match(planning, new RegExp(field));
  assert.match(planning, /AI匹配内容标签/);
  assert.match(workspace, /\/api\/preface-creative\/analyze/);
  assert.match(analysisRoute, /只允许从标签目录中选择/);
  assert.match(analysisRoute, /用户已经选择的标签不得重复推荐/);
});

test("AI标签匹配在模型无响应时会主动结束，不让页面永久卡在匹配中", async () => {
  const [workspace, analysisRoute] = await Promise.all([
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
    read("app/api/preface-creative/analyze/route.ts"),
  ]);
  assert.match(analysisRoute, /AbortSignal\.timeout/);
  assert.match(analysisRoute, /AI标签匹配超时/);
  assert.match(analysisRoute, /max_tokens/);
  assert.match(analysisRoute, /enable_thinking: false/);
  assert.match(analysisRoute, /每项不超过三十个汉字/);
  assert.match(workspace, /AbortSignal\.timeout/);
});

test("前贴候选模型输出损坏时会限制输出长度并自动重试严格 JSON", async () => {
  const route = await read("app/api/preface-creative/plan/route.ts");
  assert.match(route, /max_tokens\s*:/);
  assert.match(route, /JSON_REPAIR_RETRIES/);
  assert.match(route, /只输出合法 JSON/);
});

test("候选语言校验只要求标题、剧情与动作描述使用中文", async () => {
  const domain = await read("app/lib/preface-creative-domain.ts");
  assert.match(domain, /narrativeFieldsAreChinese/);
  assert.match(domain, /标题.*剧情.*动作/);
  assert.match(domain, /videoPrompt/);
});

test("第三步使用完整首尾钩子方案，并把标签显影合同传给候选生成", async () => {
  const [catalog, workflow, domain, analysisRoute, planRoute, workspace] = await Promise.all([
    read("app/lib/preface-creative-catalog.ts"),
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/lib/preface-creative-domain.ts"),
    read("app/api/preface-creative/analyze/route.ts"),
    read("app/api/preface-creative/plan/route.ts"),
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
  ]);
  assert.match(catalog, /buildConflictUnits/);
  assert.doesNotMatch(catalog, /男二当众/);
  for (const label of ["首尾钩子方案", "开头钩子", "结尾卡点", "高级调整"]) assert.match(workflow, new RegExp(label));
  for (const label of ["关系突然破裂", "身份或资格反转", "利益遭到抢夺", "危险立即发生", "真相只揭一半", "人物被迫选择"]) assert.match(catalog, new RegExp(label));
  assert.match(domain, /PrefaceHookStrategyPlan/);
  assert.match(analysisRoute, /conflictUnits/);
  assert.match(workspace, /conflictUnits/);
  assert.match(planRoute, /hookStrategyPlan/);
  assert.match(planRoute, /selectedHookContract/);
  assert.match(planRoute, /tagContract/);
  assert.match(planRoute, /requiredDramaticTags/);
  assert.match(planRoute, /slotTagAssignments/);
  assert.match(planRoute, /slotAssignments/);
  assert.match(workflow, /input\.hookStrategyPlan\?\.selectedHooks \|\| \[\]/);
});

test("第三步基于当前输入动态推荐三组完整方案，高级区仍可微调具体钩子", async () => {
  const [workflow, catalog, analysisRoute, planRoute, generation] = await Promise.all([
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/lib/preface-creative-catalog.ts"),
    read("app/api/preface-creative/analyze/route.ts"),
    read("app/api/preface-creative/plan/route.ts"),
    read("app/lib/preface-creative-generation.ts"),
  ]);
  for (const label of ["选择1—3组", "每条候选只执行一组完整方案", "开头负责让冲突立刻被看懂", "结尾负责停在后果即将发生", "动态推荐"]) assert.match(workflow, new RegExp(label));
  assert.doesNotMatch(workflow, /可多选 · 最多 3 项/);
  assert.match(catalog, /hookPairOptions/);
  assert.match(catalog, /recommendHookPairs/);
  assert.match(catalog, /hookDirectionOptions/);
  assert.match(catalog, /hookEndingOptions/);
  assert.match(analysisRoute, /direction/);
  assert.match(generation, /sceneFamilies/);
  assert.match(generation, /conflictArchetypes/);
  assert.match(generation, /protagonistGoals/);
  assert.match(planRoute, /逐一完成 slotAssignments/);
  assert.match(workflow, /一键换一批/);
  assert.match(planRoute, /storyDna/);
});
