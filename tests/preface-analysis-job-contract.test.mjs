import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("前贴补全使用独立持久化任务并只写回前贴资产", async () => {
  const [migration, hook] = await Promise.all([
    read("pb_migrations/1787651100_create_preface_analysis_jobs.js"),
    read("pb_hooks/preface_analysis.pb.js"),
  ]);
  assert.match(migration, /name:\s*"preface_analysis_jobs"/);
  assert.match(migration, /clip_start_seconds/);
  assert.match(migration, /clip_end_seconds/);
  assert.match(migration, /idempotency_key/);
  assert.match(hook, /preface-analysis\/assets\/\{id\}\/enqueue/);
  assert.match(hook, /preface-analysis\/enqueue-incomplete/);
  assert.match(hook, /preface-analysis\/claim/);
  assert.match(hook, /preface-analysis\/jobs\/\{id\}/);
  assert.match(hook, /asset\.set\("analysis_result"/);
  assert.doesNotMatch(hook, /material\.set\("analysis_result"/);
});

test("批量补全只处理 AI 前贴并跳过完整项和无视频源项", async () => {
  const helper = await read("pb_hooks/preface_analysis_helpers.js");
  assert.match(helper, /getString\("asset_kind"\)\s*!==\s*"ai_preface"/);
  assert.match(helper, /isAnalysisComplete/);
  assert.match(helper, /no_media/);
  assert.match(helper, /already_active/);
});
