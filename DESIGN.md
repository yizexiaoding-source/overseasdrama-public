---
version: alpha
name: "Lumina 短剧智能工作台"
description: "面向短剧投放与创意团队的高密度素材分析、复用和制作工作台"
colors:
  primary: "#1769e0"
  primary-soft: "#edf5ff"
  background: "#f5f6f8"
  surface: "#ffffff"
  text: "#273142"
  text-muted: "#718198"
  border: "#dce5f0"
  success: "#158454"
  danger: "#dc4d59"
typography:
  sans:
    fontFamily: "Inter, PingFang SC, Microsoft YaHei, Noto Sans SC, system-ui, sans-serif"
  display:
    fontFamily: "Georgia, PingFang SC, Microsoft YaHei, serif"
  mono:
    fontFamily: "Consolas, SFMono-Regular, ui-monospace, monospace"
rounded:
  DEFAULT: "0.5rem"
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.75rem"
spacing:
  control-height: "2.375rem"
  panel-gap: "1rem"
  page-padding: "2.375rem"
components:
  button:
    height: "2.375rem"
    radius: "0.5rem"
  card:
    border: "#dce5f0"
    radius: "0.75rem"
  input:
    height: "2.375rem"
    radius: "0.4375rem"
---

# Lumina Design System

## Overview

### Creative North Star

界面像一张清晰的“短剧拉片工作台”：视频证据、结构判断和可执行制作稿并排组织，蓝色用于定位当前步骤与可操作信息，其他表面保持安静。

### Product context and register

- **Audience and primary job:** 短剧投放、内容分析和创意制作人员需要快速判断素材、复用钩子并生成可执行制作提示词。
- **Target market(s) and evidence:** 产品处理中文及海外多语种短剧素材；具体目标市场由每条素材和生成任务决定。
- **Locale(s) and language policy:** 产品界面以简体中文为主；素材、对白、旁白、画面文字和导出提示词可分别选择语言。
- **Usage scene:** 桌面端高频运营工具，兼顾窄屏访问；信息密度高，但所有主要操作保持清晰可读。
- **Register:** 产品型工作台。
- **Memorable signature:** 以连续编号工作流和“素材证据 → 结构迁移 → 可复制脚本”的蓝色路径组织复杂任务。
- **Restraint:** 内容分析和表单区域以白色表面、细边框和稳定间距为主，不使用装饰性大图或营销式英雄区。
- **Anti-references:** 不做黑盒式单按钮生成器，不以炫彩渐变替代证据层级，也不把分析术语混入可执行提示词。
- **Token ownership/runtime mapping:** 本文件记录现有视觉规则；运行时值由 `app/globals.css` 和功能级 CSS Modules 维护。

## Colors

主蓝 `#1769e0` 表示导航、选择、焦点和安全主操作；浅蓝 `#edf5ff` 表示当前步骤与信息表面。成功与危险状态分别使用 `#158454` 和 `#dc4d59`，同时配合文字，不依赖颜色单独传达含义。背景、表面和边框使用低对比中性色维持高密度可读性。

## Typography

界面正文使用支持中英文混排的无衬线字体栈；品牌与少量展示字可使用 Georgia 衬线角色。镜头脚本和生成提示词使用等宽字体以保留时间轴和分镜结构。正文与控件默认 14px，12px 仅用于次级元信息。

## Layout

桌面端保留固定侧栏与内容工作区。工作流页面按任务顺序自上而下组织，双来源关系可左右展示；在 620–900px 断点逐步折叠为单列。长提示词在自身区域滚动，页面不建立第二个竞争性垂直滚动容器。

## Elevation & Depth

主要依靠表面色、1px 边框和轻微内嵌强调建立层级。普通静态卡片不使用强阴影；浮层和明确的临时反馈可使用柔和阴影。

## Shapes

控件使用 6–8px 圆角，面板使用 10–13px 圆角。胶囊形只用于标签和版本选择，不用于主要操作按钮。

## Components

### Foundational visual states

所有可操作控件具有 hover、focus-visible、disabled 和 busy 状态。焦点以主蓝边框和浅蓝外圈表达；异步任务在原按钮尺寸内更新文案并阻止重复提交。

### Buttons and actions

每个决策区只保留一个实心主操作；复制、返回和版本切换使用描边或轻量按钮；删除与安全操作分离。按钮文案直接说明结果，例如“生成 V0 + 五组裂变提示词”。

### Navigation and data display

AI 前贴工作流的 01–03 是真实顺序，使用链接并在 URL 中保留当前步骤。标签承载元数据；复杂结果优先使用明确标题、可展开分镜和完整可复制文本。

### Forms and overlays

项目的筛选与简单枚举选择采用原生 select，接受操作系统拥有弹层外观，并保留标准键盘行为。字段必须有可见标签；错误在当前任务区说明恢复方式。通知沿用工作区统一反馈。

### Iconography

界面主要依赖文字和少量通用符号；关键操作始终保留文字标签，不以图标单独表达专业流程。

### Motion

动效只用于状态过渡与 hover 反馈，保持短暂、可中断；减少动态偏好下不依赖动画表达状态。

### Content and data visualization

文案使用简洁、直接的业务语言。模型分析、素材证据和可执行生成提示词必须分层呈现，禁止在生成提示词内混入点击率、留存率或“目的”等分析话术。

## Do's and Don'ts

- **Do:** 明确区分历史前贴提供的钩子机制和新正片提供的剧情事实。
- **Do:** 让每个异步生成结果可追溯、可复制并保留版本。
- **Don't:** 把不同素材的人物、关系、台词或剧情事实混用。
- **Don't:** 用更小的字体或更密集的并排卡片掩盖信息结构问题。
