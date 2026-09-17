# Lumina UX Contract

## Product context

- Audience: 短剧投放、素材分析与创意制作团队。
- Primary jobs: 素材入库、证据化分析、分类复核、钩子复用、脚本与提示词生成。
- Target markets: 由素材市场字段决定，支持中文及海外多语种内容。
- Active locale: `zh-CN`；素材内容语言独立于界面语言。
- Accessibility target: WCAG 2.2 AA。

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| 素材分析与工作流 | `工作台开发文档.md` | Product brief | 2026-09-04 |
| 分类、分析和生成数据 | `app/lib/inspiration-material-store.ts`、`app/lib/material-library-store.ts` | Domain/API contract | 2026-09-04 |
| AI 前贴与解说裂变 | 当前用户确认的单素材迭代、多语言和版本化规则；`app/api/prompt-fission/route.ts`、`app/api/narration-fission/route.ts` | Current decision + API contract | 2026-09-05 |
| 删除与权限 | `pb_hooks/material_analysis.pb.js` | Server authorization/domain contract | 2026-09-04 |

## Visual contract

- Project design context: `DESIGN.md`。
- Token ownership: 现有运行时 CSS 为实现源，`DESIGN.md` 记录其规范与理由。
- Runtime sources: `app/globals.css` 与各功能 CSS Module。
- Supported theme: 当前为浅色工作台；高对比模式保留系统颜色行为。

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Table Selection | 功能表格自身的语义化选择控件 | 具体业务流与服务端范围 | page / all-results | component + E2E |
| Select/Listbox | 原生 `select` | `DESIGN.md` 与现有工作区表单 | native | keyboard + popup |
| Date | 原生日期输入 | 素材筛选工作流 | native | locale + keyboard + E2E |
| Form | 业务组件内有标签的原生表单控件 | 对应 API/domain contract | create / edit | validation E2E |
| Scrollbar | `app/globals.css` 全局滚动条基线 | `DESIGN.md` | geometry exceptions | computed style |
| Toast | `InspirationWorkspace` 统一状态提示 | 工作区反馈行为 | success / warning / info / error | live-region test |
| CRUD | 对应 store 函数与 PocketBase hook | 服务端 domain contract | return / stay | full-flow E2E |

## Component behavior

| Component | Default | Hover | Focus | Active | Disabled | Busy | Error |
|---|---|---|---|---|---|---|---|
| Button | 明确动词 | 边框或表面变化 | 可见蓝色焦点 | 保持尺寸 | 降低强调且禁止触发 | 原尺寸内更新文案 | 当前任务区说明恢复方式 |
| Input/select | 可见标签 | 边框增强 | 蓝色边框与外圈 | 保留原生行为 | 非交互光标 | 禁止重复提交 | 文本说明纠正方式 |
| Search | 非空时显示清除按钮 | 强化清除按钮 | 焦点可见 | 本地立即更新 | n/a | 远程请求显示状态 | 区分无结果与读取失败 |
| Table/list | 保留稳定行高 | 强调当前行 | 行内操作可聚焦 | 选择有文字/形状反馈 | 操作不可用时解释 | 保留布局 | 失败可重试 |

## Dataset navigation

- 买量素材使用服务端分页并保留已加载页；素材库为受控规模列表。
- 已提交的搜索与筛选保留在 URL；清空筛选不影响无关路由状态。
- 明确区分空数据、无筛选结果、加载失败和后台分析中。

## Flow ledger

| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| 素材入库 | “买量素材入库” | 文件或链接级状态 | 素材列表 | 统一提示 | 保留失败项并重试 | 返回入库上下文 | `app/lib/inspiration-material-store.ts` |
| 分析/重新分析 | 分析按钮 | 阶段与进度 | 当前列表/详情 | 统一提示 | 显示分析错误并允许重试 | 保留触发上下文 | `pb_hooks/material_analysis.pb.js` |
| 原前贴镜头脚本 | 重新生成并保存 | 按钮忙碌 | 当前脚本页 | 显示版本号 | 保留旧版本并重试 | 保留在操作区 | `app/api/prompt-storyboard/route.ts` |
| 解说文案 | 重新生成并保存 | 按钮忙碌 | 当前文案页 | 显示版本号 | 保留分析原文和旧版本并重试 | 保留在操作区 | `app/api/narration-script/route.ts` |
| 前贴裂变 | 生成 V0 + 五组 | 按钮忙碌、禁止重复 | 当前裂变页 | 显示保存版本 | 保留模式、结尾问题、语言与改造维度并说明错误 | 保留在设置区 | `app/api/prompt-fission/route.ts` |
| 解说文案裂变 | 生成 V0 + 五组 | 按钮忙碌、禁止重复 | 当前裂变页 | 显示保存版本 | 保留选择并说明错误 | 保留在设置区 | `app/api/narration-fission/route.ts` |
| 跨剧适配 | 选择模板与目标素材后生成 V0 + 3 个方案 | 按钮忙碌、禁止重复 | 当前跨剧适配页 | 显示兼容度、目标映射和版本 | 保留目标选择并说明错误 | 保留在适配设置区 | `app/api/material-adaptation/route.ts` |
| 人工复核 | 顶部“人工复核” | 保存按钮忙碌 | 当前复核类型 | 显示推导归类与素材库同步结果 | 保留两个判断与备注并允许重试 | 保留在复核项 | `pb_hooks/material_analysis.pb.js` |
| 删除 | 删除按钮 + 应用内确认 | 对话框内忙碌 | 所属列表 | 统一提示 | 对话框内保留并重试 | 返回相邻项目 | `pb_hooks/material_analysis.pb.js` |

