# AI Preface Cut, Analysis, and Storyboard Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every AI preface is boundary-verified, physically clipped, analyzed with one shared contract, and able to produce a continuous storyboard prompt without repeated full-generation failures.

**Architecture:** Introduce one evidence-based boundary resolver shared by automatic classification and manual review, make clipped media the production gate for AI-preface assets, and expose one shared analysis view-model to both UI surfaces. Replace free-text-only timeline retry with structured shot parsing, deterministic small-gap normalization, and targeted large-gap repair.

**Tech Stack:** Python analysis worker and pytest, PocketBase JavaScript hooks, Next.js/Vinext TypeScript API routes, React, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-16-ai-preface-cut-analysis-storyboard-reliability.md`

## Global Constraints

- Only change the AI-preface path; narration, running materials, hook prototypes, and factory production remain behaviorally unchanged.
- Never create an AI-preface library asset from the full source duration when a verified boundary is absent.
- All stored presentation times are whole seconds; internal detection may retain decimal precision.
- Keep updates idempotent by `source_material + asset_kind` and preserve prior saved script versions.
- Implement every task test-first.

---

### Task 1: Centralize evidence-based preface boundary resolution

**Files:**
- Create: `processor/preface_boundary.py`
- Modify: `processor/material_routing.py:263`
- Test: `tests/test_preface_boundary.py`
- Test: `tests/test_material_library_routing.py`

**Interfaces:**
- Consumes: normalized material analysis and source duration.
- Produces: `resolve_preface_boundary(analysis: dict[str, Any], duration_seconds: float) -> PrefaceBoundaryDecision` with `start`, `end`, `source`, `confidence`, `evidence`, and `valid`.

- [ ] **Step 1: Write failing boundary-priority tests**

```python
def test_uses_segment_handoff_when_hook_and_body_transition_are_missing():
    analysis = {"content": {"segments": [
        {"label": "搞笑引入", "start": 0, "end": 9, "verification": "verified"},
        {"label": "剧情展开", "start": 9.067, "end": 15, "verification": "verified"},
    ]}, "creative": {"hooks": [], "transitions": [
        {"label": "场景转换", "start": 9.067, "end": 9.067, "verification": "verified"}
    ]}}
    decision = resolve_preface_boundary(analysis, 153.669955)
    assert decision.valid is True
    assert decision.start == 0
    assert decision.end == 9.067
    assert decision.source in {"verified_transition", "segment_handoff"}

def test_manual_preface_without_boundary_never_uses_full_duration():
    decision = classify_material_asset(
        {"creative": {"openingAssetOrigin": {"label": "AI生成前贴", "verification": "verified"}}},
        "video", duration_seconds=153.669955,
        manual_override={"hasPreface": "yes", "hasNarration": "no"},
    )
    assert decision.library_bucket == "running"
    assert decision.review_required is True
    assert decision.clip_range is None
```

- [ ] **Step 2: Run the boundary tests and confirm failure**

Run: `python -m pytest tests/test_preface_boundary.py tests/test_material_library_routing.py -q`

Expected: failure because `resolve_preface_boundary` does not exist and the current manual override returns `ai_preface` with no range.

- [ ] **Step 3: Implement the resolver and route all classification through it**

```python
@dataclass(frozen=True)
class PrefaceBoundaryDecision:
    start: float = 0.0
    end: float = 0.0
    source: str = "missing"
    confidence: float = 0.0
    evidence: tuple[dict[str, Any], ...] = ()

    @property
    def valid(self) -> bool:
        return self.end > self.start >= 0

