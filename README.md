# 我在 MyAlly｜个人AI助理项目 POC-1A

> 长期懂你，陪你做到。中文产品名已确认为“我在”，英文名保留“MyAlly”；微信小程序名称注册状态仍待实时验证。
>
> **Agent 接手前必读：** `AGENTS.md`、`docs/PRODUCT-PLAN.md`、`docs/PRODUCT-HANDOFF.md`和`docs/OPENSPEC-WORKFLOW.md`。主计划v3.1是当前执行基线；下一阶段已确认为Hermes-lite智能体与记忆闭环，但尚未完成OpenSpec初始化、真实CloudBase部署、真机模型调用或长期记忆闭环。

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

最近实测（2026-07-17）：12/12领域测试通过，项目结构检查和TypeScript检查通过，首页WXSS也通过开发者工具自带`wcsc`编译器检查。测试已覆盖文字/图片消息、模型适配输入、来源标记、失败后单次落库和顺序幂等。微信开发者工具模拟器能载入新页面结构，但本机日志同时出现`WeappVendor 3.16.2 verify md5 error`和路由超时，页面级样式未可靠挂载，因此本轮视觉预览不能算通过；CloudBase真实模型调用和真机视觉也尚未完成。

## 微信开发者工具接入

1. 安装微信开发者工具，导入本目录；首次克隆时复制`project.config.example.json`为本机`project.config.json`。
2. 在开发者工具中选择测试/正式AppID；真实AppID所在的`project.config.json`和`project.private.config.json`均已Git忽略，不得强制加入版本库。
3. 开通CloudBase环境，在`miniprogram/config/env.ts`本机填写环境ID，不提交真实值。
4. 创建`entries`和`messages`集合；安全规则禁止小程序端直接读写，所有访问只经云函数。
5. 在CloudBase AI+开启模型；默认适配`cloudbase`提供方和`glm-5v-turbo`。也可在`conversations`云函数环境变量设置`MYALLY_MODEL_PROVIDER`和`MYALLY_MODEL_NAME`替换为控制台已配置的兼容视觉模型。
6. 分别在`cloudfunctions/entries`、`cloudfunctions/conversations`安装依赖并上传部署。
7. `entries`云函数环境变量设置`ADMIN_OPENIDS=<照护者openid>`。
8. 先验证文字→记录→模型回复，再验证图片→云存储→视觉模型→回复；最后用两个微信账号验证消息和记录隔离。

## 当前验收边界

自动测试与TypeScript检查已真实通过；本轮新对话UI已尝试模拟器预览，但受本机开发者工具运行库校验错误影响，不能作为视觉通过证据。本机AppID配置由`.gitignore`保护。微信CLI明确返回“测试号不能使用云服务”，因此必须换正式小程序AppID后才能部署`conversations`、调用真实模型并跑双账号隔离。当前口径是“POC-1A代码与本地测试完成”，不是CloudBase集成或端到端完成。

## 已知安全债

官方最新版`wx-server-sdk@4.0.2`的传递依赖当前被`npm audit`报告1个中危、5个高危；回退`2.5.3`会恶化为3个严重、6个高危，因此POC保持官方最新版，不用未验证的`overrides`强改内部依赖。正式发布前必须验证上游修复或替代调用方案。