## Navigation and responsive behavior

- AI 前贴与解说均采用 01 分析、02 原脚本/解说文案、03 裂变的可深链步骤，状态保存在 `workflow` URL 参数中。
- 灵感大屏下方提供可展开的“AI前贴创意”入口，包含前贴创意策划、前贴迭代复刻和前贴精准匹配；创意策划采用无正片创意先行模式，复刻与匹配复用 AI 前贴库和剧库资产，默认只在边界设置与候选选择时请求用户确认。
- AI 前贴与解说新增 04 跨剧适配步骤；模板机制、目标证据和“前贴结束 → 正片切入”必须分层展示，适配结果保存到模板资产版本历史。
- 人工复核是顶部一级入口，并在“类型分流、内容证据、钩子边界”三个范围间明确切换。类型分流采用待办队列、声画证据和人工决策三栏结构。
- 工作区在窄屏折叠为单列；关键操作与完整值不可依赖 hover 才能访问。
- 页面标题反映当前工作区；返回操作移除详情参数并回到所属素材库。

## Overlays and feedback

- 使用应用内模态结构，不调用浏览器 `alert`、`confirm` 或 `prompt`。
- 通知在工作区固定位置短暂显示；需要纠正的错误同时留在任务上下文。
- 删除等危险操作与安全主操作分离，等待服务端确认后关闭。

## Async and resilience

- 生成、保存和删除默认采用悲观提交，按钮忙碌时禁止重复触发。
- 原前贴脚本与解说文案在模型返回首字后逐字显示；校验或保存失败时不覆盖旧版本。
- 生成失败保留裂变方向、强度和语言设置；旧版本不会被覆盖。
- 每次前贴脚本、解说文案、前贴裂变和解说文案裂变都写入版本历史；仅在服务端确认后宣告保存。
- 后台素材分析使用阶段状态轮询，页面可离开后返回。
- “证据不足，暂不归类”保留人工待核结论；“退回重分析”清除旧类型人工覆盖后强制刷新模型证据，避免旧结论压住新分析。
- 本地文件和每行一个的远程视频链接可混合批量入库；来源哈希与文件内容哈希命中时不重复创建或分析。

## Validation

- 客户端先验证资产证据和必填设置，服务端再次验证资产类型、已验证口播/镜头和输出结构。
- 视频类型复核必须分别回答“是否存在独立制作的前贴”和“是否存在独立解说口播”。有前贴且有解说时同时进入 AI 前贴库和解说库；无前贴但有解说时只进入解说库；两者均无时才允许归为原剧拼接。任一项证据不足时保持未判定且不进入专属素材库。人工确认结果优先于后续自动分类。
- 人工确认“存在 AI 前贴”只确认素材类型，不等于确认前贴边界。AI 前贴只有在边界证据成立、已生成独立媒体文件且 `clip_status=ready` 后才能进入复刻与镜头脚本流程；禁止用完整源视频或默认时长冒充已裁剪前贴。
- 前贴裂变不依赖新正片，只能在锁定原前贴异常事件、关系/因果、钩子问题与剧情承诺后生成。用户选择的是制作模式、结尾保留的问题和主/辅改造维度，不是点击率或留存率等营销目标；解说裂变不得混入角色对白、字幕或剧情摘要。
- 前贴裂变保留“复刻”和“裂变”两种能力；03 输出 V0 + 五个故事引擎（因果同构迁移、危险结果前置、关系误判反转、连续异常升级、双重误导翻转），每个引擎各有 A/B/C（现实适配、异常事件、高冲突翻转）三个分支，共十五组方案。原前贴的人物关系、具体动作和故事背景均视为可替换变量，只有抽象母版因果机制需要保留。目标剧情允许按“冲突创作强度”补充异常动作或冲突事件，但新增内容必须单独写入 `creativeAdditions` 并与目标素材已知事实区分，不能冒充原素材证据；V1—V5 不得只改变叙事顺序、镜头语言、人物表演或剪辑节奏。
- 跨剧适配必须先输出模板机制 → 目标证据映射和兼容度；模板人物、关系、台词、地点与结局不得直接带入目标剧。前贴适配必须提供目标正片切入时间段、动作/画面/声音桥和至少两条连续性校验，缺失则不保存。
- 原前贴镜头脚本必须连续覆盖完整前贴区间；小于等于 0.5 秒的缺口或重叠自动归一，大缺口只补扫缺失区间，最终以确定性时间轴封口，禁止因为单个区间异常丢弃整份镜头提示词。
- 服务器错误不得把原始机密信息放入 URL、提示或剪贴板。

## Permission and clipboard

- 权限以服务端校验为准；前端隐藏或禁用不替代授权。
- 完整提示词仅在用户点击明确的复制按钮后写入剪贴板，成功提示不回显全部内容。

## Verification

- Required commands: `npm run build`、`npm test`、功能文件 ESLint、Premium UI 静态审计。
- Browser matrix: 当前流程至少验证桌面宽屏与 620px 以下单列、加载、空目标、失败和成功结果状态。
- Canonical sibling: AI 前贴 02 原前贴镜头脚本的版本保存与复制流程。
