# Inspiration Material Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deduplicated ADX material intake and classification workflow with five canonical material types, resilient semantic-provider scheduling, dedicated AI preface and narration libraries, and prompt-fission plans that preserve proven creative mechanisms.

**Architecture:** Keep `ad_materials` as the source-of-truth intake record, add canonical classification fields, and store reusable derived assets in `material_library_assets`. The Python worker owns evidence extraction, classification, checkpointed provider calls, and FFmpeg preface cutting; the Next/Vinext client owns filtering, preview, download, manual correction, and prompt-fission requests.

**Tech Stack:** Next.js-compatible Vinext, React 19, TypeScript, PocketBase migrations/hooks, Python 3.14 worker, FFmpeg, faster-whisper, Node test runner, Python unittest/pytest-compatible tests.

**Spec:** `docs/superpowers/specs/2026-09-02-inspiration-material-intelligence-design.md`

## Global Constraints

- Canonical material types are exactly `未判定`, `原剧拼接`, `解说`, `AI前贴`, and `海报图片` in user-facing copy.
- Missing ADX spend, impression, click, or CTR values remain absent and are never estimated.
- Automatic analysis must not overwrite a persisted manual classification override.
- AI prefaces are real FFmpeg-cut files with source lineage and independently downloadable URLs.
- Prompt fission creates exactly five text-and-storyboard variants and does not generate media.
- Provider concurrency defaults to one request; only actual rate-limit responses use rate-limit copy.
- The project currently has no Git repository metadata, so commit steps cannot run until `.git` is initialized.

---

### Task 1: Canonical classification contract and PocketBase schema

**Files:**
- Create: `app/lib/material-classification.ts`
- Create: `pb_migrations/1787650000_add_material_intelligence_libraries.js`
- Modify: `app/lib/inspiration-material-store.ts`
- Test: `tests/material-classification.test.mjs`

**Interfaces:**
- Produces: `MaterialType`, `MediaKind`, `AudienceType`, `normalizeMaterialType(value)`, `resolveEffectiveClassification(record)`.
- Produces PocketBase collections `material_library_assets` and `prompt_fission_plans`.

- [ ] **Step 1: Write failing normalization tests**

```js
assert.equal(normalizeMaterialType("正片剧集拼接"), "原剧拼接");
assert.equal(normalizeMaterialType("正片剧集解说"), "解说");
assert.equal(normalizeMaterialType("unknown"), "未判定");
assert.equal(resolveEffectiveClassification({ material_type: "解说", manual_override: { materialType: "原剧拼接" } }).materialType, "原剧拼接");
```

- [ ] **Step 2: Run `node --test tests/material-classification.test.mjs` and confirm it fails because the module does not exist.**

- [ ] **Step 3: Implement the canonical TypeScript contract**

```ts
export type MaterialType = "未判定" | "原剧拼接" | "解说" | "AI前贴" | "海报图片";
export type MediaKind = "图片" | "视频";
export type AudienceType = "男频" | "女频" | "通用" | "未判定";
export function normalizeMaterialType(value: unknown): MaterialType;
export function resolveEffectiveClassification(record: Record<string, unknown>): {
  materialType: MaterialType; mediaKind: MediaKind; audienceType: AudienceType; genres: string[]; source: "AI" | "人工" | "导入";
};
```

- [ ] **Step 4: Add migration fields and collections**

```js
// ad_materials: media_kind, material_type, audience_type, genre_tags,
// adx_metrics, classification_source, manual_override, library_bucket,
// classification_confidence, classification_reasons, image
// material_library_assets: source_material, asset_kind, media_file,
// clip_start_seconds, clip_end_seconds, content_hash, analysis_result,
// prompt_blueprint, hit_reasons, adx_metrics_snapshot, review_status
// prompt_fission_plans: source_asset, preserved_mechanisms,
// variable_dimensions, variants, model, schema_version, status
```

- [ ] **Step 5: Extend `InspirationMaterial` and PocketBase record mapping with the canonical fields while retaining legacy fallbacks.**

- [ ] **Step 6: Run the normalization test and project build.**

---

### Task 2: Idempotent ADX/manual intake for images and videos

**Files:**
- Modify: `app/api/material-intake/route.ts`
- Modify: `app/lib/inspiration-material-store.ts`
- Modify: `app/features/inspiration/InspirationWorkspace.tsx`
- Test: `tests/material-intake-contract.test.mjs`

**Interfaces:**
- Consumes: canonical classification types from Task 1.
- Produces: intake responses `{ record, created, duplicateReason, analysisQueued }`.

- [ ] **Step 1: Write failing contract tests for source dedupe, content dedupe, image MIME handling, metric null preservation, and one idempotent analysis job.**

