# 前贴创意剧情 DNA、钩子矩阵与批次生成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让简介、人物关系、人设在候选中可验证地显影，支持完整钩子方案多选，并在候选不满意时保留历史批次一键换一批。

**Architecture:** 在生成前把简介压缩为任务级剧情 DNA；候选槽位携带关系/人设/钩子绑定并通过语义证据门禁；钩子多选以“每条候选一组完整方案”的矩阵分配，批次生成使用新 runId 与指纹排重，不覆盖历史。

**Tech Stack:** React + TypeScript + Next/Vinext API + Node test runner + localStorage。

**Spec:** 本次对话中的“剧情 DNA 合同 + 钩子矩阵 + 批次换一批”方案。

## Global Constraints

- 未选择的人物关系与人设不得被强行加入。
- 每条候选只使用一组完整首尾钩子，避免15秒内主线过载。
- 角色原名必须逐字保留；手机、账单、账本、屏幕文字不得作为主要视觉冲突。
- 既有候选、脚本、分镜和前贴复刻流程不得被覆盖或破坏。

### Task 1: 剧情 DNA 与候选证据合同

**Files:**
- Modify: `app/lib/preface-creative-domain.ts`
- Modify: `app/lib/preface-creative-generation.ts`
- Modify: `app/api/preface-creative/plan/route.ts`
- Test: `tests/preface-tag-realization-contract.test.mjs`

- [ ] 添加剧情事实、角色身份、关系双方和候选来源使用记录的类型与解析。
- [ ] 为 anchored/migrated/wild 生成规则分别注入可执行的剧情 DNA 使用要求。
- [ ] 增加关系与人设必须由动作、自然对白和反应显影的语义门禁。
- [ ] 为未通过门禁的候选执行槽位级重试，不影响其他候选。

### Task 2: 完整钩子方案多选与矩阵分配

**Files:**
- Modify: `app/lib/preface-creative-domain.ts`
- Modify: `app/lib/preface-creative-generation.ts`
- Modify: `app/features/preface-creative/PrefacePlanningWorkflow.tsx`
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.module.css`
- Test: `tests/preface-creative-plan-contract.test.mjs`

- [ ] 将 `selectedPlanId` 扩展为最多三个 `selectedPlanIds`，兼容旧数据。
- [ ] 每个候选槽位分配一组完整首尾方案，并在三种创意距离内均衡覆盖。
- [ ] 主页面完整钩子卡支持1—3选；高级细分钩子最多作为一项辅助钩子。
- [ ] 钩子变更后只影响下一次生成，已有候选保持不变。

### Task 3: 一键换一批与历史批次

**Files:**
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.tsx`
- Modify: `app/features/preface-creative/PrefacePlanningWorkflow.tsx`
- Modify: `app/lib/preface-creative-domain.ts`
- Test: `tests/preface-creative-generation-contract.test.mjs`

- [ ] 为每次候选生成记录 `generationRunId` 与批次序号。
- [ ] 增加“换一批”入口，携带已有指纹和淘汰结果作为排重约束。
- [ ] 候选页支持批次切换、进度、取消和失败重试；新批次不得顶掉旧批次。

### Task 4: 回归验证

- [ ] 运行相关前贴测试与 `npm test`。
- [ ] 运行修改文件 ESLint 与构建。
- [ ] 验证首批、换一批、单选/多选钩子、三种创意距离和后续脚本链路。
