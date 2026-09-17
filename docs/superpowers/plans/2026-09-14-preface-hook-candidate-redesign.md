# Preface Hook and Candidate Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build understandable multi-select hook controls and enforce traceable, diverse use of content tags and hooks in creative candidates.

**Architecture:** Extend the domain contract with selected hook directions, ending mode, tag evidence, hook evidence, and scene family. Build deterministic slot assignments before each model call, validate returned evidence against the task contract, and simplify the candidate cards around the event while keeping details collapsible.

**Tech Stack:** TypeScript, React, Vinext route handlers, Node test runner, CSS Modules

**Spec:** `docs/superpowers/specs/2026-09-14-preface-hook-candidate-redesign.md`

## Global Constraints

- Users select 1—3 plain-language hook directions.
- Every candidate uses at least two allowed content tags and one selected hook with evidence.
- Every candidate remains in one concrete scene and one core event.
- The pool contains 8 anchored, 8 migrated, and 8 wild candidates.
- Existing user changes must be preserved.

---

### Task 1: Domain contracts and validation

**Files:**
- Modify: `app/lib/preface-creative-domain.ts`
- Test: `tests/preface-hook-candidate-contract.test.mjs`

**Interfaces:**
- Produces: `PrefaceHookSelection`, `PrefaceTagUsage`, `PrefaceHookUsage`, and contract-aware `inspectCreativeCandidates` options.

- [ ] Write tests proving candidate evidence is parsed and invalid tag/hook references are rejected.
- [ ] Run `node --test tests/preface-hook-candidate-contract.test.mjs` and confirm failure.
- [ ] Add the types, parser fields, and allowed tag/hook validation.
- [ ] Run the test and confirm it passes.

### Task 2: Multi-select hook UI

**Files:**
- Modify: `app/lib/preface-creative-catalog.ts`
- Modify: `app/features/preface-creative/PrefacePlanningWorkflow.tsx`
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.module.css`
- Test: `tests/preface-hook-candidate-contract.test.mjs`

**Interfaces:**
- Consumes: `PrefaceHookSelection`.
- Produces: `hookStrategyPlan.selectedHooks` and `hookStrategyPlan.endingMode`.

- [ ] Add a failing static UI contract test for the six directions, multi-select limit, and ending selector.
- [ ] Replace the direction single-select and advanced editor with plain-language selectable cards.
- [ ] Add selected-state, evidence-chip, and responsive styles.
- [ ] Run the contract test.

### Task 3: Slot allocation and model enforcement

**Files:**
- Modify: `app/api/preface-creative/plan/route.ts`
- Modify: `app/lib/preface-creative-domain.ts`
- Test: `tests/preface-hook-candidate-contract.test.mjs`

**Interfaces:**
- Consumes: selected/locked/excluded tags and selected hook directions.
- Produces: per-request slot assignments with scene family, primary hook, supporting hook, and ending mode.

- [ ] Add failing assertions for `slotAssignments`, tag contract, selected-hook contract, and scene quotas.
- [ ] Add deterministic rotating slot assignments to the generation payload.
- [ ] Update the model output schema and instructions to return tag and hook evidence.
- [ ] Filter candidates through the task contract and diversity quotas before merging.
- [ ] Run the contract and existing candidate tests.

### Task 4: Candidate card traceability

**Files:**
- Modify: `app/features/preface-creative/PrefacePlanningWorkflow.tsx`
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.module.css`
- Test: `tests/preface-hook-candidate-contract.test.mjs`

**Interfaces:**
- Consumes: `usedTags`, `usedHooks`, and `sceneFamily` on each candidate.

- [ ] Add a failing assertion for content-tag and hook evidence rendering.
- [ ] Show compact tag and hook chips on the card and move metrics into a details panel.
- [ ] Run focused tests, ESLint on changed files, and `npm run build`.