def resolve_preface_boundary(analysis: dict[str, Any], duration_seconds: float) -> PrefaceBoundaryDecision:
    creative = analysis.get("creative") if isinstance(analysis.get("creative"), dict) else {}
    content = analysis.get("content") if isinstance(analysis.get("content"), dict) else {}
    hooks = creative.get("hooks") if isinstance(creative.get("hooks"), list) else []
    if isinstance(creative.get("hook"), dict):
        hooks = [creative["hook"], *hooks]
    for hook in hooks:
        if hook.get("verification") == "verified" and float(hook.get("end") or 0) > float(hook.get("start") or 0):
            return PrefaceBoundaryDecision(float(hook.get("start") or 0), min(duration_seconds, float(hook["end"])), "verified_hook", float(hook.get("confidence") or 0), tuple(hook.get("evidence") or ()))
    transition = creative.get("bodyTransition") if isinstance(creative.get("bodyTransition"), dict) else {}
    transition_at = float(transition.get("start") or transition.get("time") or 0)
    if transition_at > 0 and transition.get("verification") == "verified":
        return PrefaceBoundaryDecision(0, min(duration_seconds, transition_at), "body_transition", float(transition.get("confidence") or 0), tuple(transition.get("evidence") or ()))
    transitions = creative.get("transitions") if isinstance(creative.get("transitions"), list) else []
    verified = sorted((row for row in transitions if isinstance(row, dict) and row.get("verification") == "verified" and float(row.get("start") or row.get("time") or 0) > 0), key=lambda row: float(row.get("start") or row.get("time") or 0))
    if verified:
        at = float(verified[0].get("start") or verified[0].get("time"))
        return PrefaceBoundaryDecision(0, min(duration_seconds, at), "verified_transition", float(verified[0].get("confidence") or 0), tuple(verified[0].get("evidence") or ()))
    segments = sorted((row for row in content.get("segments", []) if isinstance(row, dict) and row.get("verification") == "verified"), key=lambda row: float(row.get("start") or 0))
    for previous, current in zip(segments, segments[1:]):
        if re.search(r"前贴|引入|钩子|广告", str(previous.get("label") or previous.get("description") or "")) and re.search(r"正片|剧情|主线", str(current.get("label") or current.get("description") or "")):
            at = float(current.get("start") or previous.get("end") or 0)
            return PrefaceBoundaryDecision(0, min(duration_seconds, at), "segment_handoff", min(float(previous.get("confidence") or 0), float(current.get("confidence") or 0)), ())
    return PrefaceBoundaryDecision()
```

In `classify_material_asset`, replace the manual override's local `hook/bodyTransition` lookup with this resolver. When `hasPreface=yes` but `decision.valid` is false, return `未判定/running/review_required=True` with reason `人工确认存在前贴，但缺少可执行边界`.

- [ ] **Step 4: Run the tests and confirm the correct 9.067-second boundary**

Run: `python -m pytest tests/test_preface_boundary.py tests/test_material_library_routing.py -q`

Expected: all tests pass; no path returns `(0, full_duration)` solely because manual type is AI preface.

- [ ] **Step 5: Commit**

```bash
git add processor/preface_boundary.py processor/material_routing.py tests/test_preface_boundary.py tests/test_material_library_routing.py
git commit -m "fix: resolve ai preface boundaries from verified evidence"
```

### Task 2: Make physical clipping an AI-preface asset gate

**Files:**
- Modify: `processor/job_worker.py:445-650`
- Modify: `pb_hooks/material_analysis.pb.js:170-230`
- Modify: `pb_hooks/material_analysis.pb.js:360-465`
- Test: `tests/test_preface_segment_analysis.py`
- Test: `tests/manual-review-contract.test.mjs`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: a valid `PrefaceBoundaryDecision` and source video.
- Produces: one canonical asset with `media_file`, `source_ranges`, `assembled_duration`, `clip_status=ready`, and segment-scoped analysis.

- [ ] **Step 1: Write failing tests for clipped asset completeness**

```python
def test_ai_preface_asset_requires_ready_clip(tmp_path, monkeypatch):
    # Arrange a 153.67-second source and a verified 0-9.067 boundary.
    # Assert the worker emits a local clipped file, source range, and ready status.
    assert payload["clip_start_seconds"] == 0
    assert payload["clip_end_seconds"] == 10
    assert payload["source_ranges"] == [{"start": 0, "end": 10}]
    assert payload["assembled_duration"] == 10
    assert payload["clip_status"] == "ready"
    assert payload["local_media_path"].endswith("-ai-preface.mp4")
