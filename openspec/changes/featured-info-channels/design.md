# featured-info-channels 设计

## 架构与数据流

```text
外部分身（Mac，每日定时）
→ wx.cloud.callFunction / CLI invoke ingest-feed
→ token 校验（env FEED_INGEST_TOKEN，回退 config 集合）
→ upsert daily_feeds（feedType+date 唯一语义）
→ 小程序精选页 wx.cloud.database() 直查（按 feedType + date desc, limit 7）
→ 频道列表 / 展开阅读
```

## ingest-feed 云函数

- 入口 `cloudfunctions/ingest-feed/index.js`，依赖 `wx-server-sdk@4.0.2`，`cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })`。
- 入参校验顺序：feedType 枚举（`ai-news|parenting|sidehustle`）→ date 格式 `YYYY-MM-DD` → title 非空 → content 非空且 ≤20000 字符 → token。校验失败返回 `{ ok:false, code:'VALIDATION', message }`。
- token 解析顺序（注释写在代码中）：
  1. `process.env.FEED_INGEST_TOKEN`（CloudBase 控制台可为云函数配置环境变量）；
  2. 未配置时读 `config` 集合 `_id='feed_ingest_token'` 文档的 `value` 字段——因为微信开发者工具 CLI 的 `functions deploy` 不支持设置环境变量，这是默认初始化方式：控制台在 `config` 集合手动建一条 `{ _id:'feed_ingest_token', value:'<随机长串>' }`；
  3. 两者都未配置 → 返回 `{ ok:false, code:'INTERNAL', message:'ingest token 未配置' }`（关闭式失败，不放行）。
- token 不一致返回 `{ ok:false, code:'FORBIDDEN', message:'token 无效' }`（语义 403）。
- 写入：`where({feedType, date}).limit(1).get()`，命中则 `doc(_id).update` 覆盖 `title/content/scope/createdAt`，否则 `add`；返回 `{ ok:true, id }`。
- 集合自愈：写入时若报 collection 不存在（-502005），先 `db.createCollection('daily_feeds')` 再重试一次；`config` 集合不存在按未配置 token 处理（关闭式失败）。
- `createdAt` 存 ISO 字符串；展示排序只用 `date` 字段，不依赖 `createdAt` 时区。

## 数据模型

`daily_feeds`：`{ feedType: 'ai-news'|'parenting'|'sidehustle', date: 'YYYY-MM-DD', title: string, content: string(markdown 原文), scope: 'public'|'personal', createdAt: string }`。scope 由服务端按 feedType 推导，客户端传了也忽略。建议索引：`feedType+date` 唯一索引（防并发双写产生重复）；低流量下可先不加，见 tasks。

`config`：`{ _id: string, value: string }`，仅存运维密钥文档，客户端安全规则必须拒绝读写。

## 权限设计

- `daily_feeds`：安全规则 `{"read": true, "write": false}`（所有用户可读，仅云函数/控制台可写）。CLI 不支持设置安全规则 → 控制台手动设置一次，README 记录步骤。未设置前小程序端查询会失败，前端按空态降级展示。
- `config`：安全规则全拒（默认新建集合即全拒，无需操作）。

## 前端

- `app.ts` `onLaunch` 已 `wx.cloud.init`，页面直接 `wx.cloud.database()`，不重复 init。
- 精选页信息板块（segment=info）顶部 chips：`场景方案（默认）| AI日报 | 育儿 | 副业雷达`。场景方案渲染逻辑零改动。
- 日报频道：`where({feedType}).orderBy('date','desc').limit(7).get()`；按频道缓存，切回不重复拉取；`onShow` 不自动刷新（低频页面，下拉刷新/重进再拉）。
- 列表项：日期+标题（+「私人」标记 when scope==='personal'）；点击展开/收起 content，`white-space: pre-wrap` 纯文本显示。
- 加载中/失败/空列表统一空态文案「内容生成中，明天再来看看」。

## 失败与回滚

- token 泄露：控制台改 `config` 文档 value 即全量失效，无需改代码。
- 误推内容：控制台删除对应 `feedType+date` 文档即可；重复推送本身幂等覆盖。
- 回滚：删除云函数与集合、前端改回无 chips 版本即可，无数据迁移负担。
