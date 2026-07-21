## Why

精选页「技能」板块目前是外部 AI 工具卡片列表（名称、难度、免费标签、「复制官网」按钮），用户点击后只能复制链接自行去浏览器使用，与「我在」分身没有任何联动。用户已确认新方向：把技能板块改造为**内置技能专区**——12 个预设角色的 AI 能力包（参考腾讯元宝专家列表的 2 列宫格形态），点击技能直接进入聊天，分身以该角色为用户服务。这相当于给分身加能力包，让精选页从「导流外部工具」变成「本产品的能力入口」。

## What Changes

- 新增 `miniprogram/data/skills.json`：12 个内置技能（周报助手、写作润色、翻译官、家常菜厨子、育儿顾问、健康问答、合同法务、Excel公式、旅行规划师、起名先生、情绪树洞、健身教练），每个含 `id / name / emoji / oneLiner / tags / welcomeMessage / systemPrompt`。
- 精选页技能板块从工具卡片列表改为 2 列宫格：emoji 大头像、技能名、一句话简介、标签 chips；信息板块（场景方案）完全不动。`tools.json` 文件保留在 `miniprogram/data/` 但不再被精选页引用。
- 点击技能卡片：技能对象存入 `getApp().globalData.pendingSkill`，`wx.switchTab` 跳聊天页（switchTab 不能带参）。
- 聊天页 `onShow` 消费 `pendingSkill`：插入该技能的 `welcomeMessage` 作为本地 assistant 消息展示，并把技能设为当前激活角色；注入后立即清空 `pendingSkill`，避免重复触发。
- 激活技能后，聊天页每次发送在 payload 中携带 `skillPrompt`（即技能的 `systemPrompt`）；服务端 `normalizeInput` 校验（≤1000 字），经 `ConversationService → AgentOrchestrator → CloudBaseModelAdapter.next` 拼入 Agent 系统提示词，作为主 `SYSTEM_PROMPT` 之后的角色设定块。
- 结构校验脚本补充 skills.json 字段断言与 pendingSkill/skillPrompt 链路断言；新增领域测试覆盖注入与边界。

### Goals

- 精选页技能宫格在开发者工具中可浏览，点击技能进入聊天并看到技能开场白。
- 激活技能后的回答明显以该角色身份输出；无技能时聊天行为与现状完全一致。
- `npm run check`、`npm test`（除 2 个既有 release-hardening 红灯）、OpenSpec 严格校验通过。

### Non-goals

- 不做技能的市场化运营（排序、推荐、搜索、自定义技能、用户自建角色）。
- 技能角色不写入长期记忆，不改变记忆治理、工具白名单与 Policy Engine 语义。
- 不删除 `tools.json` 文件本体；不重做信息板块。
- 不处理活跃 change `release-review-hardening` 的页面清单规划，归档时再对齐。

### Privacy and deployment boundary

技能数据为仓库内手工编写的通用内容，不含用户数据、AppID、OpenID、环境ID或密钥。`skillPrompt` 只作为模型调用的系统提示词组成部分，不落库、不进入消息记录、不参与 Memory Observer 输入；服务端对长度做硬校验。云函数改动需重新部署 `conversations` 后才在真实环境生效。
