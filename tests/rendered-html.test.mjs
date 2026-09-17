import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Lumina workbench shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Lumina Story Intelligence/);
  assert.match(html, /灵感大屏/);
  assert.match(html, /剧库/);
  assert.match(html, /内容工厂/);
  assert.match(html, /我的创作/);
  assert.match(html, /数据源管理/);
  assert.match(html, /任务中心/);
});

test("keeps the documented frontend modules integrated", async () => {
  const [page, inspiration, inspirationStore, library, factory, creations, operations] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/inspiration/InspirationWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/inspiration-material-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/features/library/DramaLibraryWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/factory/FactoryWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/creations/MyCreations.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/operations/OperationsWorkspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /usePersistentState/);
  assert.match(inspiration, /钩子原型/);
  assert.match(inspiration, /人工复核/);
  assert.match(inspiration, /进入人工复核/);
  assert.match(inspiration, /所有工作区成员均可操作/);
  assert.match(inspiration, /reviewHook/);
  assert.match(inspiration, /支撑结论/);
  assert.match(inspiration, /关键剧情证据/);
  assert.match(inspiration, /钩子原型库/);
  assert.match(inspiration, /同剧高光前置/);
  assert.match(inspiration, /跨剧／外部外搭/);
  assert.match(inspiration, /外搭来源待确认/);
  assert.match(inspiration, /钩子归属/);
  assert.match(inspiration, /ontologyValues\("relation"\)/);
  assert.match(inspiration, /ontologyValues\("emotion"\)/);
  assert.match(inspiration, /canonicalHookType/);
  assert.match(inspiration, /isKnownOntologyTag/);
  assert.match(inspiration, /compactTags=.*\["theme","relation","emotion"\]/);
  assert.doesNotMatch(inspiration, /\.slice\(0,7\)\.map/);
  assert.doesNotMatch(inspiration, /检测到镜头切换，回看片段确认/);
  assert.doesNotMatch(inspiration, /该素材已完成旧版分析，但尚未生成 material-v2/);
  assert.match(inspiration, /正在读取 material-v2 分析详情/);
  assert.match(inspiration, /detailRequests/);
  assert.match(inspiration, /existing\?\.analysisV2&&!item\.analysisV2/);
  assert.match(inspiration, /仅看分析完成/);
  assert.match(inspiration, /analysisFilter==="全部分析状态"\|\|item\.analysisStatus==="succeeded"/);
  assert.match(inspiration, /分段剧情时间线/);
  assert.match(inspiration, /全片剧情理解/);
  assert.doesNotMatch(inspiration, /详细剧情概况/);
  assert.doesNotMatch(inspiration, /客观事实台账/);
  assert.doesNotMatch(inspiration, /每条推断必须引用已验证事实/);
  assert.doesNotMatch(inspiration, /支撑上述结论的关键证据/);
  assert.match(inspiration, /拉片预览/);
  assert.match(inspiration, /video\.currentTime=target/);
  assert.match(inspiration, /钩子分析与拉片/);
  assert.match(inspiration, /剧情设定/);
  assert.match(inspiration, /声音与对白/);
  assert.match(inspiration, /画面与运镜/);
  assert.match(inspiration, /从钩子起点播放/);
  assert.match(inspiration, /time>=end/);
  assert.match(inspiration, /同一原片的限定钩子区间/);
  assert.match(inspiration, /aria-label="钩子区间进度"/);
  assert.match(inspiration, /Math\.max\(start,Math\.min\(end,seconds\)\)/);
  assert.match(inspiration, /duration\(relativeTime\).*duration\(hookLength\)/);
  assert.match(inspirationStore, /splitNarrativeClauses/);
  assert.match(inspirationStore, /opening=new Set\(\["“","‘","\\\""\]\)/);
  assert.doesNotMatch(inspiration, /buildStoryboardPhases/);
  assert.match(inspiration, /全片因果情节点/);
  assert.match(inspiration, /暂无可信结论/);
  assert.ok(inspirationStore.indexOf("pbFetch(`/api/collections/ad_materials/records/") < inspirationStore.indexOf("fetch(`/material-analysis/"), "material detail must prefer the live material-v2 record before static cache fallback");
  assert.match(library, /三级解析/);
  assert.match(library, /可投放区间/);
  assert.match(factory, /episode-narration/);
  assert.match(factory, /external-hook/);
  assert.match(creations, /我的收藏/);
  assert.match(creations, /我的草稿/);
  assert.match(operations, /字段与接口可用性/);
  assert.match(operations, /角色权限矩阵/);
});

