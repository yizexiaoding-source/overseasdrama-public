import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("开发服务会把本地 Gemini 代理传给 Node 的 fetch", async () => {
  const source = await readFile(new URL("../scripts/dev-server.mjs", import.meta.url), "utf8");
  assert.match(source, /LUMINA_HTTP_PROXY/);
  assert.match(source, /HTTPS_PROXY/);
  assert.match(source, /NODE_USE_ENV_PROXY/);
});
