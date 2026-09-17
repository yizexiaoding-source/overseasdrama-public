import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("前贴分析任务允许片段从 0 秒开始", async () => {
  const source = await read("pb_migrations/1787651200_allow_zero_preface_clip_start.js");
  let up;
  vm.runInNewContext(source, {
    migrate: (forward) => { up = forward; },
  });

  const field = { required: true };
  let saved = false;
  up({
    findCollectionByNameOrId: () => ({ fields: { getByName: () => field } }),
    save: () => { saved = true; },
  });

  assert.equal(field.required, false);
  assert.equal(saved, true);
});

test("批量补全遇到无效母版时继续处理后续母版", async () => {
  const source = await read("pb_hooks/preface_analysis_helpers.js");
  const module = { exports: {} };
  class BadRequestError extends Error {}
  vm.runInNewContext(source, { module, BadRequestError, Record: class {} });

  const makeAsset = (id, start, end) => ({
    id,
    get: () => ({}),
    getString: (key) => key === "asset_kind" ? "ai_preface" : key === "source_material" ? `material-${id}` : "",
    getFloat: (key) => key === "clip_start_seconds" ? start : end,
    set() {},
  });
  const app = {
    findRecordById: () => ({ getString: () => "" }),
    save() {},
  };

  const result = module.exports.enqueueIncomplete(app, [
    makeAsset("invalid", 0, 0),
    makeAsset("valid-no-media", 0, 15),
  ]);

  assert.equal(result.total, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.no_media, 1);
  assert.deepEqual(Array.from(result.failures, (item) => item.asset), ["invalid"]);
});

test("PocketBase 字段校验错误转换为可执行的中文提示", async () => {
  const { pocketBaseFailureMessage } = await import("../app/lib/pocketbase-errors.ts");
  const message = pocketBaseFailureMessage({
    message: "Something went wrong while processing your request.",
    data: { clip_start_seconds: { code: "validation_required", message: "Cannot be blank." } },
  }, 400, "补全分析提交失败");

  assert.equal(message, "分析任务数据校验失败：片段起始时间不能为空");
});
