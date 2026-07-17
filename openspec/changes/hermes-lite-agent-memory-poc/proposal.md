## Why

当前POC只完成了小程序消息落库和一次完整模型回复的代码链路，尚不能在真实CloudBase中证明长期记忆、能力路由、工具调用、临时模式和用户控制。下一阶段需要把它升级为可在微信中直接预览和对话的Hermes-lite个人智能体，同时保持多租户身份、隐私和失败边界可验证。

## What Changes

- 扩展Conversation契约，使用户消息经可信OpenID隔离、幂等保存后，进入最多3步的受控Agent Loop。
- 新增`general / personal_advice / factual_research`能力路由和版本化只读Skill。
- 新增`memory_search / current_time / realtime_search`白名单读取工具；工具执行前经过Policy Engine，结果返回模型后生成最终回答。
- 新增只读取原始用户消息的LLM Memory Observer，以及`Observation → Profile Item → Retrieval → Context Injection`闭环。
- 新增记忆中心、删除传播和临时对话；临时模式不读也不写长期记忆。
- 保留现有文字/图片消息链路；图片、真流式回复和外部写操作不是本change的核心退出条件。
- 增加模型、Observer和工具失败的显式降级，不用模板伪装成功。

### Goals

- 用户可在微信预览环境发送消息，消息进入CloudBase集合并收到真实LLM回复。
- 第二轮回答可正确使用第一轮明确记忆，并展示本轮实际使用的记忆来源。
- 至少一个问题由模型真实调用白名单工具后使用工具结果回答。
- 记忆删除、临时模式、双账号隔离和日志脱敏有自动测试与真机验收脚本。

### Non-goals

- 不引入完整Hermes或Grok Build Runtime，不开放shell、文件系统、MCP、subagent或任意网络工具。
- 不使用Grok-1开放权重，不训练每用户模型。
- 不让模型在线创建或修改生产Skill。
- 不在本change实现行动提醒、语音ASR、老人/儿童模式或家庭共享。

### Privacy and deployment boundary

真实对话、画像、OpenID、AppID、环境ID、模型密钥和生产日志只能存在于受控CloudBase环境或本机忽略文件，不得进入Git。代码完成、本地测试、CloudBase部署、微信预览/真机端测分别记录；缺少正式AppID或环境配置时不得称为端到端完成。

## Capabilities

### New Capabilities

- `conversation-runtime`: 可信身份、消息持久化、幂等、历史加载、模型回复和失败降级。
- `hermes-lite-agent`: 能力路由、只读Skill、最多3步Agent Loop、白名单工具和策略审批。
- `personal-memory`: 用户原文观察、确认/候选分层、相关召回、来源、防递归污染和删除传播。
- `memory-controls`: 记忆中心、删除、临时对话和回答级记忆使用说明。

### Modified Capabilities

当前尚无已生效OpenSpec规格。

## Impact

- 新增`packages/agent`、`packages/memory`、`packages/skills`、`packages/tools`及对应测试。
- 扩展`cloudfunctions/conversations`并新增CloudBase集合/索引要求。
- 扩展小程序首页、我的页和CloudBase调用适配。
- 新增OpenSpec开发依赖与仓库内Codex工作流文件。
- 真实实时搜索供应商通过适配器注入；未配置时必须明确降级，不能悄悄使用过期模型知识冒充实时结果。
