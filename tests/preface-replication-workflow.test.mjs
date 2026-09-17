import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("迭代复刻可从 AI 前贴库选择母版并返回复刻工作台", async () => {
  const [page, inspiration, library, workspace] = await Promise.all([
    read("app/page.tsx"),
    read("app/features/inspiration/InspirationWorkspace.tsx"),
    read("app/features/inspiration/MaterialLibraryPanelV2.tsx"),
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
  ]);

  assert.match(page, /onSelectForReplication/);
  assert.match(page, /setPrefaceCreativeMode\("replicate"\)/);
  assert.match(page, /setWorkspace\("prefaceCreative"\)/);
  assert.match(page, /setReplicationTemplateId\(asset\.id\)/);
  assert.match(inspiration, /onSelectForReplication/);
  assert.match(library, /迭代复刻/);
  assert.match(workspace, /onOpenPrefaceLibrary/);
});

test("迭代复刻使用独立的目标剧情说明，不读取创意策划的 input.targetBrief", async () => {
  const workspace = await read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx");

  assert.match(workspace, /const \[replicationBrief, setReplicationBrief\]/);
  assert.match(workspace, /buildSettings\(replicationBrief\)/);
  assert.doesNotMatch(workspace, /buildSettings\(input\.targetBrief \|\| ""\)/);
});

test("迭代复刻工作台提供母版库、详情预览和新剧情输入流程", async () => {
  const workspace = await read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx");

  assert.match(workspace, /前贴母版库/);
  assert.match(workspace, /立即使用/);
  assert.match(workspace, /新剧情简介/);
  assert.match(workspace, /稳定复刻/);
  assert.match(workspace, /场景迁移/);
  assert.match(workspace, /创意升级/);
});

test("母版库提供多维标签筛选和精简的复刻分析详情", async () => {
  const [workspace, styles] = await Promise.all([
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
    read("app/features/preface-creative/PrefaceCreativeWorkspace.module.css"),
  ]);
  assert.match(workspace, /题材类型/);
  assert.match(workspace, /import \{[^}]*useRef[^}]*\} from "react"/);
  assert.match(workspace, /人物关系/);
  assert.match(workspace, /钩子类型/);
  assert.match(workspace, /创作思路/);
  assert.match(workspace, /复刻思路/);
  assert.match(workspace, /衔接正片方向/);
  assert.match(workspace, /补全分析/);
  assert.match(workspace, /一键补全分析/);
  assert.match(workspace, /enqueuePrefaceAnalysis/);
  assert.match(workspace, /enqueueIncompletePrefaceAnalysis/);
  assert.match(workspace, /prefaceAnalysisStatus/);
  assert.doesNotMatch(workspace, /retryMaterialAnalysis/);
  assert.doesNotMatch(workspace, /href=\{`\/?tab=replicate/);
  assert.match(workspace, /buildPrefaceAnalysisView/);
  assert.match(styles, /aspect-ratio:\s*9\s*\/\s*16/);
});

test("原前贴镜头脚本只读取已完成裁剪的实体文件并按区间修复", async () => {
  const [route, library] = await Promise.all([
    read("app/api/prompt-storyboard/route.ts"),
    read("app/features/inspiration/MaterialLibraryPanelV2.tsx"),
  ]);
  assert.match(route, /asset\.clip_status/);
  assert.match(route, /前贴片段尚未完成切割/);
  assert.match(route, /storyboardRepairIntervals/);
  assert.match(route, /sealStoryboardTimeline/);
  assert.match(library, /asset\.clipStatus === "ready"/);
});

test("裂变模型请求明确预留完整十五分支所需的输出长度", async () => {
  const route = await read("app/api/prompt-fission/route.ts");

  assert.match(route, /FISSION_MAX_TOKENS/);
  assert.match(route, /max_tokens:\s*FISSION_MAX_TOKENS/);
});

test("AI前贴库使用稳定9:16视频比例、六列桌面布局并隐藏卡片标题", async () => {
  const [library, styles] = await Promise.all([
    read("app/features/inspiration/MaterialLibraryPanelV2.tsx"),
    read("app/features/inspiration/InspirationWorkspace.module.css"),
  ]);
  assert.match(library, /prefaceLibraryCard/);
  assert.match(library, /迭代复刻/);
  assert.doesNotMatch(library, /用于迭代复刻/);
  assert.match(styles, /prefaceLibraryGrid/);
  assert.match(styles, /repeat\(6/);
  assert.match(styles, /prefaceLibraryPreview/);
  assert.match(styles, /aspect-ratio:\s*9\s*\/\s*16/);
});

test("AI前贴卡片使用悬停播放和右上角图标操作", async () => {
  const [library, styles] = await Promise.all([
    read("app/features/inspiration/MaterialLibraryPanelV2.tsx"),
    read("app/features/inspiration/InspirationWorkspace.module.css"),
  ]);
  assert.match(library, /kind === "ai_preface" \? "预览"/);
  assert.match(library, /prefaceCardOverlay/);
  assert.match(library, /aria-label=\{`下载/);
  assert.match(library, /aria-label=\{`删除/);
  assert.match(styles, /prefaceCardOverlay/);
  assert.match(styles, /opacity:\s*0/);
  assert.match(styles, /prefaceLibraryCard:hover \.prefaceCardOverlay/);
});
