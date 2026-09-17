# AI 前贴创意候选池 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将第四步重构为二十四条轻量候选池，并实现真实锁定、三分支和按需完整脚本生成。

**Architecture:** 使用轻量候选与完整脚本两套数据模型。候选接口按三种创意距离分批流式返回，分支与脚本通过独立 API 按需生成，工作区统一管理持久化状态。

**Tech Stack:** React、TypeScript、Vinext API routes、SSE、localStorage、Node test runner

**Spec:** `docs/superpowers/specs/2026-09-14-preface-candidate-pool-design.md`

## Global Constraints

- 每轮目标二十四条，三种创意类型各八条。
- 第四步只展示轻量候选，第五步才生成完整脚本。
- 锁定项必须进入分支和脚本请求。
- 不新增外部依赖，不改变模型供应商配置。

---

### Task 1: 轻量候选领域模型与差异校验

**Files:**
- Modify: `app/lib/preface-creative-domain.ts`
- Test: `tests/preface-creative-candidate-pool.test.mjs`

**Interfaces:**
- Produces: `PrefaceCreativeCandidate`、`PrefaceCandidateLocks`、`parseCreativeCandidates()`、`mergeCreativeCandidates()`。

- [ ] 写失败测试，验证候选解析、三类创意、锁定项和指纹差异。
- [ ] 运行测试并确认因接口不存在而失败。
- [ ] 实现最小领域模型和解析/合并函数。
- [ ] 运行测试确认通过。

### Task 2: 二十四条轻量候选流

**Files:**
- Modify: `app/api/preface-creative/plan/route.ts`
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.tsx`
- Test: `tests/preface-creative-candidate-pool.test.mjs`

**Interfaces:**
- Consumes: `parseCreativeCandidates()`、`mergeCreativeCandidates()`。
- Produces: SSE `progress`、`batch`、`done`，负载包含 `candidates`、`completed`、`total=24`。

- [ ] 写失败测试，验证三种类型各八条、四条一批、部分成功不整体清空。
- [ ] 运行测试确认失败。
- [ ] 将提示词改成轻量候选 JSON，并按创意类型分批生成。
- [ ] 修改工作区消费和持久化候选流。
- [ ] 运行测试确认通过。

### Task 3: 简洁候选卡片和筛选

**Files:**
- Modify: `app/features/preface-creative/PrefacePlanningWorkflow.tsx`
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.module.css`
- Test: `tests/preface-creative-candidate-pool.test.mjs`

**Interfaces:**
- Consumes: `PrefaceCreativeCandidate[]` 与候选状态回调。
- Produces: 类型筛选、排序、收藏、淘汰恢复、二至四张对比、轻量时间轴。

- [ ] 写失败测试，覆盖卡片核心字段和操作入口。
- [ ] 运行测试确认失败。
- [ ] 实现候选工具栏、轻量卡片、折叠预览和响应式样式。
- [ ] 运行测试与 ESLint。

### Task 4: 真实锁定和三个分支

**Files:**
- Create: `app/api/preface-creative/branches/route.ts`
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.tsx`
- Modify: `app/features/preface-creative/PrefacePlanningWorkflow.tsx`
- Test: `tests/preface-creative-candidate-actions.test.mjs`

**Interfaces:**
- Produces: `POST /api/preface-creative/branches`，输入 candidate、locks、input，返回三个带 parentId 的候选。

- [ ] 写失败测试，验证锁定字段进入请求且三个分支可解析。
- [ ] 运行测试确认失败。
- [ ] 实现分支 API、锁定面板和分支加载/错误状态。
- [ ] 运行测试确认通过。

### Task 5: 按需生成完整脚本

**Files:**
- Create: `app/api/preface-creative/script/route.ts`
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.tsx`
- Modify: `app/features/preface-creative/PrefacePlanningWorkflow.tsx`
- Test: `tests/preface-creative-candidate-actions.test.mjs`

**Interfaces:**
- Produces: `POST /api/preface-creative/script`，输入 candidate、locks、input，返回单个 `PrefaceCreativeIdea`。

- [ ] 写失败测试，验证只为选中候选生成完整脚本。
- [ ] 运行测试确认失败。
- [ ] 复用模型调用和完整脚本解析逻辑实现脚本 API。
- [ ] 将“选择并生成脚本”连接到第五步。
- [ ] 运行全部测试、ESLint 与生产构建。
