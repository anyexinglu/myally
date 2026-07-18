# 我在 MyAlly｜个人AI助理项目 POC-1B代码POC

> 长期懂你，陪你做到。中文产品名已确认为“我在”，英文名保留“MyAlly”；微信小程序名称注册状态仍待实时验证。
>
> **Agent 接手前必读：** `AGENTS.md`、`docs/PRODUCT-PLAN.md`、`docs/PRODUCT-HANDOFF.md`和`docs/OPENSPEC-WORKFLOW.md`。主计划v3.2是当前执行基线。OpenSpec及首个change已初始化；Hermes-lite代码链路和小程序入口已实现。2026-07-18已切换到用户新建的小程序AppID：独立CloudBase环境和两个云函数在线，四个集合、拒绝客户端直连策略及11个业务索引均已按清单创建。成长计划的云开发资源及混元10亿免费Token已领取，环境已无付费升级地切换到资源点模式，按量付费和自动续费保持关闭；`hy3`真实调用已由开发者工具完成“文字发送→用户消息落库→模型回复→助手消息展示”的端到端验证。当前主链剩余项是记忆中心、第二轮记忆影响回答、临时模式、白名单工具、双账号隔离及真机验收。

## 项目文档

- [`docs/PRODUCT-PLAN.md`](docs/PRODUCT-PLAN.md)：产品、架构、阶段路线和验收标准；
- [`docs/PRODUCT-HANDOFF.md`](docs/PRODUCT-HANDOFF.md)：决策依据、竞品证据、技术取舍和待验证问题。
- [`docs/OPENSPEC-WORKFLOW.md`](docs/OPENSPEC-WORKFLOW.md)：后续结构性迭代的提案、实施、验证、同步和归档规则。

## 已实现范围

- 原生微信小程序TypeScript代码；
- 首页已按微信式对话重构：消息流、文字输入、图片选择/预览、发送中和失败状态；
- `conversations`云函数：先记录用户文字/图片消息，再调用CloudBase AI，再保存助手回复；
- CloudBase视觉模型适配：云存储`fileId`只在服务端换临时URL，不向小程序暴露模型凭证；
- `requestId`顺序幂等：已完成的同一轮请求不会重复调用模型，失败重试不会重复写用户消息；
- 失败消息提供原位“重试”，复用原`requestId`和已上传图片，避免用户重新输入造成重复轮次；
- 消息来源标记：用户消息`memoryEligible=true`，助手生成内容为`false`，为后续Hermes式观察/候选记忆留出安全边界；
- Hermes-lite最多3步Agent Loop、`general / personal_advice / factual_research`能力路由和版本化只读Skill v1.1；
- 可选fast/reasoner/multimodal/observer模型路由；未配置专用模型时兼容回退到单一基础模型；
- `current_time / memory_search / realtime_search`白名单读取工具、统一Policy Engine和写工具拒绝；
- LLM Memory Observer、Observation/Profile Item分层、相关记忆注入和回答级记忆引用；
- 显式纠正按owner与稳定语义key关闭旧版本，只召回当前值，同时保留可审计时间线；
- `observations`与`profile_items` CloudBase Repository、owner隔离、记忆列表和删除API；
- 首页临时对话开关；临时模式不读取、不检索也不生成长期记忆；
- “我的空间”已增加记忆中心、来源时间和删除入口；
- 实时搜索通过可替换HTTPS适配器启用；未配置时返回明确不可用状态；
- 旧记录能力仍支持文字、语音、图片三种输入；
- CloudBase文件上传和`entries`云函数；
- 本人记录列表和本人删除；
- `private/shared`授权状态；
- “守望”照护者只读取主动分享的类型和摘要，不读取原文/文件；
- 照护者权限由云函数`ADMIN_OPENIDS`环境变量控制；
- 首页、我的记录、守望三页已统一为白底＋薄荷绿视觉，采用轻卡片、圆角输入区和胶囊式底部导航；
- Node领域测试和项目结构/TypeScript检查。

## 本地验证

```bash
npm install
npm run verify
```

最近实测（2026-07-18）：领域、契约、部署清单与云函数入口集成测试全部通过，26个必需文件结构检查、部署副本一致性和TypeScript检查通过。云函数入口测试用纯内存仿CloudBase SDK加载实际部署文件，覆盖服务端OPENID、用户消息先落库、模型回复、Observation/Profile Item写入、第二轮记忆注入、另一账号隔离、缺集合时不误称消息已保存，以及Node.js 16缺少`structuredClone`时的兼容入口；这提高部署前可信度，但不替代真实CloudBase验收。新小程序环境已完成四个集合、拒绝客户端直连策略和11个业务索引，两个云函数均已部署。环境在不购买升级套餐、不启用按量付费或自动续费的前提下切换到资源点模式；首次真实模型调用暴露Node.js 16不支持`structuredClone`，两个云函数入口补兼容层并重新部署后，开发者工具重试已收到`hy3`真实助手回复。下一步继续完成记忆写入与召回、临时模式、白名单工具、双账号隔离及真机验收。

