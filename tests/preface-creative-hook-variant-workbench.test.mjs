import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("第三步提供分轴钩子与可选自定义要求，并允许AI自动安排", async () => {
  const [workflow, catalog] = await Promise.all([
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/lib/preface-creative-catalog.ts"),
  ]);
  assert.match(catalog, /export const hookAxisOptions\s*=/);
  assert.match(workflow, /情绪钩子/);
  assert.match(workflow, /人物关系钩子/);
  assert.match(workflow, /情节事件钩子/);
  assert.match(workflow, /自定义钩子要求/);
  assert.match(workflow, /AI自动安排/);
  assert.doesNotMatch(workflow, /请至少选择一个钩子方向/);
});

test("候选契约包含动作对白显影证据", async () => {
  const [domain, plan] = await Promise.all([
    read("app/lib/preface-creative-domain.ts"),
    read("app/api/preface-creative/plan/route.ts"),
  ]);
  assert.match(domain, /dramaticEvidence/);
  assert.match(plan, /动作.*对白.*反应/);
  assert.match(plan, /禁止人物说明书式对白/);
});

test("三变体进入可配置工作台并按分支独立恢复", async () => {
  const [workflow, workspace, route] = await Promise.all([
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
    read("app/api/preface-creative/branches/route.ts"),
  ]);
  assert.match(workflow, /变体工作台/);
  assert.match(workflow, /情绪升级/);
  assert.match(workflow, /核心事件替换/);
  assert.match(workspace, /catch \(reason\) \{ const message = generationFailure/);
  assert.match(workspace, /setError\(message\); onNotify\?\.\(message\); throw new Error/);
  assert.match(route, /branchSpecs/);
  assert.match(route, /Promise\.allSettled/);
  assert.doesNotMatch(workspace, /replaceCandidateBranches\(current, candidate\.id/);
  assert.match(workflow, /branchResults/);
});

test("第5步在单条生成时显示状态并采用记录置顶的双栏输出", async () => {
  const workflow = await read("app/features/preface-creative/PrefacePlanningWorkflow.tsx");
  const css = await read("app/features/preface-creative/PrefaceCreativeWorkspace.module.css");
  assert.match(workflow, /正在生成脚本与分镜/);
  assert.match(workflow, /scriptArchiveTop/);
  assert.match(css, /\.scriptArchiveTop/);
});