```js
assert.equal(result.duplicateReason, "source_identity");
assert.equal(imageRecord.media_kind, "图片");
assert.equal(imageRecord.material_type, "海报图片");
assert.equal(missingSpendRecord.adx_metrics.spend, undefined);
```

- [ ] **Step 2: Run the targeted test and confirm the old route assumes every remote asset is an MP4 video.**

- [ ] **Step 3: Detect media kind from verified response MIME and source metadata, preserve the real extension, and reject unsupported MIME types with a 422 response.**

- [ ] **Step 4: Apply source-identity lookup before download and SHA-256 lookup after download; return the existing record on either match.**

- [ ] **Step 5: Map ADX metrics without defaults that invent values**

```ts
type AdxMetrics = { spend?: number; impressions?: number; clicks?: number; ctr?: number; days?: number; currency?: string; updatedAt?: string };
```

- [ ] **Step 6: Update manual upload to accept JPEG, PNG, WebP, MP4, MOV, and WebM, hash all files, and queue image or video analysis appropriately.**

- [ ] **Step 7: Run intake tests and project build.**

---

### Task 3: Provider-aware rate limiting and checkpointed recovery

**Files:**
- Create: `processor/provider_rate_limit.py`
- Modify: `processor/semantic_analysis.py`
- Modify: `processor/job_worker.py`
- Modify: `scripts/start-analysis-worker.ps1`
- Test: `tests/test_provider_rate_limit.py`

**Interfaces:**
- Produces: `ProviderRateLimiter.acquire()`, `retry_delay(status, headers, attempt)`, `is_retryable_provider_error(error)`.
- Consumes: existing material semantic cache and job checkpoint API.

- [ ] **Step 1: Write failing tests for `Retry-After`, exponential backoff bounds, jitter bounds, retryable HTTP status codes, and non-rate-limit error labels.**

```python
def test_retry_after_wins():
    assert retry_delay(429, {"Retry-After": "7"}, 0, jitter=lambda: 0) == 7

def test_only_429_is_rate_limited():
    assert provider_error_label(429) == "模型服务限流"
    assert provider_error_label(500) == "模型服务暂时不可用"
```

- [ ] **Step 2: Run `python -m unittest tests.test_provider_rate_limit -v` and confirm failure.**

- [ ] **Step 3: Implement a process-wide semaphore and minimum request interval, both configured from environment and defaulting to concurrency `1`.**

- [ ] **Step 4: Retry HTTP 408/429/500/502/503/504, empty streaming responses, `URLError`, and temporary `OSError`; preserve the current content-safety fallback as a separate branch.**

- [ ] **Step 5: Save the segment result immediately after each successful future instead of waiting for the entire batch. Resume only missing segment indexes.**

- [ ] **Step 6: Replace the unconditional “并发受限” progress copy with status-specific copy derived from the actual exception.**

- [ ] **Step 7: Run provider tests and existing Python material-analysis tests.**

---

### Task 4: Evidence-based five-way classification and library routing

**Files:**
- Modify: `processor/semantic_analysis.py`
- Modify: `processor/job_worker.py`
- Create: `tests/test_material_library_routing.py`

**Interfaces:**
- Produces: `classify_material_asset(analysis, media_kind) -> ClassificationDecision`.
- Produces: `route_material_asset(material, decision, workspace, api_client) -> LibraryAsset | None`.

- [ ] **Step 1: Write failing tests for poster, narration, preface, original compilation, undetermined, manual override, and repeated routing.**

```python
self.assertEqual(classify_material_asset(image_analysis, "image").material_type, "海报图片")
self.assertEqual(classify_material_asset(narration_analysis, "video").library_bucket, "narration")
self.assertEqual(classify_material_asset(preface_analysis, "video").library_bucket, "ai_preface")
```

- [ ] **Step 2: Run the targeted tests and confirm no canonical router exists.**

- [ ] **Step 3: Add a compact classification contract to material semantic output with evidence IDs, confidence, audience, genres, narration coverage, and preface boundaries.**

- [ ] **Step 4: Implement conservative deterministic post-validation; low-confidence or contradictory decisions become `未判定`.**

- [ ] **Step 5: Protect `manual_override` before patching `ad_materials`.**

- [ ] **Step 6: For AI prefaces, validate `0 <= start < end <= duration`, cut with FFmpeg stream-safe encoding, hash the result, and upsert the derived asset.**

```python
ffmpeg -y -ss START -to END -i SOURCE -c:v libx264 -c:a aac OUTPUT
```

- [ ] **Step 7: For narration, upsert a library record that references the source material and stores transcript/structure analysis without duplicating the full video.**

- [ ] **Step 8: Run routing tests and the existing material reconciliation suite.**

---

### Task 5: Material libraries and prompt-fission API

