# skill-zone 规格增量

## ADDED Requirements

### Requirement: 精选页技能专区宫格

精选页技能板块 SHALL 以 2 列宫格展示内置技能数据，数据来自仓库内 `miniprogram/data/skills.json`；每张卡片 MUST 包含 emoji 头像、技能名称、一句话简介和至多 2 个标签；信息板块（场景方案）MUST 保持既有行为不变。

#### Scenario: 用户浏览技能宫格

- **WHEN** 用户进入精选页默认的技能板块
- **THEN** 页面以 2 列宫格展示 12 个内置技能，每张卡片可见 emoji 头像、名称、一句话简介与标签，不调用任何云函数或外部接口

### Requirement: 点击技能进入聊天并展示开场白

点击技能卡片 SHALL 把该技能对象暂存到 `getApp().globalData.pendingSkill` 并以 `wx.switchTab` 跳转聊天页；聊天页 `onShow` 检测到 pendingSkill 时 MUST 在消息区插入该技能的 `welcomeMessage` 作为 assistant 消息展示，并在消费后立即清空 pendingSkill；插入的欢迎消息 MUST NOT 落库或参与会话历史。

#### Scenario: 用户点击技能卡片

- **WHEN** 用户在精选页点击「周报助手」卡片
- **THEN** 小程序切换到聊天 tab，消息区出现周报助手角色身份的开场白（含使用示例），再次切换 tab 不会重复插入

#### Scenario: 无技能进入聊天页

- **WHEN** 用户直接点击 tabBar 进入聊天页且不存在 pendingSkill
- **THEN** 聊天页消息区、输入与发送行为与未引入技能专区前完全一致

### Requirement: 技能角色注入会话上下文

激活技能后，聊天页发送消息时 SHALL 在 payload 携带该技能的 `skillPrompt`；服务端 MUST 校验其长度上限（1000 字，超出拒绝）并将其作为系统提示词中主安全规则之后的角色设定块注入模型调用；skillPrompt MUST NOT 写入消息记录、MUST NOT 进入 Memory Observer 输入、MUST NOT 改变工具白名单与记忆治理语义。skillPrompt 为空时 MUST NOT 追加任何提示词内容。

#### Scenario: 激活技能后发送消息

- **WHEN** 用户激活「家常菜厨子」后发送「我有鸡蛋和西红柿」
- **THEN** 模型调用的系统提示词包含该技能的角色设定块，回复以厨子角色给出做法；落库的用户消息只含用户原文，assistant 消息不携带技能提示词

#### Scenario: 超长技能提示词被拒绝

- **WHEN** 发送 payload 中的 skillPrompt 超过 1000 字
- **THEN** 服务端以参数校验错误拒绝该次发送，不调用模型、不落库

#### Scenario: 重试沿用原技能角色

- **WHEN** 激活技能后某条消息发送失败，用户点击原位重试
- **THEN** 重试沿用原 requestId 与同一份 skillPrompt，不产生重复用户消息
