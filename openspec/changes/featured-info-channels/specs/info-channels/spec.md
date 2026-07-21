# info-channels 规格增量

## ADDED Requirements

### Requirement: ingest-feed 云函数接收每日内容

系统 SHALL 提供 `ingest-feed` 云函数接收外部系统推送的每日频道内容，入参为 `{ feedType, date, title, content, token }`；feedType MUST 为 `ai-news`、`parenting`、`sidehustle` 之一；date MUST 匹配 `YYYY-MM-DD`；title 与 content MUST 非空；content MUST 不超过 20000 字符；任一校验失败 MUST 返回 `{ ok:false, code:'VALIDATION' }` 且不写库。

#### Scenario: 合法推送写入成功

- **WHEN** 外部系统以合法 feedType、date、title、content 和正确 token 调用 ingest-feed
- **THEN** 云数据库 `daily_feeds` 集合出现一条对应记录，返回 `{ ok:true, id }`

#### Scenario: 非法 feedType 被拒绝

- **WHEN** 推送的 feedType 为 `stock-tips`
- **THEN** 返回 `{ ok:false, code:'VALIDATION' }`，`daily_feeds` 无新文档

#### Scenario: 超长内容被拒绝

- **WHEN** 推送的 content 超过 20000 字符
- **THEN** 返回 `{ ok:false, code:'VALIDATION' }`，不调用任何写库操作

### Requirement: 推送 token 鉴权

ingest-feed MUST 校验 token：优先与云函数环境变量 `FEED_INGEST_TOKEN` 比对；未配置环境变量时 MUST 回退读取 `config` 集合中 `_id='feed_ingest_token'` 文档的 `value`；两者都未配置时 MUST 关闭式失败返回 `{ ok:false, code:'INTERNAL' }`；token 不一致 MUST 返回 `{ ok:false, code:'FORBIDDEN' }` 且不写库。token MUST NOT 硬编码在代码或仓库中。

#### Scenario: 错误 token 被拒绝

- **WHEN** 以错误 token 推送一条合法内容
- **THEN** 返回 `{ ok:false, code:'FORBIDDEN' }`，`daily_feeds` 无新文档

#### Scenario: 未配置 token 时关闭式失败

- **WHEN** 环境变量与 config 集合均未配置 token，外部系统推送内容
- **THEN** 返回 `{ ok:false, code:'INTERNAL' }`，不写库

### Requirement: 频道内容 upsert 与 scope 规则

写入 `daily_feeds` 时 SHALL 以 `feedType+date` 判重：已存在则覆盖更新 title/content/scope/createdAt，不存在则新增；同一 feedType+date 重复推送 MUST NOT 产生重复文档。scope MUST 由服务端按 feedType 推导：`sidehustle` 为 `personal`，其余为 `public`；调用方传入的 scope MUST 被忽略。

#### Scenario: 同日重复推送覆盖

- **WHEN** 同一 feedType+date 先推送标题「旧标题」再推送标题「新标题」
- **THEN** 集合中该 feedType+date 仍只有一条文档，标题为「新标题」

#### Scenario: sidehustle 标记为私人

- **WHEN** 推送 feedType 为 `sidehustle` 的内容
- **THEN** 落库文档 scope 为 `personal`；推送 `ai-news` 落库 scope 为 `public`

### Requirement: 精选页信息频道切换与日报展示

精选页信息板块 SHALL 在顶部提供频道切换：场景方案（默认）、AI日报、育儿、副业雷达；场景方案频道 MUST 保持既有静态卡片行为不变；三个日报频道 SHALL 通过 `wx.cloud.database()` 查询 `daily_feeds`（复用既有 `wx.cloud.init`，不重复初始化），按 feedType 过滤、date 降序取最近 7 条；列表项 MUST 展示日期与标题，点击展开以纯文本显示 content；查询失败或无数据时 MUST 展示空态文案「内容生成中，明天再来看看」；scope 为 `personal` 的频道列表项 MUST 带「私人」标记。

#### Scenario: 用户切换到 AI 日报频道

- **WHEN** 用户在信息板块点击「AI日报」chip
- **THEN** 列表按日期降序展示该频道最近内容（日期+标题），点击某条展开全文，markdown 符号原样显示

#### Scenario: 频道暂无内容

- **WHEN** 用户切换到尚无数据的「育儿」频道
- **THEN** 页面展示「内容生成中，明天再来看看」，不报错、不白屏

#### Scenario: 副业雷达带私人标记

- **WHEN** 用户切换到「副业雷达」频道且已有内容
- **THEN** 每条列表项展示「私人」标记
