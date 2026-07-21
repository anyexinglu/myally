## Why

小程序当前没有原生 tabBar，首页与“我的空间”之间靠页面底部一个自绘胶囊导航用 `wx.redirectTo` 切换。用户已明确要求增加第三个 tab「精选」：把 AI 超市项目里手工整理的真实数据（AI 工具清单与场景方案）以原生页面呈现给「我在」用户，尤其是中老年可读的工具入门与场景指引。入口结构升级为原生三 tab 后，自绘导航必须同步移除，否则会出现双底部栏。

## What Changes

- `app.json` 新增原生 `tabBar`：聊天（home）/ 精选（featured）/ 我的（mine）三项，纯文字、不引图片资源；`pages/featured/index` 注册在 home 之后；`watch`、`devtest` 保留在 pages 但不进 tabBar。
- 新增原生页面 `pages/featured`：顶部 segment 切换「技能」（AI 工具卡片：名称、一句话介绍、难度、免费标签、「复制官网」按钮调 `wx.setClipboardData`）与「信息」（场景方案卡片：标题、适用人群、点击展开/收起分步步骤）。
- 数据源从 AI 超市项目原样复制 `tools.json`、`solutions.json` 到 `miniprogram/data/`，不改动内容，页面直接 import。
- 首页与“我的空间”移除自绘 `.bottom-nav`；首页输入框 `composer-zone` 的 fixed 定位从“自绘导航高度 + safe-area”改为贴合原生 tabBar 上沿，保证聊天页布局不变形。
- 跨 tab 跳转从 `wx.redirectTo` 改为 `wx.switchTab`（home→mine、mine→home、watch→home/mine）；守望页保留自绘导航用于返回 tab。
- 结构校验脚本补充 featured 页面注册与 tabBar 清单断言。

### Goals

- 三个 tab 在微信开发者工具中可切换，精选页两个板块展示真实数据，复制官网可用。
- 聊天页输入框、消息滚动区在原生 tabBar 下位置正确，不遮挡、不悬空。
- `npm run verify` 全量通过。

### Non-goals

- 不动云函数、不动 home 聊天逻辑、不接任何 API、不跳转外部小程序或浏览器。
- 不改写 AI 超市数据内容；不为 tabBar 引入图片资源。
- 不处理活跃 change `release-review-hardening` 中“正式包移除 watch/devtest”的规划，二者归档时再对齐。

### Privacy and deployment boundary

精选页只使用仓库内手工编写的公开数据，不涉及用户数据、AppID、OpenID、环境ID或密钥；`wx.setClipboardData` 只复制工具官网 URL。

## Capabilities

### New Capabilities

- `featured-tab`: 精选页两板块展示、板块切换、方案展开/收起与官网复制。

### Modified Capabilities

- 无（tabBar 与导航适配为实现层调整，不改变既有对话/记忆行为契约）。

## Impact

- 修改 `miniprogram/app.json`、`pages/home`（wxml/wxss/ts）、`pages/mine`（wxml/ts）、`pages/watch`（ts）、`miniprogram/tsconfig.json`、`scripts/validate-project.js`。
- 新增 `miniprogram/pages/featured/` 四件套与 `miniprogram/data/` 两个 JSON。
- 更新 README 与 PRODUCT-HANDOFF 的真实实现状态。