```

Add a hook contract assertion that manual review writes `missing_evidence` and queues reanalysis when no boundary exists; it must not write the full duration into `clip_end_seconds`.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `python -m pytest tests/test_preface_segment_analysis.py -q && node --test tests/manual-review-contract.test.mjs`

Expected: failure because AI-preface payloads do not consistently set `source_ranges`, `assembled_duration`, or `clip_status=ready`, and manual review still synthesizes a fallback boundary.

- [ ] **Step 3: Emit a complete clipped asset from the worker**

After `_cut_ai_preface` succeeds, populate all clip fields:

```python
library_asset.update({
    "local_media_path": str(clip_path.resolve()),
    "content_hash": clip_hash,
    "clip_start_seconds": math.floor(start),
    "clip_end_seconds": math.ceil(end),
    "source_ranges": [{"start": math.floor(start), "end": math.ceil(end)}],
    "assembled_duration": math.ceil(end) - math.floor(start),
    "clip_status": "ready",
})
```

If a valid boundary is missing or FFmpeg fails, emit `clip_status=missing_evidence/failed`, omit `local_media_path`, and do not expose the record as a usable AI-preface card.

- [ ] **Step 4: Harden PocketBase completion and manual review**

In `material_analysis.pb.js`, accept an AI-preface asset as usable only when `clip_status === "ready"`, `clip_end_seconds > clip_start_seconds`, and `local_media_path` produced a saved `media_file`. Manual review may queue analysis and create a pending record, but must not fill `clip_end_seconds` with source duration.

- [ ] **Step 5: Run the focused and regression tests**

Run: `python -m pytest tests/test_preface_segment_analysis.py tests/test_material_library_routing.py -q && node --test tests/manual-review-contract.test.mjs tests/rendered-html.test.mjs`

Expected: all pass; repeated completion updates the canonical asset instead of adding a duplicate.

- [ ] **Step 6: Commit**

```bash
git add processor/job_worker.py pb_hooks/material_analysis.pb.js tests/test_preface_segment_analysis.py tests/manual-review-contract.test.mjs tests/rendered-html.test.mjs
git commit -m "fix: gate ai preface library on physical clipping"
```

### Task 3: Unify isolated preface analysis and presentation logic

**Files:**
- Create: `app/lib/preface-analysis-view-model.ts`
- Modify: `processor/job_worker.py:130-180`
- Modify: `app/features/inspiration/MaterialLibraryPanelV2.tsx:300-420`
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.tsx:35-150`
- Test: `tests/preface-replication-workflow.test.mjs`
- Create: `tests/preface-analysis-view-model.test.mjs`

**Interfaces:**
- Consumes: `MaterialLibraryAsset.sourceAnalysis`, `promptBlueprint`, `hitReasons`.
- Produces: `buildPrefaceAnalysisView(asset)` returning `{ creativeApproach, replicationLines, handoff, evidence, missing }`.

- [ ] **Step 1: Write failing shared-view tests**

```js
test("AI前贴库与创意母版使用同一分析视图", async () => {
  const source = await read("app/lib/preface-analysis-view-model.ts");
  assert.match(source, /buildPrefaceAnalysisView/);
  for (const field of ["creativeApproach", "replicationLines", "handoff", "evidence", "missing"])
    assert.match(source, new RegExp(field));
  assert.match(await read("app/features/inspiration/MaterialLibraryPanelV2.tsx"), /buildPrefaceAnalysisView/);
  assert.match(await read("app/features/preface-creative/PrefaceCreativeWorkspace.tsx"), /buildPrefaceAnalysisView/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/preface-analysis-view-model.test.mjs tests/preface-replication-workflow.test.mjs`

Expected: failure because the two components currently derive different fields independently.

- [ ] **Step 3: Implement the shared view-model**

```ts
export type PrefaceAnalysisView = {
  creativeApproach: string;
  replicationLines: Array<{ label: "保留" | "关系" | "开场" | "节奏"; value: string }>;
  handoff: string;
  evidence: Array<{ start: number; end: number; text: string }>;
  missing: string[];
};

export function buildPrefaceAnalysisView(asset: MaterialLibraryAsset): PrefaceAnalysisView {
  const analysis = object(asset.sourceAnalysis);
  const content = object(analysis.content);
  const creative = object(analysis.creative);
  const summary = text(creative.creativeSummary) || text(content.summary);
  const mechanism = text(creative.replicationMechanism);
  const opening = text(creative.openingAction);
  const handoff = text(creative.handoff);
  const relations = labels(content.relations || content.relationships).join("、");
  const evidence = observations(content.observations)
    .filter((item) => item.start >= asset.clipStart && item.end <= asset.clipEnd)
    .map((item) => ({ start: item.start, end: item.end, text: item.text }));
  const replicationLines = [
    { label: "保留" as const, value: mechanism },
    { label: "关系" as const, value: relations },
    { label: "开场" as const, value: opening },
  ].filter((item) => item.value);
  const missing = [
    ["创作思路", summary], ["复刻机制", mechanism], ["开场动作", opening], ["衔接正片方向", handoff],
  ].filter(([, value]) => !value).map(([label]) => label);
  return { creativeApproach: summary, replicationLines, handoff, evidence, missing };
}
```

