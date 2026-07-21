# featured-info-channels

## Why

精选页「信息」板块当前是 7 个静态场景方案（`miniprogram/data/solutions.json`），内容写死在仓库里，无法每日更新。用户已确认新方向：信息板块升级为「频道」——保留场景方案，新增 3 个每日自动更新的内容频道：AI日报、育儿知识、副业雷达。内容由外部系统（运行在用户 Mac 上的分身）每天生成后推送到 CloudBase，小程序直接读取展示。这打通「分身生产内容 → 云端存储 → 小程序消费」的日更链路，让精选页从静态说明页变成每日有理由打开的频道页。

## What Changes

- 新增云函数 `cloudfunctions/ingest-feed`：外部系统通过 `wx.cloud.callFunction`（或控制台/CLI invoke）推送每日内容。入参 `{ feedType, date, title, content, token }`；校验枚举、非空、content ≤20000 字；token 与环境变量 `FEED_INGEST_TOKEN` 比对，未配置环境变量时回退读云数据库 `config` 集合的 token 文档（CLI 部署不支持设置环境变量，见 design.md）；同一 `feedType+date` 重复推送覆盖更新（upsert）。
- 新增云数据库集合 `daily_feeds`：`{ feedType, date, title, content, scope, createdAt }`；`scope` 规则：sidehustle=`personal`，其余=`public`。目标权限：小程序端任何用户可读、写仅云函数/控制台（CLI 不支持设置安全规则，需控制台手动设置一次，README 已标注）。
- 精选页信息板块顶部加频道切换 chips：场景方案（默认）｜AI日报｜育儿｜副业雷达。场景方案保持现状；三个日报频道由小程序端 `wx.cloud.database()` 直查 `daily_feeds`（复用 `app.ts` 已有的 `wx.cloud.init`，不重复 init），按 feedType 过滤、date 降序取最近 7 条；列表显示「日期+标题」，点击展开纯文本渲染 content（markdown 符号原样显示）；空态文案「内容生成中，明天再来看看」；`scope==='personal'` 频道列表项加「私人」标记。
- `cloudbase/schema.json` 增加 `daily_feeds`、`config` 集合与 `ingest-feed` 云函数部署清单；`scripts/validate-project.js` 增加结构断言；新增 `tests/ingest-feed.test.js` 覆盖校验、token 拒绝、scope 规则与 upsert。

### Goals

- 外部系统每日可用一条 invoke 调用把 markdown 内容写入 `daily_feeds`，重复推送同日内容不产生重复文档。
- 精选页信息板块四个频道可切换，日报频道能看到最近 7 天的「日期+标题」列表并展开阅读。
- `npm run check`、`npm test`（除 2 个既有 release-hardening 红灯）、OpenSpec 严格校验通过；`ingest-feed` 真实部署并经 CLI invoke 验证通路。

### Non-goals

- 不做 markdown 富文本渲染（towxml 等组件），content 纯文本原样展示。
- 不做外部系统侧（分身）的生成逻辑，本 change 只交付接收与展示链路。
- 不做内容评论、收藏、分享、推送订阅提醒。
- 不改场景方案静态数据与技能板块。

### Privacy and deployment boundary

`daily_feeds` 内容为分身生成的资讯类内容，不含用户对话与画像；`sidehustle` 标 `personal` 仅为前端展示标记，真实访问控制依赖集合安全规则（所有用户可读、写仅管理端）。ingest token 是共享密钥，只存在于云函数环境变量或 `config` 集合（客户端不可读），绝不进入仓库与文档。测试与示例数据全部虚构。
