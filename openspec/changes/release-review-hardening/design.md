## Context

当前正式页面清单包含`watch`和`devtest`，且“我的”页直接显示开发者测试入口；`conversations`云函数允许客户端通过`event.mode=raw`直接调用模型。产品已明确为个人AI伙伴，首轮提审应只呈现真实核心路径，并满足AI透明度、文本安全、用户反馈和数据控制的最低发布边界。

## Decisions

### 1. 正式包收敛到三页

`app.json`只注册`home`、`mine`和`about`。首页与我的页移除“守望”，旧记录/共享摘要不再出现在首轮审核体验。测试与A/B脚本继续保留在仓库的`tests/`目录，但不允许从小程序导航访问。

### 2. 删除裸模型生产旁路

云函数不再读取`event.mode`。所有`send`请求统一进入`ConversationService.send`，从而共享输入长度、幂等、owner隔离、Agent策略、工具白名单、记忆和错误处理。A/B对照继续通过本地测试bridge完成，不部署到生产云函数。

### 3. 内容安全作为Conversation依赖

领域层接收`contentModerator.checkText(text, context)`接口：

- 用户文本在持久化和模型调用前检查；
- AI回复在保存和返回前检查；
- `pass`才继续；`risky/review`或检查异常均失败关闭；
- 错误只返回稳定错误码，不把用户正文或审核细节写入日志。

CloudBase适配使用服务端`cloud.openapi.security.msgSecCheck`，传入可信OPENID、`version=2`和适合对话的scene；函数目录`config.json`必须声明`permissions.openapi: ["security.msgSecCheck"]`并由契约测试守护。测试使用确定性fake，不调用外部服务。

### 4. AI透明度与服务边界

每条助手回复周边显示“AI生成，仅供参考”。服务说明页声明产品能力、非专业服务边界、主要数据类型、用途、记忆与对话删除方式、AI标识方式和反馈投诉入口。模型/备案信息只展示已确认事实，不编造备案号。

### 5. 当前会话删除

新增owner-scoped `deleteConversation`：服务端从可信OPENID取得owner，只删除该owner与目标conversationId匹配的消息。前端确认后调用并清除本机conversationId。记忆继续由现有逐条删除控制；本change不删除Observation审计关系或CloudBase真实测试数据。

### 6. 发布与回滚

先本地验证和OpenSpec校验，再部署`conversations`，随后在目标AppID开发者工具验证真实对话、安全失败、删除和说明页。上传体验版后进行手机验证；只有平台允许所需类目和材料齐备时才提交审核。失败时可回滚Git提交并重新部署上一版本，不切换计费状态。

## Risks / Trade-offs

- [内容安全OpenAPI权限或参数不匹配] → 失败关闭并在体验版先验证，未通过前不提审。
- [审核接口增加延迟] → 只检查本轮用户文本与最终回复，保持60秒函数超时并记录非正文错误。
- [移除旧页面影响历史POC] → 代码历史和领域测试保留，首轮正式包不暴露旧入口。
- [个人主体类目阻塞] → 代码完成不等于可正式提审，后台结果单独记录。

## Migration Plan

1. 新增失败测试并实现内容安全与删除契约。
2. 收敛页面清单，移除生产测试/守望/旧记录入口。
3. 本地全量验证、隐私扫描和OpenSpec校验。
4. 部署目标CloudBase云函数并完成DevTools真实冒烟。
5. Git提交推送，上传体验版并进行手机验证。
6. 在后台尝试提交审核；若类目/资质阻塞，保存准确提示并停止规避性操作。
