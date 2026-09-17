import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("前贴轻量候选按四条一批通过 SSE 推送，而非等待二十四条整包返回", async () => {
  const [route, workspace, workflow] = await Promise.all([
    read("app/api/preface-creative/plan/route.ts"),
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
    read("app/features/preface-creative/PrefacePlanningWorkflow.tsx"),
  ]);

  assert.match(route, /text\/event-stream/);
  assert.match(route, /stream-start/);
  assert.match(route, /send\("batch"/);
  assert.match(route, /Math\.min\(4, 8 - currentLaneCount\)/);
  assert.match(route, /total: 24/);
  assert.match(workspace, /response\.body\.getReader\(\)/);
  assert.match(workspace, /existingCandidates: candidates/);
  assert.match(workspace, /event === "batch"/);
  assert.match(workspace, /parseCreativeCandidates/);
  assert.match(workspace, /event === "progress"/);
  assert.match(workspace, /streamStarted/);
  assert.match(workflow, /已完成/);
  assert.match(workflow, /停止补充/);
  assert.match(route, /priorCandidates/);
  assert.match(route, /\[\.\.\.priorCandidates, \.\.\.candidates\]/);
  const css = await read("app/features/preface-creative/PrefaceCreativeWorkspace.module.css");
  assert.match(workflow, /streamSpinner/);
  assert.match(css, /streamSpinner/);
  assert.match(css, /prefers-reduced-motion/);
});
