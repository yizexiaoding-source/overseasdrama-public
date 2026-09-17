import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("母版客户端暴露单条和批量片段分析接口并映射持久化状态", async () => {
  const source = await readFile(new URL("../app/lib/material-library-store.ts", import.meta.url), "utf8");
  assert.match(source, /enqueuePrefaceAnalysis/);
  assert.match(source, /enqueueIncompletePrefaceAnalysis/);
  assert.match(source, /prefaceAnalysisStatus/);
  assert.match(source, /prefaceAnalysisProgress/);
  assert.match(source, /prefaceAnalysisError/);
});