Use the exact same view in the light AI-preface detail page and the creative mother-template preview. Keep the existing light visual style; only unify analysis logic and wording.

- [ ] **Step 4: Make isolated analysis output the shared contract fields**

Update `_segment_library_analysis` to emit `creativeSummary`, `replicationMechanism`, `openingAction`, and `handoff` from clip-scoped verified evidence. Do not reuse full-source summary outside the clip scope.

- [ ] **Step 5: Run UI contract tests**

Run: `node --test tests/preface-analysis-view-model.test.mjs tests/preface-replication-workflow.test.mjs && npx eslint app/lib/preface-analysis-view-model.ts app/features/inspiration/MaterialLibraryPanelV2.tsx app/features/preface-creative/PrefaceCreativeWorkspace.tsx`

Expected: both screens render `创作思路 / 复刻思路 / 衔接正片方向` from one function.

- [ ] **Step 6: Commit**

```bash
git add app/lib/preface-analysis-view-model.ts processor/job_worker.py app/features/inspiration/MaterialLibraryPanelV2.tsx app/features/preface-creative/PrefaceCreativeWorkspace.tsx tests/preface-analysis-view-model.test.mjs tests/preface-replication-workflow.test.mjs
git commit -m "refactor: unify ai preface analysis presentation"
```

### Task 4: Replace full-script retry with deterministic continuity repair

**Files:**
- Create: `app/lib/preface-storyboard-timeline.ts`
- Modify: `app/api/prompt-storyboard/route.ts:1-190`
- Modify: `app/features/inspiration/MaterialLibraryPanelV2.tsx:180-430`
- Create: `tests/preface-storyboard-timeline.test.mjs`
- Modify: `tests/preface-replication-workflow.test.mjs`

**Interfaces:**
- Consumes: structured model shots and the probed clipped-file duration.
- Produces: `normalizeStoryboardTimeline(shots, duration)` and `storyboardCoverageIssues(shots, duration)`.

- [ ] **Step 1: Write failing normalization tests**

```ts
const repaired = normalizeStoryboardTimeline([
  { start: 0, end: 2.9, description: "A" },
  { start: 3.1, end: 6.8, description: "B" },
  { start: 6.7, end: 9.0, description: "C" },
], 9.067);
assert.deepEqual(repaired.map(({ start, end }) => [start, end]), [
  [0, 3], [3, 6.75], [6.75, 9.067],
]);
assert.deepEqual(storyboardCoverageIssues(repaired, 9.067), []);
```

