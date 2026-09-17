# 前贴端到端标签显影合同 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立从内容标签到候选、完整脚本和分镜的可验证显影合同，并把第三步简化为首尾双钩子方案选择。

**Architecture:** 在领域层新增标签显影与结尾钩子结构，由生成合同负责分类与分配；三个生成接口依次传递和校验同一合同。界面只呈现业务可理解的标签状态、钩子方案和证据摘要，内部结构不进入最终脚本与分镜文本。

**Tech Stack:** TypeScript、React、Vinext/Vite、Node test runner、CSS Modules

**Spec:** `docs/superpowers/specs/2026-09-16-preface-tag-realization-contract-design.md`

## Global Constraints

- 未选择的人物关系或人物设定不得被自动强行植入。
- 每条候选最多重点显影一个人物关系和一个人物设定。
- 分镜最终只展示一个纯文本版本。
- 角色原名、单一场景、一个核心事件和禁用屏幕文字规则保持不变。

---

### Task 1: 领域合同与确定性校验

**Files:**
- Modify: `app/lib/preface-creative-domain.ts`
- Modify: `app/lib/preface-creative-generation.ts`
- Test: `tests/preface-tag-realization-contract.test.mjs`

**Interfaces:**
- Produces: `PrefaceTagRealization`, `PrefaceEndingHook`, `buildCreativeTagContract()`, `candidateHasRequiredDramaticEvidence()`。

- [ ] 写失败测试，覆盖标签四级分类、未选择关系不强加、锁定关系必须有完整显影证据。
- [ ] 运行测试并确认因类型和校验函数缺失而失败。
- [ ] 实现类型、解析器、分配逻辑和候选校验。
- [ ] 运行测试并确认通过。

### Task 2: 候选与首尾钩子生成合同

**Files:**
- Modify: `app/lib/preface-creative-catalog.ts`
- Modify: `app/api/preface-creative/plan/route.ts`
- Modify: `app/api/preface-creative/branches/route.ts`
- Test: `tests/preface-tag-realization-contract.test.mjs`

**Interfaces:**
- Consumes: `PrefaceTagRealization`, `PrefaceEndingHook`。
- Produces: 候选的 `tagRealizations`、`openingHook`、`endingHook`。

- [ ] 写失败测试，要求提示词和返回结构包含精确标签显影与独立结尾钩子。
- [ ] 运行测试确认失败。
- [ ] 更新生成合同，允许无手选钩子时自动安排，并强制结尾钩子落在 11—15 秒。
- [ ] 运行测试确认通过。

### Task 3: 脚本和分镜传递与修复

**Files:**
- Modify: `app/api/preface-creative/script/route.ts`
- Modify: `app/api/preface-creative/storyboard/route.ts`
- Modify: `app/lib/preface-creative-domain.ts`
- Test: `tests/preface-tag-realization-contract.test.mjs`

**Interfaces:**
- Produces: `PrefaceCreativeIdea.tagEvidenceLedger`；分镜接口接收脚本和证据表。

- [ ] 写失败测试，要求脚本保留标签证据、分镜继续接收证据且只输出一个文本分镜。
- [ ] 运行测试确认失败。
- [ ] 更新脚本结构、提示词和校验器；更新分镜提示词与一次自动修复。
- [ ] 运行测试确认通过。

### Task 4: 第二、三、四、五步界面

**Files:**
- Modify: `app/features/preface-creative/PrefacePlanningWorkflow.tsx`
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.module.css`
- Test: `tests/preface-tag-realization-contract.test.mjs`

**Interfaces:**
- Consumes: 标签执行级别、首尾钩子、候选和脚本证据。

- [ ] 写失败测试，要求标签执行状态、三个钩子方案、候选证据摘要和第五步标签落地检查存在。
- [ ] 运行测试确认失败。
- [ ] 把钩子积木改为三张首尾方案卡，高级选项折叠；增加各阶段证据摘要。
- [ ] 运行测试确认通过。

### Task 5: 完整回归与运行验证

**Files:**
- Test: `tests/preface-tag-realization-contract.test.mjs`
- Test: existing `tests/preface-creative-*.test.mjs`

- [ ] 运行新增测试及全部前贴测试。
- [ ] 运行 ESLint 和 `npm run build`。
- [ ] 请求本地页面并确认开发服务无运行时错误。
- [ ] 核对未选择关系、人设时不会产生对应必显影合同。

