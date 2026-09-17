import assert from "node:assert/strict";
import test from "node:test";

import { inspectCreativeIdeas, mergeCreativeIdeas } from "../app/lib/preface-creative-domain.ts";

test("候选校验保留可用前贴，并说明每条被拒绝的原因", () => {
  const result = inspectCreativeIdeas([
    { id: "usable", title: "她当众撕毁婚约", script: "未婚夫要她交出继承权，她反手撕毁婚约。" },
    { id: "english-field", title: "她当众撕毁婚约", script: "未婚夫要她交出继承权，她反手撕毁婚约。", videoPrompt: "cinematic close up" },
    { id: "english-title", title: "The Broken Contract", script: "未婚夫要她交出继承权，她反手撕毁婚约。" },
    { id: "missing-script", title: "没有脚本的候选" },
  ]);

  assert.deepEqual(result.ideas.map((item) => item.id), ["usable", "english-field"]);
  assert.deepEqual(result.rejections, [
    { id: "english-title", reason: "标题或剧情动作描述缺少中文" },
    { id: "missing-script", reason: "缺少可执行脚本" },
  ]);
});

test("补齐候选会去除重复创意并重新分配稳定编号", () => {
  const idea = (id, title) => inspectCreativeIdeas([{ id, title, script: "人物被逼交出资源，立即反击。", openingAction: "当众拦下对方" }]).ideas[0];
  const merged = mergeCreativeIdeas(
    [idea("idea-1", "继承权被夺")],
    [idea("idea-1", "继承权被夺"), idea("idea-2", "婚约被毁")],
    10,
  );

  assert.deepEqual(merged.map((item) => [item.id, item.title]), [["idea-1", "继承权被夺"], ["idea-2", "婚约被毁"]]);
});

test("文档规定的中英混合标签不会被误判为非法英文内容", () => {
  const result = inspectCreativeIdeas([{ title: "身份冲突", script: "她当众拒绝服从。", genreTags: ["LGBT+关系"], characterSettings: ["Alpha型角色"] }]);
  assert.equal(result.ideas.length, 1);
  assert.equal(result.rejections.length, 0);
});

test("对白和技术字段可以保留英文，但剧情与动作描述仍需中文", () => {
  const result = inspectCreativeIdeas([{ title: "身份冲突", script: "She refuses.（她拒绝服从。）", videoPrompt: "cinematic close up", dialogue: [{ speaker: "她", english: "I refuse.", translation: "我拒绝。" }] }]);
  assert.equal(result.ideas.length, 1);
});
