# 前贴迭代复刻母版库工作流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将前贴迭代复刻改造成“母版库浏览—预览—输入新剧情—生成复刻创意”的独立工作流。

**Architecture:** 复用现有 AI 前贴素材库卡片和预览弹窗作为母版选择入口；复刻工作台维护独立的母版快照、目标剧情简介和补充要求；服务端继续复用裂变生成接口，但前端隐藏 V1–V5/A–B–C 技术参数，按三种易懂方向展示结果。

**Tech Stack:** React/TypeScript、现有 MaterialLibraryPanelV2、PrefaceCreativeWorkspace、localStorage、Node test、Vinext。

**Spec:** `docs/superpowers/specs/2026-09-09-ai-preface-creative-design.md` 及本轮确认的四步复刻方案。

## Global Constraints

- 前贴迭代复刻与前贴创意策划保持独立状态和独立输入。
- 母版只贡献抽象钩子机制、动作因果、冲突节奏和结尾卡点，不复制人物名称、场景、对白和表面道具。
- 新剧情简介必填，补充要求可选；用户不需要理解内部故事引擎参数。
- 生成结果必须保留来源母版ID、目标剧情和版本关系。

---

### Task 1: 母版库入口与预览交互

**Files:**
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.tsx`
- Modify: `app/features/inspiration/MaterialLibraryPanelV2.tsx`
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.module.css`
- Test: `tests/preface-replication-workflow.test.mjs`

- [ ] 写失败测试，要求复刻模式包含母版库浏览、卡片“立即使用”和预览详情入口。
- [ ] 运行该测试，确认当前下拉框实现无法满足契约。
- [ ] 将复刻模式的母版下拉选择替换为可搜索的 AI 前贴卡片入口，复用素材库过滤和卡片数据。
- [ ] 将预览弹窗的 CTA 改为“立即使用”，回传母版资产而不是只回传 ID。
- [ ] 增加母版摘要区域和响应式卡片样式，保留重新选择母版能力。
- [ ] 运行复刻工作流测试并确认通过。

### Task 2: 目标剧情输入与独立任务状态

**Files:**
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.tsx`
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.module.css`
- Test: `tests/preface-replication-workflow.test.mjs`

- [ ] 写失败测试，要求出现必填“新剧情简介”、可选“补充要求”和模型选择字段，且不读取创意策划 `input.targetBrief`。
- [ ] 运行测试确认失败。
- [ ] 增加 `replicationSynopsis`、`replicationSupplement`、`replicationModel` 独立状态，并在母版确认后显示输入表单。
- [ ] 对空简介禁用生成按钮；改变母版或简介时清空旧复刻结果和错误状态。
- [ ] 增加“检查识别结果”折叠区，展示 AI 从简介提取的人物、关系、题材和冲突，但不增加必经步骤。
- [ ] 运行复刻工作流测试并确认通过。

### Task 3: 复刻生成接口与三类结果展示

**Files:**
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.tsx`
- Modify: `app/api/prompt-fission/route.ts`
- Modify: `app/lib/material-library-store.ts`
- Test: `tests/preface-replication-workflow.test.mjs`

- [ ] 写失败测试，要求生成请求同时携带母版ID、母版机制快照、新剧情简介、补充要求和模型，并在 UI 中呈现三种易懂方向。
- [ ] 运行测试确认失败。
- [ ] 将复刻请求封装为独立 payload，保留母版与目标剧情边界；后台继续生成多分支，前台归并为“稳定复刻/场景迁移/创意升级”。
- [ ] 将结果卡片简化为标题、单场景事件、人物行动、核心冲突和结尾卡点，隐藏 V1–V5/A–B–C 技术术语。
- [ ] 支持单卡生成脚本、批量生成脚本、收藏、淘汰、保存到前贴库，并写入来源母版和目标剧情元数据。
- [ ] 增加生成中、部分成功、失败可重试三种状态。
- [ ] 运行复刻工作流测试并确认通过。

### Task 4: 回归验证

**Files:**
- Test: `tests/preface-replication-workflow.test.mjs`
- Test: `tests/preface-creative-candidate-actions.test.mjs`

- [ ] 运行前贴创意与复刻相关全部测试。
- [ ] 运行 `npm run build`。
- [ ] 运行修改文件的 ESLint 检查。
- [ ] 检查母版选择、输入简介、生成结果、刷新恢复和失败重试的完整链路。
