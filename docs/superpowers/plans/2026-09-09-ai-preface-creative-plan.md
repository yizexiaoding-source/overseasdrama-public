# AI 前贴创意中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Lumina 工作台中新增 AI 前贴创意中心及三个工作流入口。

**Architecture:** 在 `app/page.tsx` 增加可展开导航和独立工作区组件；创意策划通过新的 API 返回结构化候选，复刻和精准匹配复用既有资产/API；所有候选通过版本、来源和父模板字段关联保存。

**Tech Stack:** React/TypeScript、Vinext App Router、PocketBase、Node test runner、CSS Modules。

**Spec:** `docs/superpowers/specs/2026-09-09-ai-preface-creative-design.md`

## Global Constraints

- 默认创意脚本 10–15 秒，只允许女主、男主、男二三个核心人物。
- 结尾只能有一次动作反转，反转后立即结束。
- 前贴迭代输出五个故事引擎，每个引擎 A/B/C 三个分支，共 15 组。
- 人物关系、具体动作、故事背景和事件属于可替换变量，不能被错误锁定。
- 用户只在边界确认和候选选择处被打断。

### Task 1: 契约与创意领域模型

**Files:**
- Modify: `app/lib/material-library-store.ts`
- Create: `app/lib/preface-creative-domain.ts`
- Test: `tests/generation-and-dedup-contract.test.mjs`

- [ ] 写失败测试，要求创意项目包含五维输入、候选包含故事模型/承诺/事件链/评分，匹配结果包含兼容度和接片字段。
- [ ] 运行 `node --test tests/generation-and-dedup-contract.test.mjs` 验证失败。
- [ ] 添加最小领域类型和安全解析函数。
- [ ] 重新运行测试验证通过。

### Task 2: 创意策划 API

**Files:**
- Create: `app/api/preface-creative/plan/route.ts`
- Test: `tests/generation-and-dedup-contract.test.mjs`

- [ ] 写失败测试，要求系统提示词包含五维创意 DNA、10–15 秒动作链、单次结尾反转、候选去重评分及纯文字脚本约束。
- [ ] 运行测试确认失败。
- [ ] 实现请求校验、模型调用、JSON 解析和候选数量/字段校验。
- [ ] 重新运行测试验证通过。

### Task 3: AI 前贴创意工作区与导航

**Files:**
- Create: `app/features/preface-creative/PrefaceCreativeWorkspace.tsx`
- Create: `app/features/preface-creative/PrefaceCreativeWorkspace.module.css`
- Create: `app/features/preface-creative/index.ts`
- Modify: `app/page.tsx`

- [ ] 写失败契约，要求出现 AI前贴创意、前贴创意策划、前贴迭代复刻、前贴精准匹配和低频监督提示。
- [ ] 运行测试确认失败。
- [ ] 实现展开导航、三模式切换、策划表单、候选卡片、复刻入口和精准匹配入口。
- [ ] 重新运行测试验证通过。

### Task 4: 复刻与精准匹配接入

**Files:**
- Modify: `app/features/preface-creative/PrefaceCreativeWorkspace.tsx`
- Modify: `app/lib/material-library-store.ts`
- Modify: `UX-CONTRACT.md`

- [ ] 写失败契约，要求复刻传入母版资产与目标变量，精准匹配展示评分、证据、阻断项和正片接片。
- [ ] 运行测试确认失败。
- [ ] 接入现有 `/api/prompt-fission` 与 `/api/material-adaptation`，并保留返回版本。
- [ ] 重新运行测试验证通过。

### Task 5: 全量验证

- [ ] 运行 `node --test tests/generation-and-dedup-contract.test.mjs tests/prompt-fission-multimodal.test.mjs`。
- [ ] 运行 `npm run build`。
- [ ] 运行 `agent-browser` 或等价浏览器检查，确认导航展开和三种模式可见。
