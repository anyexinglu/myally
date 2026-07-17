## Context

POC-1A已有微信式首页、CloudBase文件上传、`conversations`云函数、`messages`集合适配、CloudBase AI `generateText`调用和请求幂等。当前`ConversationService`只把最近消息直接交给模型，不存在记忆事实源、能力路由、工具循环和用户控制；云函数也尚未在正式CloudBase环境部署验证。

Hermes Twin提供可借鉴的来源隔离、记忆分层、按需召回、Skill和纠错闭环；Grok Build提供可借鉴的Agent Loop、工具调度、上下文预算和审批边界。两者均不直接作为多租户微信后端运行。

## Goals / Non-Goals

**Goals:**

- 建立平台无关、可用InMemory测试的Conversation、Agent、Memory、Skill和Tool领域接口。
- 使用CloudBase可信`OPENID`实现消息、记忆和工具上下文隔离。
- 让主LLM参与能力/工具决策和最终回答，让Observer LLM参与结构化记忆抽取。
- 在模型、Observer、工具或结构化解析失败时提供可解释降级。
- 让用户查看、删除记忆并启用不读写长期记忆的临时模式。
- 交付可直接部署到CloudBase和微信开发者工具预览的代码与操作说明。

**Non-Goals:**

- 不实现完整Hermes/Grok Runtime、任意代码执行、MCP、subagent或自动Skill修改。
- 不实现每用户模型训练、图数据库、Embedding服务和复杂双时态冲突推理。
- 不把真流式、语音ASR、行动提醒和外部写操作作为本change的完成条件。

## Decisions

### 1. 领域模块与CloudBase适配分离

`packages/conversation`、`packages/agent`、`packages/memory`、`packages/skills`和`packages/tools`只依赖传入接口；CloudBase SDK仅出现在`cloudfunctions/conversations`。部署目录保留领域文件副本，并由结构检查保证与canonical package同步，避免云函数上传遗漏工作区外依赖。

替代方案是把全部逻辑写入云函数或直接依赖Hermes Runtime；前者不可测试且绑定平台，后者权限和运维面过大，因此拒绝。

### 2. 可信身份和多租户数据

所有Repository方法都强制接收服务端解析的`ownerId`。云函数忽略客户端提交的owner、角色和权限，只使用`cloud.getWXContext().OPENID`。CloudBase集合为`messages`、`observations`、`profile_items`，所有查询条件包含`ownerId`。

建议索引：

- `messages(ownerId, conversationId, createdAt)`；
- `messages(ownerId, requestId)`；
- `profile_items(ownerId, status, deletedAt, updatedAt)`；
- `observations(ownerId, sourceMessageId)`。

### 3. 请求幂等与消息写入顺序

`requestId`在owner范围内标识一轮请求。服务先查询同request：用户和助手消息都存在则回放；只有用户消息则继续生成；不存在则先保存用户消息。模型失败保留一次用户消息，重试不重复写入。

### 4. Hermes-lite Agent Loop

`CapabilityRouter`先用轻量规则给出默认能力，主模型可在允许集合内请求工具。`AgentOrchestrator`最多执行3个模型步骤，每步输出标准信封：

```json
{"type":"final","text":"..."}
```

或：

```json
{"type":"tool","toolName":"current_time","arguments":{}}
```

工具请求先经过`PolicyEngine`和`ToolRegistry`校验；执行结果以`tool`上下文返回模型。超过步数、未知工具、参数错误或工具失败时，最后调用模型生成带限制说明的回答；仍失败则返回明确错误，不生成伪回复。

首批Skill是仓库内常量：`general`、`personal_advice`、`factual_research`。Skill内容只描述通用方法和安全边界，不保存个人资料。

### 5. 白名单工具

- `memory_search`：只查询当前owner的已确认、未删除、当前有效记忆；临时模式禁用。
- `current_time`：返回服务端ISO时间和配置时区。
- `realtime_search`：调用注入的搜索适配器；未配置时返回结构化`unavailable`，不得伪造实时结果。

本change所有工具均为读取类。任何未来外发、写入、付费、删除或账号工具必须增加独立规格和显式确认状态。

### 6. 记忆来源、确认和防污染

Memory Observer只接收本轮原始用户消息及其不透明sourceMessageId，不接收助手回复、召回上下文或工具输出。模型输出限定为JSON数组；每项包含`type`、`value`、`keywords`、`sourceType`、`confidence`和`sensitivity`。

每项先写append-only Observation。仅`explicit_user_statement`或`explicit_user_correction`可升格为`confirmed` Profile Item；`model_inference`保持candidate且不能进入召回。Profile Item保留`sourceMessageId`、`observedAt`、`validFrom/validTo`、`extractorVersion`和删除状态。Observer失败不影响主回复，响应中明确`memoryStatus=failed`。

### 7. 检索和上下文预算

Retriever只接受confirmed、未删除和当前有效记录，用查询关键词、记忆关键词、类型和更新时间进行小数据量重排，最多返回8条/2400字符。注入块标记`do_not_store=true`，同时把实际使用的opaque记忆ID返回小程序。完整画像和candidate不得注入。

### 8. 删除传播和临时模式

删除接口先验证owner，再把Profile Item设为deleted并从当前召回排除；POC无独立Embedding/缓存，因此无额外索引正文。Observation保留最小审计关系但不得再次升格或展示正文。未来增加派生索引时，删除任务必须扩展到所有派生层。

临时模式仍可保存带`temporary=true`的短期会话消息以支持本轮历史，但Retriever、memory_search和Observer全部禁用；UI必须清晰显示临时状态。

### 9. 模型和搜索配置

CloudBase ModelAdapter继续通过环境变量选择provider/model。主模型和Observer可分别配置；未配置Observer模型时可与主模型共用。实时搜索通过可替换HTTP适配器和环境变量启用，不把密钥传给小程序或写入日志。

## Risks / Trade-offs

- [结构化JSON不稳定] → 严格解析、最大重试一次、无效结果不写记忆并记录无正文错误码。
- [云函数执行多个模型步骤导致延迟/成本增加] → Agent Loop最多3步，普通对话通常一步完成，记录模型和工具调用计数。
- [规则路由不够聪明] → 规则只作安全默认，模型仍可在白名单内请求工具；用合成评测持续调整。
- [小数据关键词检索召回有限] → POC先保证来源、删除和隔离正确，Embedding/Graphiti留到POC-2。
- [实时搜索服务在CloudBase网络不可用] → 适配器显式返回unavailable，最终回答披露未实时核验。
- [领域副本漂移] → 验证脚本逐文件比较packages与云函数副本。

## Migration Plan

1. 保留现有`messages`数据和Conversation API兼容字段。
2. 部署前创建`observations`和`profile_items`集合及索引。
3. 先在InMemory/Fake Model下验证完整领域链路。
4. 部署云函数后用一个测试账号验证消息/模型，再验证记忆和工具。
5. 用第二账号验证隔离，最后开启记忆中心入口。
6. 出现严重问题时关闭Agent/Memory环境开关，回退到POC-1A直接模型回复；不删除已有消息。

## Open Questions

- 正式CloudBase环境可用的默认主模型和Observer模型需要以控制台实测决定。
- 真流式回复所需CloudBase通道单独评估，不以客户端逐字动画冒充服务端流式。
- 实时搜索供应商需在CloudBase网络、数据出境、成本和内容合规方面完成部署前核验。