Add a large-gap test where `3–6 seconds` is returned as a targeted repair interval instead of causing the whole script to be discarded.

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/preface-storyboard-timeline.test.mjs`

Expected: failure because the normalizer and targeted-gap interface do not exist.

- [ ] **Step 3: Implement timeline normalization**

```ts
export function normalizeStoryboardTimeline(shots: StoryboardShot[], duration: number) {
  const ordered = shots.filter(validShot).sort((a, b) => a.start - b.start);
  ordered[0].start = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const gap = ordered[i].start - ordered[i - 1].end;
    if (Math.abs(gap) <= 0.5) {
      const boundary = roundToHundredth((ordered[i].start + ordered[i - 1].end) / 2);
      ordered[i - 1].end = boundary;
      ordered[i].start = boundary;
    }
  }
  ordered.at(-1)!.end = duration;
  return ordered;
}
```

- [ ] **Step 4: Make the model return structured shots and repair only large gaps**

Change `/api/prompt-storyboard` to request `{ "shots": [{ "start": 0, "end": 1.8, "scene": "", "action": "", "speech": [], "sound": "", "transition": "" }] }`. After the first pass, normalize small gaps. For every remaining gap larger than `0.5` seconds, call the multimodal model with only that time range and request one or more replacement shots. Merge, normalize, validate, render the final prompt, then save.

The API must derive duration from the clipped `media_file` when present. If the asset is not `ready`, return HTTP 422 with `前贴片段尚未完成切割，请先重新分析或人工确认边界` before model invocation.

- [ ] **Step 5: Update UI gating and status copy**

Disable regeneration when `asset.clipStatus !== "ready"` or `asset.mediaUrl` is absent. Show distinct progress states: `读取裁剪片段` → `逐镜生成` → `修复缺失区间` → `连续性校验通过` → `保存版本`.

- [ ] **Step 6: Run API, timeline, and UI tests**

Run: `node --test tests/preface-storyboard-timeline.test.mjs tests/preface-replication-workflow.test.mjs tests/rendered-html.test.mjs && npm run build`

Expected: small gaps are repaired without another full generation; large gaps trigger bounded repair; an uncut 153-second asset is rejected before generation.

- [ ] **Step 7: Commit**

```bash
git add app/lib/preface-storyboard-timeline.ts app/api/prompt-storyboard/route.ts app/features/inspiration/MaterialLibraryPanelV2.tsx tests/preface-storyboard-timeline.test.mjs tests/preface-replication-workflow.test.mjs tests/rendered-html.test.mjs
git commit -m "fix: guarantee continuous ai preface storyboard timelines"
```

### Task 5: Reconcile existing broken AI-preface assets

**Files:**
- Create: `scripts/reconcile-ai-preface-assets.py`
- Create: `tests/test_reconcile_ai_preface_assets.py`
- Modify: `工作台开发文档.md`

**Interfaces:**
- Consumes: PocketBase AI-preface assets and their source materials.
- Produces: idempotent audit output and requeue actions; `--dry-run` is the default and `--apply` performs writes.

- [ ] **Step 1: Write failing reconciliation tests**

```python
def test_flags_full_source_asset_without_media_file():
    assert audit(asset={"clip_start_seconds": 0, "clip_end_seconds": 153.67, "media_file": ""}, source={"duration_seconds": 153.67}).reason == "full_source_without_clip"

def test_ready_clipped_asset_is_untouched():
    assert audit(asset={"clip_start_seconds": 0, "clip_end_seconds": 10, "media_file": "clip.mp4", "clip_status": "ready"}, source={"duration_seconds": 153.67}) is None
```

- [ ] **Step 2: Run and confirm failure**

Run: `python -m pytest tests/test_reconcile_ai_preface_assets.py -q`

Expected: failure because the script does not exist.

- [ ] **Step 3: Implement dry-run and apply modes**

The script must flag assets with missing `media_file`, non-ready status, invalid range, or range covering at least 95% of a source longer than 30 seconds. `--apply` queues source reanalysis and deletes no records; canonical completion updates the existing asset idempotently.

- [ ] **Step 4: Dry-run against the local database**

Run: `python scripts/reconcile-ai-preface-assets.py --base-url http://127.0.0.1:8090`

Expected: asset `eesju0xemys1xgf` is reported as `full_source_without_clip`; no database writes occur.

- [ ] **Step 5: Apply and verify the reported asset**

Run: `python scripts/reconcile-ai-preface-assets.py --base-url http://127.0.0.1:8090 --apply --asset eesju0xemys1xgf`

Expected after worker completion: `clip_status=ready`, non-empty `media_file`, end near the verified opening boundary rather than `153.669955`, and isolated analysis scope matching the clipped duration.

- [ ] **Step 6: Run the complete verification suite**

Run: `python -m pytest tests/test_preface_boundary.py tests/test_material_library_routing.py tests/test_preface_segment_analysis.py tests/test_reconcile_ai_preface_assets.py -q && node --test tests/manual-review-contract.test.mjs tests/preface-analysis-view-model.test.mjs tests/preface-storyboard-timeline.test.mjs tests/preface-replication-workflow.test.mjs tests/rendered-html.test.mjs && npm test`

Expected: all tests and the production build pass.

- [ ] **Step 7: Commit**

```bash
git add scripts/reconcile-ai-preface-assets.py tests/test_reconcile_ai_preface_assets.py 工作台开发文档.md
git commit -m "chore: reconcile legacy ai preface assets"
```

## Self-review

- Spec coverage: boundary extraction, physical clipping, shared analysis presentation, continuity repair, legacy reconciliation, and non-impact constraints each map to a task.
- Type consistency: `PrefaceBoundaryDecision`, `buildPrefaceAnalysisView`, `normalizeStoryboardTimeline`, and `storyboardCoverageIssues` are defined before their consumers.
- Safety: reconciliation defaults to dry-run and never deletes source material or saved script versions.
