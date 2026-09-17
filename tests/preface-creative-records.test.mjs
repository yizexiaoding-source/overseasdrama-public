import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPrefaceTextExport,
  createPrefaceCreativeFavorite,
  createPrefaceIdeaRecord,
  replaceCandidateBranches,
  runPrefaceBatch,
} from "../app/lib/preface-creative-records.ts";

const candidate = (id, parentId = undefined) => ({
  id,
  parentId,
  title: `事件${id}`,
  scene: "宴会厅",
  coreEvent: "主角当众反击",
});

test("重新生成三个变体时完整替换该母候选旧分支且不影响其他候选", () => {
  const current = [candidate("parent"), candidate("old", "parent"), candidate("other")];
  const incoming = [candidate("b1", "parent"), candidate("b2", "parent"), candidate("b3", "parent")];

  const result = replaceCandidateBranches(current, "parent", incoming, 60);

  assert.deepEqual(result.map((item) => item.id), ["parent", "other", "b1", "b2", "b3"]);
});

test("收藏前贴创意时保存候选和任务输入的独立快照", () => {
  const sourceCandidate = candidate("candidate-1");
  const input = { genre: "豪门", plotSynopsis: "Stella在宴会上被逐出家门" };

  const favorite = createPrefaceCreativeFavorite(sourceCandidate, input, "2026-09-15T12:00:00.000Z");
  sourceCandidate.title = "已修改";
  input.plotSynopsis = "已修改";

  assert.equal(favorite.candidate.title, "事件candidate-1");
  assert.equal(favorite.input.plotSynopsis, "Stella在宴会上被逐出家门");
  assert.equal(favorite.savedAt, "2026-09-15T12:00:00.000Z");
});

test("同一候选重复生成会形成可追溯的新版本而不是覆盖旧脚本", () => {
  const input = { genre: "豪门", plotSynopsis: "Stella被逐出宴会" };
  const first = createPrefaceIdeaRecord({ id: "candidate-1", title: "逐出宴会", script: "第一版" }, "candidate-1", input, [], "single", "2026-09-15T12:00:00.000Z");
  const second = createPrefaceIdeaRecord({ id: "candidate-1", title: "逐出宴会", script: "第二版" }, "candidate-1", input, [first], "single", "2026-09-15T12:01:00.000Z");

  assert.notEqual(first.id, second.id);
  assert.equal(first.version, 1);
  assert.equal(second.version, 2);
  assert.equal(second.sourceCandidateId, "candidate-1");
});

test("批量导出脚本和分镜时生成一个无数组包装的纯文本文件内容", () => {
  const records = [
    { id: "one", title: "逐出宴会", version: 1, script: "完整脚本一", storyboardScript: "分镜脚本一" },
    { id: "two", title: "夺回婚礼", version: 2, script: "完整脚本二", storyboardScript: "分镜脚本二" },
  ];

  const text = buildPrefaceTextExport(records, "combined");

  assert.match(text, /逐出宴会 · V1/);
  assert.match(text, /完整脚本一/);
  assert.match(text, /分镜脚本二/);
  assert.doesNotMatch(text, /^\s*\[/);
  assert.doesNotMatch(text, /"storyboardScript"/);
});

test("批量生成最多同时执行两个任务并持续返回每项结果", async () => {
  let active = 0;
  let peak = 0;
  const completed = [];

  const result = await runPrefaceBatch([1, 2, 3, 4], 2, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    if (item === 3) throw new Error("第三项失败");
    return item * 10;
  }, (entry) => completed.push(entry));

  assert.equal(peak, 2);
  assert.deepEqual(result.map((entry) => entry.status), ["fulfilled", "fulfilled", "rejected", "fulfilled"]);
  assert.equal(completed.length, 4);
});