**Files:**
- Create: `app/lib/material-library-store.ts`
- Create: `app/api/prompt-fission/route.ts`
- Test: `tests/prompt-fission-contract.test.mjs`

**Interfaces:**
- Produces: `listMaterialLibraryAssets(kind, filters)`, `createPromptFissionPlan(input)`, `downloadLibraryAssetUrl(asset)`.
- Prompt input: `{ sourceAssetId, variableDimensions: string[] }`.
- Prompt output: exactly five `{ prompt, storyboard, preserved, changed }` records.

- [ ] **Step 1: Write failing tests for five variants, locked-mechanism preservation, malformed provider responses, and missing ADX metrics.**

- [ ] **Step 2: Run the targeted test and confirm the route does not exist.**

- [ ] **Step 3: Implement PocketBase library reads and stable preview/download URL generation.**

- [ ] **Step 4: Implement the server-side fission route with strict request validation, provider timeout/retry, exact-five validation, and persistence only after complete validation.**

- [ ] **Step 5: Keep API keys server-only and never return provider request bodies or secrets to the browser.**

- [ ] **Step 6: Run the contract test and project build.**

---

### Task 6: Faceted inspiration dashboard and dedicated libraries

**Files:**
- Create: `app/features/inspiration/MaterialFilters.tsx`
- Create: `app/features/inspiration/MaterialLibraries.tsx`
- Create: `app/features/inspiration/PromptFissionPanel.tsx`
- Modify: `app/features/inspiration/InspirationWorkspace.tsx`
- Modify: `app/features/inspiration/InspirationWorkspace.module.css`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes canonical material records and library stores from Tasks 1 and 5.
- Produces URL-restorable filter state and user actions for preview, download, manual correction, reanalysis, and prompt fission.

- [ ] **Step 1: Extend rendered HTML tests with canonical type labels, media/platform/language/type/audience/genre filters, AI 前贴库, 解说库, preview/download actions, and prompt-fission copy.**

- [ ] **Step 2: Run the rendered test and confirm the new UI contract is absent.**

- [ ] **Step 3: Build `MaterialFilters` with URL search parameters, a clear button, result count, paging reset, and accessible labels.**

- [ ] **Step 4: Update cards to display media kind, platform, language, canonical type, audience, genre, ADX metrics, and only the five business analysis states.**

- [ ] **Step 5: Add application-owned preview dialogs for images and videos plus download links with stable filenames.**

- [ ] **Step 6: Build AI preface and narration sections. AI preface cards expose prompt blueprint, hit reasons, preview, download, and fission. Narration cards expose transcript/structure reuse.**

- [ ] **Step 7: Build `PromptFissionPanel` with locked mechanisms, selectable variable dimensions, busy/error states, five result cards, copy-one, copy-all, and JSON export.**

- [ ] **Step 8: Add an accessible manual-classification dialog that persists overrides and displays “人工确认” on affected records.**

- [ ] **Step 9: Add responsive layouts for desktop, narrow viewport, empty/no-result/loading/error states, and visible keyboard focus.**

- [ ] **Step 10: Run rendered HTML tests and project build.**

---

### Task 7: End-to-end migration and acceptance verification

**Files:**
- Modify: `tests/rendered-html.test.mjs`
- Modify: `tests/test_material_reconciliation.py`
- Modify: `docs/superpowers/specs/2026-09-02-inspiration-material-intelligence-design.md` only if implementation reveals an approved factual correction

**Interfaces:**
- Consumes every prior task deliverable.
- Produces a verified local workflow and an explicit unresolved-risk report.

- [ ] **Step 1: Start PocketBase and verify the migration applies without destroying existing `ad_materials`.**

- [ ] **Step 2: Import the same ADX asset twice and confirm one material record and one analysis job.**

- [ ] **Step 3: Exercise one image, one original compilation, one narration, one AI preface, and one undetermined result.**

- [ ] **Step 4: Verify AI preface media is independently playable and downloadable, and narration references the original file.**

- [ ] **Step 5: Simulate HTTP 429 and an empty stream; confirm checkpointed retry and accurate UI copy.**

- [ ] **Step 6: Generate a prompt-fission plan and confirm exactly five variants preserve every locked mechanism.**

- [ ] **Step 7: Run:**

```text
node --test tests/material-classification.test.mjs tests/material-intake-contract.test.mjs tests/prompt-fission-contract.test.mjs tests/rendered-html.test.mjs
python -m unittest tests.test_provider_rate_limit tests.test_material_library_routing tests.test_material_reconciliation -v
npm run build
```

- [ ] **Step 8: Browser-check loading, empty, no-results, queued, running, review, completed, failed, keyboard navigation, filter popup, preview dialog, and a narrow viewport.**

- [ ] **Step 9: Report exact verification results and any provider-dependent behavior that could not be exercised locally.**
