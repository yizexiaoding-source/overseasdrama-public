import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("三个分支调用独立AI接口并携带候选锁定项", async () => {
  const [workspace, route] = await Promise.all([
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
    read("app/api/preface-creative/branches/route.ts"),
  ]);
  assert.match(workspace, /\/api\/preface-creative\/branches/);
  assert.match(workspace, /locks/);
  assert.match(route, /稳健放大/);
  assert.match(route, /关系迁移/);
  assert.match(route, /想象跃迁/);
  assert.match(route, /parentId/);
});

test("完整脚本只在选择候选后通过独立接口生成", async () => {
  const [workspace, route] = await Promise.all([
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
    read("app/api/preface-creative/script/route.ts"),
  ]);
  assert.match(workspace, /\/api\/preface-creative\/script/);
  assert.match(workspace, /candidate/);
  assert.match(route, /inspectCreativeIdeas/);
  assert.match(route, /完整前贴脚本/);
});

test("生成前贴脚本时同步生成分镜，并将双语对白写入完整脚本", async () => {
  const [workflow, workspace, scriptRoute, storyboardRoute, storyboardPrompt] = await Promise.all([
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
    read("app/api/preface-creative/script/route.ts"),
    read("app/api/preface-creative/storyboard/route.ts"),
    read("app/lib/preface-storyboard-prompt.ts"),
  ]);
  assert.match(workflow, /五、脚本与分镜/);
  assert.match(workflow, /前贴脚本/);
  assert.match(workflow, /分镜脚本/);
  assert.doesNotMatch(workflow, />双语对白</);
  assert.match(scriptRoute, /双语对白必须直接写入 script/);
  assert.match(workspace, /requestCandidateStoryboard/);
  assert.match(workspace, /\/api\/preface-creative\/storyboard/);
  assert.match(storyboardRoute, /STORYBOARD_SYSTEM_PROMPT/);
  assert.match(storyboardPrompt, /精品动漫视频分镜生成专家/);
  assert.match(storyboardPrompt, /最终输出格式/);
});

test("点击生成脚本会立即进入脚本与分镜，并由服务端剥离分镜前的数组", async () => {
  const [workflow, storyboardRoute] = await Promise.all([
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/api/preface-creative/storyboard/route.ts"),
  ]);
  assert.match(workflow, /setSelectedId\(candidate\.id\); setStep\(4\);[\s\S]*await onGenerateScript\(candidate\)/);
  assert.match(storyboardRoute, /extractStoryboardScript/);
});

test("分镜只以完整前贴脚本为原文，候选沿用剧情简介中的角色原名", async () => {
  const [planRoute, branchRoute, scriptRoute, storyboardRoute] = await Promise.all([
    read("app/api/preface-creative/plan/route.ts"),
    read("app/api/preface-creative/branches/route.ts"),
    read("app/api/preface-creative/script/route.ts"),
    read("app/api/preface-creative/storyboard/route.ts"),
  ]);
  for (const source of [planRoute, branchRoute, scriptRoute]) assert.match(source, /原名锁定/);
  assert.match(storyboardRoute, /只以以下完整前贴脚本作为剧情原文/);
  assert.match(storyboardRoute, /只输出第二步的分镜脚本/);
  assert.doesNotMatch(storyboardRoute, /videoPrompt/);
});

test("候选使用短事件标题和单场景合同，并可批量排队生成脚本", async () => {
  const [workflow, workspace, planRoute, branchRoute, scriptRoute] = await Promise.all([
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
    read("app/api/preface-creative/plan/route.ts"),
    read("app/api/preface-creative/branches/route.ts"),
    read("app/api/preface-creative/script/route.ts"),
  ]);
  for (const source of [planRoute, branchRoute]) {
    assert.match(source, /核心事件短标题/);
    assert.match(source, /单一场景/);
    assert.match(source, /singleScene/);
  }
  assert.match(scriptRoute, /单一场景/);
  assert.match(workflow, /批量生成脚本/);
  assert.match(workflow, /batchScriptIds/);
  assert.match(workspace, /generateCandidateScripts/);
  assert.match(workspace, /batchScriptProgress/);
});

test("前贴收藏同步到我的创作且淘汰状态在页面切换后仍会恢复", async () => {
  const [workflow, page, creations] = await Promise.all([
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/page.tsx"),
    read("app/features/creations/MyCreations.tsx"),
  ]);
  assert.match(workflow, /onToggleFavorite/);
  assert.match(workflow, /lumina:preface-rejected-candidates/);
  assert.match(page, /lumina:preface-creative-favorites/);
  assert.match(creations, /继续生成脚本/);
});

test("生成与输出阶段提供稳定加载、复制和对白语种切换", async () => {
  const [workflow, workspace, planRoute, storyboardRoute] = await Promise.all([
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
    read("app/api/preface-creative/plan/route.ts"),
    read("app/api/preface-creative/storyboard/route.ts"),
  ]);
  assert.match(workflow, /streamSpinner/);
  assert.match(workflow, /复制/);
  assert.match(workflow, /storyboardLanguage/);
  assert.doesNotMatch(workflow, /下载 Word/);
  assert.match(workflow, /navigator\.clipboard/);
  assert.match(planRoute, /send\("warning"/);
  assert.match(storyboardRoute, /dialogueLanguage/);
});

test("脚本、分镜重试和语种切换按任务键独立保留加载动画", async () => {
  const [workflow, workspace] = await Promise.all([
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
  ]);
  assert.match(workspace, /activeActionKeysRef/);
  assert.match(workspace, /beginAction\(actionKey\)/);
  assert.match(workspace, /endAction\(actionKey\)/);
  assert.match(workspace, /storyboard-language:\$\{idea\.id\}:\$\{language\}/);
  assert.match(workflow, /activeScriptCandidateIds\.map/);
  assert.match(workflow, /activeStoryboardIdeaIds\.map/);
  assert.match(workflow, /activeLanguageActions\.map/);
  assert.match(workflow, /ideaIsGenerating\(idea\)/);
  assert.doesNotMatch(workspace, /setCandidateActionBusy/);
});
test("前贴脚本与分镜共同执行 TikTok 身体距离安全合同", async () => {
  const [scriptRoute, storyboardRoute, safety] = await Promise.all([
    read("app/api/preface-creative/script/route.ts"),
    read("app/api/preface-creative/storyboard/route.ts"),
    read("app/lib/preface-ad-safety.ts"),
  ]);
  for (const source of [scriptRoute, storyboardRoute]) assert.match(source, /PREFACE_AD_SAFETY_CONTRACT/);
  for (const phrase of ["亲吻", "嘴和嘴", "腿和腿", "脸和脸", "上半身", "下半身", "贴耳"]) assert.match(safety, new RegExp(phrase));
  assert.match(safety, /containsRestrictedPrefaceAction/);
});