首页安全区修复（2026-07-17）：顶部根据微信胶囊位置动态计算起点，“私密对话 / 临时对话”改为胶囊左侧的轻量状态入口；输入框按底部导航高度和`safe-area-inset-bottom`定位，导航使用`border-box`避免实际高度超出声明值。本轮`npm run verify`通过，开发者工具可识别新版页面节点且问题面板为0；本机ScreenCaptureKit在复查时启动失败，因此仍需以开发者工具模拟器或真机截图完成最终视觉留档。

## 微信开发者工具接入

1. 安装微信开发者工具，导入本目录；首次克隆时复制`project.config.example.json`为本机`project.config.json`。
2. 在开发者工具中选择测试/正式AppID；真实AppID所在的`project.config.json`和`project.private.config.json`均已Git忽略，不得强制加入版本库。
3. 在开发者工具中先开通或绑定CloudBase测试环境；若工具显示`cloudProject: false`或环境列表为空，必须由项目管理员完成开通。然后在`miniprogram/config/env.ts`本机填写环境ID，不提交真实值。
4. 创建`entries`、`messages`、`observations`和`profile_items`集合；安全规则禁止小程序端直接读写，所有访问只经云函数。建议索引见OpenSpec change的`design.md`。
5. 在CloudBase AI+开启模型；默认适配`cloudbase / hy3`，用于当前成长计划/体验模型的最低配置冒烟。`MYALLY_MODEL_NAME`可覆盖基础回退；开通资源点套餐并在控制台启用对应模型后，可选设置`MYALLY_FAST_MODEL_NAME`、`MYALLY_REASONER_MODEL_NAME`、`MYALLY_MULTIMODAL_MODEL_NAME`和`MYALLY_OBSERVER_MODEL_NAME`。模型名必须以当前环境“模型管理”实际启用项为准；如需实时搜索，再配置受信HTTPS服务的`MYALLY_SEARCH_ENDPOINT`和仅存在于云函数环境的`MYALLY_SEARCH_API_KEY`。
6. 分别在`cloudfunctions/entries`、`cloudfunctions/conversations`安装依赖并上传部署。
7. `entries`云函数环境变量设置`ADMIN_OPENIDS=<照护者openid>`。
8. 依次验证文字→消息落库→模型回复、明确偏好→记忆中心→第二轮引用、当前时间→工具调用、删除→不再召回、临时模式→不读写记忆；最后用两个微信账号验证消息和记忆隔离。

环境开通后的部署辅助命令：

```bash
npm run cloud:check
export MYALLY_CLOUDBASE_ENV_ID='<仅写本机环境，不要提交或粘贴到聊天>'
npm run cloud:deploy
```

`cloudbase/schema.json`是四个集合、索引和云函数的可审计部署清单，其中`messages(ownerId, requestId, role)`必须创建为唯一索引，才能在并发网络重试下阻止同一轮重复落库。微信开发者工具CLI当前只负责云函数部署，不负责建集合；请先在CloudBase控制台按该清单创建集合、索引，并将小程序端直接访问设为拒绝。部署脚本不保存环境ID、SecretId或SecretKey。

## 当前验收边界

自动测试、Hermes-lite Fake Model闭环、TypeScript、OpenSpec严格校验、微信开发者工具编译和预览包生成已真实通过；新AppID的CloudBase环境、四个集合、客户端拒绝策略、11个业务索引和两个云函数均已就绪。成长计划10亿免费Token已领取，资源点模式已激活且按量付费、自动续费保持关闭；`hy3`真实文字回复已在小程序界面完成端到端验证。本机正式AppID和环境ID均不得进入版本库。尚未真实验收的是Observer/Profile记忆写入、记忆中心、第二轮召回影响回答、临时模式、白名单工具、删除传播、双账号隔离和真机端测。另一个旧小程序环境中的历史函数上传不计入本项目验收。当前口径是“POC-1B代码、本地验证、前端预览及微信AI文字主链完成”，不是全部记忆与账号隔离验收完成。

## 已知安全债

官方最新版`wx-server-sdk@4.0.2`的传递依赖当前被`npm audit`报告1个中危、5个高危；回退`2.5.3`会恶化为3个严重、6个高危，因此POC保持官方最新版，不用未验证的`overrides`强改内部依赖。正式发布前必须验证上游修复或替代调用方案。
