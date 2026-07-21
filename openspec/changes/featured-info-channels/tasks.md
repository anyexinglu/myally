## 1. 规格与云函数

- [x] 1.1 创建 featured-info-channels 的 proposal、design、spec 和任务清单
- [x] 1.2 新建 `cloudfunctions/ingest-feed/`（入参校验、token 双通道校验、scope 推导、feedType+date upsert、集合自愈创建）
- [x] 1.3 `cloudbase/schema.json` 增加 `daily_feeds`（clientAccess 标注 read-only）、`config`（deny）集合与 `ingest-feed` 函数清单

## 2. 前端实现

- [x] 2.1 精选页信息板块加频道 chips（场景方案默认｜AI日报｜育儿｜副业雷达），场景方案保持现状
- [x] 2.2 日报频道 `wx.cloud.database()` 查 `daily_feeds`（feedType 过滤、date 降序、limit 7、按频道缓存），列表「日期+标题」、点击展开纯文本 content、「私人」标记、空态文案

## 3. 验证与部署

- [x] 3.1 `scripts/validate-project.js` 增加 ingest-feed 与频道链路断言；新增 `tests/ingest-feed.test.js`
- [x] 3.2 运行 `npm run check`、`npm test`、OpenSpec 严格校验
- [x] 3.3 CLI 部署 `ingest-feed` 并用 invoke 推送一条虚构测试数据验证通路（随后删除）
- [x] 3.4 更新 README 与 docs/PRODUCT-HANDOFF.md（结论→依据→影响→待验证）
- [ ] 3.5 控制台手动一次：`daily_feeds` 安全规则设为所有用户可读/仅管理端可写；`config` 集合建 `feed_ingest_token` 文档（真实 token 不进仓库）
- [ ] 3.6 微信开发者工具/真机复查：四频道切换、列表展示、展开阅读、空态与「私人」标记
