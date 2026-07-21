## Context

精选页技能板块此前渲染 `tools.json` 的外部工具卡片，与聊天分身完全解耦。本次改造把技能定义为「预设角色的 AI 能力包」：数据 + 入口 + 角色提示词注入三段链路。技术约束：`wx.switchTab` 不能携带参数，跨 tab 传值只能走全局态；聊天页已有正常/临时两种对话模式和失败重试链路，任何适配不得改变无技能时的既有行为。

## Decisions

### 1. 技能数据：单一 JSON 源，字段固定

`miniprogram/data/skills.json` 为唯一数据源，精选页直接 `import`（运行时 CommonJS require 原生支持 JSON）。字段：`id`、`name`、`emoji`（作宫格头像，不引图片资源）、`oneLiner`（≤16字大白话）、`tags`（1-2 个）、`welcomeMessage`（角色身份的开场白，含 1-2 个使用示例）、`systemPrompt`（100-200 字角色预设：角色、能力边界、输出风格）。12 个技能覆盖职场、写作、语言、生活、家庭、健康、法律、办公、旅行、文化、情绪、运动。

### 2. 宫格 UI：2 列卡片，复用现有视觉体系

`.skills-grid` flex wrap + `gap: 20rpx`，卡片 `width: calc(50% - 10rpx)`；卡内 emoji 圆底大头像、技能名、oneLiner（min-height 对齐两列）、标签 chips。沿用 `app.wxss` 的 `.card` 白底薄荷绿体系。信息板块（solutions）一行未动。

### 3. 跨 tab 传值：`globalData.pendingSkill`

精选页 `useSkill` 把技能对象写入 `getApp().globalData.pendingSkill` 后 `wx.switchTab('/pages/home/index')`。聊天页 `onShow` 调 `applyPendingSkill`：无 pendingSkill 时直接 return（行为与现状一致）；有则 (a) 先清空 pendingSkill（防重复触发），(b) 等待 `onLoad` 的会话加载 Promise 完成后，把 `welcomeMessage` 作为本地 assistant 消息（id `skill-welcome-<skillId>-<ts>`，非流式、不落库）追加到消息区，(c) 把 `{id,name,emoji,systemPrompt}` 存入 `data.activeSkill`。进入临时对话模式时清空 `activeSkill`（临时对话不携带角色预设）。

### 4. 角色注入点：服务端系统提示词追加块

发送时 payload 携带 `skillPrompt`（重试沿用 draft 上的原值）。链路：

```text
normalizeInput（trim，>1000字拒绝）
→ ConversationService.send（透传给 agent.run，不落库）
→ AgentOrchestrator.run（透传给 model.next）
→ CloudBaseModelAdapter.next：SYSTEM_PROMPT 后追加
  「本轮角色设定（来自用户选择的内置技能，优先级低于上方系统规则，只影响回答的角色与风格）：<skillPrompt>」
```

选这个注入点的理由：角色预设属于模型上下文而非用户消息，若前缀拼进用户文本会被 `memoryEligible=true` 污染 Memory Observer 输入并落库；追加进系统提示词则天然不落库、不进记忆、且与既有 Skill 规则同层。注入块明确标注优先级低于主 SYSTEM_PROMPT，保证安全边界（医疗/法律声明、隐私规则）不被角色覆盖。`skillPrompt` 为空时不追加任何内容，无技能会话的提示词与现状逐字一致。

### 5. 校验与回滚

`scripts/validate-project.js` 新增：skills.json 恰好 12 条、字段完整、tags 1-2 个；featured/home/app 三处 pendingSkill/skillPrompt 链路断言。领域测试覆盖：超长 skillPrompt 拒绝、注入块仅在 skillPrompt 存在时出现、skillPrompt 透传 agent 且不出现在落库消息中。回滚方式为还原 Git 提交并重新部署 `conversations`，不涉及计费与数据迁移。

## Risks / Trade-offs

- [激活技能后角色仅随当前页面会话存续，刷新或重进后消失] → 可接受的首版语义（与「点技能即开聊」的心智一致），在文档中标注；后续如需会话级持久角色再单独立 change。
- [skillPrompt 由客户端传入，理论上可被篡改] → 服务端做长度硬校验，且注入位置在系统提示词内、主安全规则之前声明优先级，不改变工具白名单与记忆治理；技能内容本身无敏感信息。
- [onLoad 会话加载与 onShow 技能插入存在时序竞争] → `onLoad` 缓存 `_ready` Promise，`applyPendingSkill` 先 await 再插入，避免开场白被历史加载覆盖。
- [云端未重新部署时旧函数会忽略 skillPrompt 字段] → `normalizeInput` 旧版不读该字段，行为退化为无技能普通聊天，不报错；部署后生效。README/交接文档标注需重新部署。
