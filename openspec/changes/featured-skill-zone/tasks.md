## 1. 规格与数据

- [x] 1.1 创建 featured-skill-zone 的 proposal、design、spec 和任务清单
- [x] 1.2 新建 `miniprogram/data/skills.json`（12 个内置技能，字段完整，oneLiner≤16 字，tags≤2，systemPrompt 100-200 字）

## 2. 页面与链路实现

- [x] 2.1 精选页技能板块改 2 列宫格（emoji 头像、名称、一句话简介、标签 chips），信息板块不动，tools.json 从页面引用中移除（文件保留）
- [x] 2.2 `app.ts` 声明 `globalData.pendingSkill`；精选页 `useSkill` 暂存技能并 `wx.switchTab` 跳聊天
- [x] 2.3 聊天页 `onShow` 消费 pendingSkill：插入 welcomeMessage 本地 assistant 消息、激活角色、注入后清空 pendingSkill；临时模式清空 activeSkill
- [x] 2.4 发送链路携带 `skillPrompt`；`normalizeInput` 校验（≤1000 字）；ConversationService → AgentOrchestrator → model-adapter 注入系统提示词追加块
- [x] 2.5 同步 `cloudfunctions/conversations/domain.js` 与 `agent.js` 部署副本

## 3. 验证与文档

- [x] 3.1 `scripts/validate-project.js` 增加 skills.json 字段断言与 pendingSkill/skillPrompt 链路断言
- [x] 3.2 新增领域测试：超长拒绝、注入块仅在场时出现、透传且不落库
- [x] 3.3 运行 `npm run check`、`npm test`、OpenSpec 严格校验
- [x] 3.4 更新 README 与 docs/PRODUCT-HANDOFF.md（结论→依据→影响→待验证）
- [ ] 3.5 微信开发者工具/真机复查：宫格视觉、点击进聊天、开场白展示、角色化回答（需重新部署 `conversations` 后验证）
