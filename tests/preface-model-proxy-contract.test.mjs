import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("前贴模型请求显式使用本地代理，而不依赖运行时是否自动读取系统代理", async () => {
  const [helper, sidecar, analyze, plan] = await Promise.all([
    read("app/lib/server/model-request.ts"),
    read("scripts/model-proxy.mjs"),
    read("app/api/preface-creative/analyze/route.ts"),
    read("app/api/preface-creative/plan/route.ts"),
  ]);
  assert.match(helper, /LUMINA_HTTP_PROXY/);
  assert.match(helper, /X-Lumina-Upstream/);
  assert.match(sidecar, /ProxyAgent/);
  assert.match(sidecar, /127\.0\.0\.1/);
  assert.match(sidecar, /EADDRINUSE/);
  assert.match(analyze, /modelFetch/);
  assert.match(plan, /modelFetch/);
});
