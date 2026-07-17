# 我在 MyAlly｜个人AI助理项目 POC-1B代码POC

> 长期懂你，陪你做到。中文产品名已确认为“我在”，英文名保留“MyAlly”；微信小程序名称注册状态仍待实时验证。
>
> **Agent 接手前必读：** `AGENTS.md`、`docs/PRODUCT-PLAN.md`、`docs/PRODUCT-HANDOFF.md`和`docs/OPENSPEC-WORKFLOW.md`。主计划v3.2是当前执行基线。OpenSpec及首个change已初始化；Hermes-lite代码链路和小程序入口已实现，微信开发者工具已重新编译并成功生成正式AppID预览包，但尚未完成CloudBase开通、真实对话部署或真机端测。

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
- 消息来源标记：用户消息`memoryEligible=true`，助手生成内容为`false`，为后续Hermes式观察/候选记忆留出安全边界；
- Hermes-lite最多3步Agent Loop、`general / personal_advice / factual_research`能力路由和版本化只读Skill；
- `current_time / memory_search / realtime_search`白名单读取工具、统一Policy Engine和写工具拒绝；
- LLM Memory Observer、Observation/Profile Item分层、相关记忆注入和回答级记忆引用；
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

最近实测（2026-07-17）：23/23领域、契约与部署清单测试通过，26个必需文件结构检查、部署副本一致性和TypeScript检查通过。`npm run demo:agent`真实跑通Fake Model两轮记忆影响回答、一次工具调用、临时模式、删除和双账号隔离。微信开发者工具Stable 2.01.2510290已用正式AppID重新编译本轮UI，构建面板为0个问题，并由CLI成功生成43.2KB预览包和二维码。当前AppID尚未开通CloudBase：工具侧记录为`cloudProject: false`且环境列表为空，环境接口也返回微信侧`system error`，因此真实数据库、云函数和模型链路尚不能部署；扫码只证明前端预览包可生成，不等于AI端到端完成。

## 微信开发者工具接入

1. 安装微信开发者工具，导入本目录；首次克隆时复制`project.config.example.json`为本机`project.config.json`。
2. 在开发者工具中选择测试/正式AppID；真实AppID所在的`project.config.json`和`project.private.config.json`均已Git忽略，不得强制加入版本库。
3. 在开发者工具中先开通或绑定CloudBase测试环境；若工具显示`cloudProject: false`或环境列表为空，必须由项目管理员完成开通。然后在`miniprogram/config/env.ts`本机填写环境ID，不提交真实值。
4. 创建`entries`、`messages`、`observations`和`profile_items`集合；安全规则禁止小程序端直接读写，所有访问只经云函数。建议索引见OpenSpec change的`design.md`。
5. 在CloudBase AI+开启模型；默认适配`cloudbase`提供方和`glm-5v-turbo`。可设置`MYALLY_MODEL_PROVIDER`、`MYALLY_MODEL_NAME`和`MYALLY_OBSERVER_MODEL_NAME`。如需实时搜索，再配置受信HTTPS服务的`MYALLY_SEARCH_ENDPOINT`和仅存在于云函数环境的`MYALLY_SEARCH_API_KEY`。
6. 分别在`cloudfunctions/entries`、`cloudfunctions/conversations`安装依赖并上传部署。
7. `entries`云函数环境变量设置`ADMIN_OPENIDS=<照护者openid>`。
8. 依次验证文字→消息落库→模型回复、明确偏好→记忆中心→第二轮引用、当前时间→工具调用、删除→不再召回、临时模式→不读写记忆；最后用两个微信账号验证消息和记忆隔离。

环境开通后的部署辅助命令：

```bash
npm run cloud:check
export MYALLY_CLOUDBASE_ENV_ID='<仅写本机环境，不要提交或粘贴到聊天>'
npm run cloud:deploy
```

`cloudbase/schema.json`是四个集合、索引和云函数的可审计部署清单。微信开发者工具CLI当前只负责云函数部署，不负责建集合；请先在CloudBase控制台按该清单创建集合、索引，并将小程序端直接访问设为拒绝。部署脚本不保存环境ID、SecretId或SecretKey。

## 当前验收边界

自动测试、Hermes-lite Fake Model闭环、TypeScript、OpenSpec严格校验、微信开发者工具编译和预览包生成已真实通过；真实CloudBase集合、模型和搜索服务尚未部署。本机已配置正式AppID且由`.gitignore`保护，但该AppID当前尚未开通CloudBase环境；开通并绑定测试环境后才能完成真实模型、数据库和双账号验收。当前口径是“POC-1B代码、本地验证与前端预览构建完成”，不是CloudBase集成或微信端到端完成。

## 已知安全债

官方最新版`wx-server-sdk@4.0.2`的传递依赖当前被`npm audit`报告1个中危、5个高危；回退`2.5.3`会恶化为3个严重、6个高危，因此POC保持官方最新版，不用未验证的`overrides`强改内部依赖。正式发布前必须验证上游修复或替代调用方案。