test("reconciles material library membership after reanalysis", async () => {
  const [hook, inspiration] = await Promise.all([
    readFile(new URL("../pb_hooks/material_analysis.pb.js", import.meta.url), "utf8"),
    readFile(new URL("../app/features/inspiration/InspirationWorkspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(hook, /desiredAssetKinds/);
  assert.match(hook, /source_material = \{:source\}/);
  assert.match(hook, /desiredAssetKinds\.has\(existingAsset\.getString\("asset_kind"\)\)/);
  assert.match(inspiration, /requestedLibraryAsset\?\.kind === "ai_preface"/);
  assert.match(inspiration, /requestedLibraryAsset\?\.kind === "narration"/);
});

test("keeps live analysis progress and editable parse configuration wired", async () => {
  const [page, analysisStore, library] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/pocketbase-analysis-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/features/library/DramaLibraryWorkspace.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /分析 Worker/);
  assert.match(analysisStore, /current_stage/);
  assert.match(analysisStore, /worker_id/);
  assert.match(library, /drama\.parseConfig/);
  assert.match(library, /reanalyze/);
  assert.match(library, /parseConfig\.detail/);
});

test("keeps the external-hook production workflow explicit and evidence-backed", async () => {
  const [factory, analysis] = await Promise.all([
    readFile(new URL("../app/features/factory/FactoryWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/factory/components/ExternalHookAnalysis.tsx", import.meta.url), "utf8"),
  ]);

  for (const step of ["选择剧集", "生成并选择正片故事线", "按故事走向匹配外搭钩子", "设计过渡", "成片时间线", "质检", "预览和审核", "保存和导出"]) {
    assert.ok(factory.includes(step), `missing production workflow step: ${step}`);
  }
  assert.match(factory, /productionGate/);
  assert.match(factory, /真实数据驱动/);
  assert.match(factory, /高匹配分与结构证据不一致/);
  assert.match(analysis, /slice\(0, 3\)/);
  assert.match(analysis, /为什么从这里起播/);
  assert.match(analysis, /只处理必要连接，不生成多套相似过渡文案/);
  assert.match(analysis, /人物误认、事实冲突、承诺冲突与切点断裂/);
  assert.match(analysis, /确认连接并生成草稿/);
});

test("keeps the real-video preview switchable by connected episode", async () => {
  const factory = await readFile(new URL("../app/features/factory/FactoryWorkspace.tsx", import.meta.url), "utf8");

  assert.match(factory, /<span>切换剧集<\/span>[\s\S]*?<select[\s\S]*?value=\{previewEpisode \?\? ""\}/);
  assert.match(factory, /onChange=\{\(event\) =>[\s\S]*?setPreviewEpisode\(Number\(event\.target\.value\)\)/);
  assert.match(factory, /connectedEpisodes\.map\(\(episode\) => \([\s\S]*?<button[\s\S]*?onClick=\{\(\) => setPreviewEpisode\(episode\)\}/);
  assert.match(factory, /<video[\s\S]*?key=\{previewMedia\.url\}[\s\S]*?src=\{previewMedia\.url\}[\s\S]*?controls[\s\S]*?preload="metadata"/);
});

test("AI前贴库提供统一视频比例、六列密度和三类筛选", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../app/features/inspiration/MaterialLibraryPanelV2.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/inspiration/InspirationWorkspace.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /人物关系/);
  assert.match(source, /钩子类型/);
  assert.match(source, /题材类型/);
  assert.match(css, /aspect-ratio: 16\/9/);
  assert.match(css, /prefaceLibraryGrid/);
  assert.match(css, /grid-template-columns: repeat\(6/);
  assert.match(css, /aspect-ratio: 9\/16/);
});

test("钩子原型库和解说库复用AI前贴卡片的视频比例", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../app/features/inspiration/MaterialLibraryPanelV2.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/inspiration/InspirationWorkspace.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /kind === "narration" \? styles\.narrationLibraryGrid/);
  assert.match(source, /kind === "narration" \? styles\.narrationLibraryCard/);
  assert.match(source, /kind === "narration" \? styles\.narrationLibraryPreview/);
  assert.match(css, /\.hookAssetGrid[\s\S]*?grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.hookAssetPreview[\s\S]*?aspect-ratio: 9\/16/);
  assert.match(css, /\.hookAssetPreview video[\s\S]*?object-fit: cover/);
  assert.match(css, /\.hookAssetCard[\s\S]*?display: block/);
  assert.match(css, /\.narrationLibraryGrid[\s\S]*?grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.narrationLibraryPreview[\s\S]*?aspect-ratio: 9\s*\/\s*16/);
});

test("钩子库卡片只保留必要的播放与操作信息", async () => {
  const source = await readFile(new URL("../app/features/inspiration/InspirationWorkspace.tsx", import.meta.url), "utf8");
  const card = source.slice(source.indexOf("function HookAssetCard"), source.indexOf("function HookAssetCard") + 9000);
  for (const label of ["核心矛盾", "叙事承诺", "口播提炼", "安全边界"]) {
    assert.doesNotMatch(card, new RegExp(`<dt>${label}</dt>`));
  }
  assert.doesNotMatch(card, /<h3>\{hook\.title\}<\/h3>/);
});

test("人工复核入库使用切割区间而不是完整素材", async () => {
  const source = await readFile(new URL("../pb_hooks/material_analysis.pb.js", import.meta.url), "utf8");
  const reviewRoute = source.slice(source.indexOf('/api/lumina/materials/{id}/type-review'), source.indexOf('/api/lumina/prompt-fission-plans'));
  assert.match(reviewRoute, /narrationRanges/);
  assert.match(reviewRoute, /source_ranges/);
  assert.match(reviewRoute, /assembled_duration/);
  assert.doesNotMatch(reviewRoute, /kind === "ai_preface" \? Math\.max\(1, Math\.ceil\(prefaceEnd\)\) : 0/);
});

test("分析回写按素材与库类型幂等更新，避免重复资产", async () => {
  const source = await readFile(new URL("../pb_hooks/material_analysis.pb.js", import.meta.url), "utf8");
  const completion = source.slice(source.indexOf('routerAdd("PATCH", "/api/lumina/material-analysis/jobs/{id}"'), source.indexOf('routerAdd("POST", "/api/lumina/material-analysis/jobs/{id}/retry"'));
  assert.match(completion, /source_material = \{\:source\} && asset_kind = \{\:kind\}/);
  assert.match(completion, /canonicalAssets/);
});

test("三个素材库提供入库时间排序与统一钩子类型", async () => {
  const [panel, inspiration, css] = await Promise.all([
    readFile(new URL("../app/features/inspiration/MaterialLibraryPanelV2.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/inspiration/InspirationWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/inspiration/InspirationWorkspace.module.css", import.meta.url), "utf8"),
  ]);
  for (const label of ["反差", "强冲突", "情绪拉升", "身份揭示", "信息差", "悬念预告"]) assert.match(panel, new RegExp(label));
  assert.match(panel, /sortOrder/);
  assert.match(inspiration, /setSortOrder/);
  assert.match(panel, /libraryDurationBadge/);
  assert.match(css, /\.libraryDurationBadge/);
  assert.doesNotMatch(panel, /AI PREFACE LIBRARY/);
  assert.doesNotMatch(panel, /NARRATION LIBRARY/);
  assert.doesNotMatch(inspiration.slice(inspiration.indexOf("function HookPrototypePanel"), inspiration.indexOf("function HookPrototypePanel") + 8000), /<h2>钩子原型库<\/h2>/);
});

test("素材视频时长以无背景文字显示", async () => {
  const css = await readFile(new URL("../app/features/inspiration/InspirationWorkspace.module.css", import.meta.url), "utf8");
  const badge = css.slice(css.indexOf(".libraryDurationBadge"), css.indexOf(".libraryDurationBadge") + 500);
  assert.match(badge, /background:\s*transparent/);
  assert.doesNotMatch(badge, /background:\s*#101725c9/);
});

test("悬停播放中断不会产生未处理 Promise", async () => {
  const source = await readFile(new URL("../app/features/inspiration/MaterialLibraryPanelV2.tsx", import.meta.url), "utf8");
  const hoverStart = source.indexOf("onMouseEnter");
  const hoverBlock = source.slice(hoverStart, source.indexOf("onMouseLeave", hoverStart));
  assert.match(hoverBlock, /\.play\(\)\.catch\(\(\) => undefined\)/);
});

test("灵感大屏不呈现独立的素材分析模块", async () => {
  const source = await readFile(new URL("../app/features/inspiration/InspirationWorkspace.tsx", import.meta.url), "utf8");
  const tabs = source.slice(source.indexOf("const tabs"), source.indexOf("const tabs") + 1200);
  assert.doesNotMatch(tabs, /\["analysis",\s*"素材分析"\]/);
  assert.doesNotMatch(source, /\{tab === "analysis" &&/);
});
