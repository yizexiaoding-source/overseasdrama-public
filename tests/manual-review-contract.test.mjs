import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("manual type review separates evidence review and derives exclusive library routing", async () => {
  const workspace = await readFile(new URL("app/features/inspiration/InspirationWorkspace.tsx", root), "utf8");
  const hook = await readFile(new URL("pb_hooks/material_analysis.pb.js", root), "utf8");

  assert.match(workspace, /类型分流/);
  assert.match(workspace, /内容证据/);
  assert.match(workspace, /钩子边界/);
  assert.match(workspace, /是否存在独立制作的前贴/);
  assert.match(workspace, /是否存在独立解说口播/);
  assert.match(workspace, /进入 AI 前贴库和解说库/);

  assert.match(hook, /\/api\/lumina\/materials\/\{id\}\/type-review/);
  assert.match(hook, /resolvedPreface \? "AI前贴" : resolvedNarration \? "解说" : "原剧拼接"/);
  assert.match(hook, /\[resolvedPreface \? "ai_preface" : "", resolvedNarration \? "narration" : ""\]/);
  assert.match(hook, /if \(!libraryKinds\.includes\(asset\.getString\("asset_kind"\)\)\) e\.app\.delete\(asset\)/);
  assert.match(hook, /asset\.set\("clip_status", ranges\.length \? "pending" : "missing_evidence"\)/);
  assert.match(hook, /analysis_status: conclusive \? "queued"/);
});

test("insufficient evidence stays undetermined and cannot enter a dedicated library", async () => {
  const hook = await readFile(new URL("pb_hooks/material_analysis.pb.js", root), "utf8");
  assert.match(hook, /const libraryKinds = !conclusive \? \[\]/);
  assert.match(hook, /action === "confirm" && \(hasPreface === "uncertain" \|\| hasNarration === "uncertain"\)/);
  assert.match(hook, /action === "insufficient" && !note/);
});

test("returning a type decision for reanalysis clears the manual override", async () => {
  const workspace = await readFile(new URL("app/features/inspiration/InspirationWorkspace.tsx", root), "utf8");
  const hook = await readFile(new URL("pb_hooks/material_analysis.pb.js", root), "utf8");
  assert.match(workspace, /retryInspirationMaterialAnalysis\([\s\S]*?item\.id,[\s\S]*?true,[\s\S]*?true,/);
  assert.match(hook, /body\.clear_type_review === true/);
  assert.match(hook, /material\.set\("manual_override", \{\}\)/);
  assert.match(hook, /nextResult\.typeReview = \{ status: "reanalyzing"/);
});

test("manual preface review never invents a full-source or fixed 15-second boundary", async () => {
  const hook = await readFile(new URL("pb_hooks/material_analysis.pb.js", root), "utf8");
  const helpers = await readFile(new URL("pb_hooks/material_analysis_helpers.js", root), "utf8");

  assert.match(helpers, /resolvePrefaceBoundary/);
  assert.match(hook, /helpers\.resolvePrefaceBoundary\(result, duration\)/);
  assert.doesNotMatch(hook, /Math\.min\(duration \|\| 15, 15\)/);
  assert.match(hook, /"missing_evidence"/);
});
