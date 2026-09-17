import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("deduplicates an ADX batch before concurrent intake and keeps server hash fallbacks", async () => {
  const [consoleSource, intakeSource] = await Promise.all([
    read("app/features/operations/ExternalDataConsole.tsx"),
    read("app/api/material-intake/route.ts"),
  ]);
  assert.match(consoleSource, /const batchKeys=new Set<string>\(\)/);
  assert.match(consoleSource, /const uniqueItems=items\.filter/);
  assert.match(intakeSource, /source_identity_hash=.*content_hash=.*source_url=/s);
  assert.match(intakeSource, /const contentDuplicate=await findExisting/);
  assert.match(intakeSource, /A concurrent intake may have won either unique index/);
});

test("streams preface regeneration and saves only after continuity validation", async () => {
  const source = await read("app/api/prompt-storyboard/route.ts");
  assert.match(source, /stream:\s*true/);
  assert.match(source, /type:\s*"delta"/);
  assert.match(source, /scriptCoverageIssues/);
  assert.ok(source.indexOf("scriptCoverageIssues(script") < source.indexOf("savePromptVersion(PB_URL, assetId, \"script\""));
  assert.match(source, /画面中真正参与剧情、推动理解的文字必须原样写入本字段/);
  assert.match(source, /这不适用于画面中真实存在、承担剧情信息的文字/);
  assert.match(source, /stripNonNarrativeText/);
});

test("shows analyzed narration copy and supports streamed, versioned regeneration", async () => {
  const [panel, route, hook] = await Promise.all([
    read("app/features/inspiration/MaterialLibraryPanelV2.tsx"),
    read("app/api/narration-script/route.ts"),
    read("pb_hooks/material_analysis.pb.js"),
  ]);
  assert.match(panel, /regenerateNarrationScript/);
  assert.match(panel, /narrationScriptVersions/);
  assert.match(route, /不得把画内角色对白/);
  assert.match(route, /stream:\s*true/);
  assert.match(route, /speech-evidence/);
  assert.match(route, /analysis-worker-asr/);
  assert.match(route, /if \(!visualInput && !audioEvidence\.length\)/);
  assert.match(hook, /\/speech-evidence/);
  assert.match(hook, /\$os\.readFile\(evidencePath\)/);
  assert.match(hook, /narration_script:\s*"narrationScriptVersions"/);
});

test("preserves JSON blueprint history when adding prompt versions", async () => {
  const hook = await read("pb_hooks/material_analysis.pb.js");
  assert.match(hook, /JSON\.parse\(asset\.getString\("prompt_blueprint"\)/);
  assert.match(hook, /\[\.\.\.previous, saved\]\.slice\(-20\)/);
});

test("supports link batches and presents running-material IDs as serial numbers", async () => {
  const source = await read("app/features/inspiration/InspirationWorkspace.tsx");
  assert.match(source, /saveExternalInspirationReference/);
  assert.match(source, /批量视频链接（可选）/);
  assert.match(source, /new Set\(remoteUrls\.split/);
  assert.match(source, /序号 \{String\(ordinal\)\.padStart\(3, "0"\)\}/);
});

test("uses production-oriented preface fission controls rather than marketing goals", async () => {
  const [panel, route] = await Promise.all([
    read("app/features/inspiration/MaterialLibraryPanelV2.tsx"),
    read("app/api/prompt-fission/route.ts"),
  ]);
  assert.match(panel, /正片接片方式/);
  assert.match(panel, /故事引擎/);
  assert.match(panel, /本地化裂变/);
  assert.doesNotMatch(panel, /强化首帧停留/);
  assert.match(route, /what_next/);
  assert.match(route, /suspense_ending/);
  assert.match(route, /不得出现标题、片名、字幕、画面文字、水印/);
  assert.match(route, /onScreenTextLanguage: "none"/);
});

test("defines preface fission around transferable mechanisms and target plot slots", async () => {
  const [panel, route] = await Promise.all([
    read("app/features/inspiration/MaterialLibraryPanelV2.tsx"),
    read("app/api/prompt-fission/route.ts"),
  ]);
  assert.match(panel, /母版核心机制/);
  assert.match(panel, /目标题材与核心冲突/);
  assert.match(panel, /剧情槽位映射/);
  assert.match(panel, /故事引擎/);
  assert.match(panel, /弱者报恩预警型/);
  assert.match(route, /targetGenre/);
  assert.match(route, /plotSlots/);
  assert.match(route, /handoffMethod/);
  assert.match(route, /允许新增目标题材中的异常动作和冲突事件/);
});

test("allows bounded creative conflict while treating source surface story as variable", async () => {
  const [panel, route, domain] = await Promise.all([
    read("app/features/inspiration/MaterialLibraryPanelV2.tsx"),
    read("app/api/prompt-fission/route.ts"),
    read("app/lib/prompt-fission-domain.ts"),
  ]);
  assert.match(panel, /冲突创作强度/);
  assert.match(route, /允许新增目标题材中的异常动作和冲突事件/);
  assert.match(route, /人物关系、具体动作和故事背景都是可替换变量/);
  assert.match(route, /creativeAdditions/);
  assert.match(domain, /creativeAdditions/);
});

test("defines fifteen preface branches as five story engines with three conflict branches", async () => {
  const [panel, route, domain] = await Promise.all([
    read("app/features/inspiration/MaterialLibraryPanelV2.tsx"),
    read("app/api/prompt-fission/route.ts"),
    read("app/lib/prompt-fission-domain.ts"),
  ]);
  assert.match(panel, /V1—V5/);
  assert.match(panel, /现实适配/);
  assert.match(panel, /异常事件/);
  assert.match(panel, /高冲突翻转/);
  assert.match(route, /五个故事引擎/);
  assert.match(route, /A=现实适配/);
  assert.match(route, /恰好十五组/);
  assert.match(domain, /branch/);
  assert.match(domain, /storyEngine/);
  assert.match(domain, /十五组/);
});

test("defines the AI preface creative center and its low-supervision workflows", async () => {
  const [page, workspace, domain, route] = await Promise.all([
    read("app/page.tsx"),
    read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"),
    read("app/lib/preface-creative-domain.ts"),
    read("app/api/preface-creative/plan/route.ts"),
  ]);
  assert.match(page, /AI前贴创意/);
  assert.match(page, /preface-creative/);
  assert.match(workspace, /前贴创意策划/);
  assert.match(workspace, /前贴迭代复刻/);
  assert.match(workspace, /前贴精准匹配/);
  assert.match(workspace, /低频监督/);
  assert.match(domain, /audiencePromise/);
  assert.match(domain, /storyModel/);
  assert.match(domain, /compatibility/);
  assert.match(route, /5.?15/);
  assert.match(route, /只有一次明确反转/);
});
