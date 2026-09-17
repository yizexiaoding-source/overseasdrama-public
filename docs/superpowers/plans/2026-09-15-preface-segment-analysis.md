# Preface Segment Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build persistent, asset-scoped background completion analysis for individual and all incomplete AI preface templates.

**Architecture:** A dedicated PocketBase `preface_analysis_jobs` queue owns asset-level status, clip bounds, leases and retries. The existing Python worker claims these jobs, cuts or downloads only the requested clip, analyzes that clip, remaps evidence timestamps to source coordinates, and persists results only on the library asset. The React library reads the latest persisted job state and exposes single and bulk enqueue actions.

**Tech Stack:** PocketBase JavaScript hooks and migrations, Python worker/ffmpeg, React/TypeScript, Node test runner, Python unittest.

**Spec:** `docs/superpowers/specs/2026-09-15-preface-segment-analysis-design.md`

## Global Constraints

- Analyze only `clip_start_seconds` through `clip_end_seconds`; never submit the full source duration to semantic analysis.
- Do not overwrite `ad_materials.analysis_result`.
- Closing a modal or page must not cancel a submitted job.
- Bulk enqueue processes only incomplete `ai_preface` assets and is idempotent.
- Assets without any usable video source are skipped with an explicit status.

---

### Task 1: Persistent preface job schema and enqueue contract

**Files:**
- Create: `pb_migrations/1787651100_create_preface_analysis_jobs.js`
- Create: `pb_hooks/preface_analysis_helpers.js`
- Create: `pb_hooks/preface_analysis.pb.js`
- Test: `tests/preface-analysis-job-contract.test.mjs`

**Interfaces:**
- Produces: `POST /api/lumina/preface-analysis/assets/{id}/enqueue`, `POST /api/lumina/preface-analysis/enqueue-incomplete`, `POST /api/lumina/preface-analysis/claim`, `PATCH /api/lumina/preface-analysis/jobs/{id}`.
- Produces: asset fields `preface_analysis_status`, `preface_analysis_progress`, `preface_analysis_error`, `preface_analysis_job`.

- [ ] Write a failing source-contract test asserting the collection fields, idempotency index, range validation, incomplete-only bulk filter, and asset-only result persistence.
- [ ] Run `node --test tests/preface-analysis-job-contract.test.mjs` and confirm failure.
- [ ] Add the migration, helper completeness predicate, enqueue endpoints, lease-based claim endpoint, and result update endpoint.
- [ ] Run the contract test and confirm it passes.

### Task 2: Clip-only worker execution

**Files:**
- Modify: `processor/job_worker.py`
- Test: `tests/test_preface_segment_analysis.py`

**Interfaces:**
- Consumes: preface claim response `{job, asset, material}`.
- Produces: `execute_preface_analysis_job(response, base_url, workspace, on_progress)` returning asset-scoped `analysis_result` and `prompt_blueprint`.

- [ ] Write failing tests for clip source selection, exact ffmpeg range, timestamp offsetting, and source-analysis isolation.
- [ ] Run `python -m unittest tests.test_preface_segment_analysis -v` and confirm failure.
- [ ] Implement media download/cut helpers, analyze only the prepared clip, map timestamps to source coordinates, and add the preface queue to material-worker priority.
- [ ] Run the Python test and confirm it passes.

### Task 3: Client API and persistent job state

**Files:**
- Modify: `app/lib/material-library-store.ts`
- Test: `tests/preface-analysis-client-contract.test.mjs`

**Interfaces:**
- Produces: `enqueuePrefaceAnalysis(assetId)`, `enqueueIncompletePrefaceAnalysis()`.
- Extends: `MaterialLibraryAsset` with persistent preface analysis status, progress and error.

- [ ] Write a failing source-contract test for both enqueue functions and mapped asset status fields.
- [ ] Run `node --test tests/preface-analysis-client-contract.test.mjs` and confirm failure.
- [ ] Implement the client functions and map new asset fields.
- [ ] Run the contract test and confirm it passes.

### Task 4: Single and bulk completion UI

**Files:**
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.tsx`
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.module.css`
- Modify: `tests/preface-replication-workflow.test.mjs`

**Interfaces:**
- Consumes: client enqueue functions and persisted asset job fields.
- Produces: “一键补全分析（N）”, per-card persisted state badges, and modal single enqueue without client-owned infinite polling.

- [ ] Replace old assertions with failing assertions for asset-level enqueue, bulk action, persistent status copy, and absence of `retryMaterialAnalysis`.
- [ ] Run `node --test tests/preface-replication-workflow.test.mjs` and confirm failure.
- [ ] Implement the bulk button, compact feedback, status badges, and single enqueue action; refresh the list on a bounded interval only while visible jobs are pending.
- [ ] Run the workflow test and confirm it passes.

### Task 5: Integrated verification

**Files:**
- Modify only files needed to resolve failures introduced by Tasks 1–4.

**Interfaces:**
- Verifies the complete persisted clip-analysis flow.

- [ ] Run focused Node and Python tests.
- [ ] Run the complete preface test suite.
- [ ] Run lint on changed TypeScript files.
- [ ] Run the production build.
- [ ] Review the diff to confirm no unrelated behavior changed.
