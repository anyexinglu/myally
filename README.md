# 个人AI助理项目（原“有我 MyAlly”）｜POC-0

> 长期懂你，陪你做到。正式小程序名称待注册，当前优先候选为“知伴行”。
>
> **Agent 接手前必读：** `AGENTS.md`、`docs/PRODUCT-PLAN.md` 和 `docs/PRODUCT-HANDOFF.md`。主计划v3.0是当前执行基线；现有代码仍是记录/分享型POC-0，不代表AI闭环已完成。

## 项目文档

- [`docs/PRODUCT-PLAN.md`](docs/PRODUCT-PLAN.md)：产品、架构、阶段路线和验收标准；
- [`docs/PRODUCT-HANDOFF.md`](docs/PRODUCT-HANDOFF.md)：决策依据、竞品证据、技术取舍和待验证问题。

## 已实现范围

- 原生微信小程序TypeScript代码；
- 文字、语音、图片三种输入；
- CloudBase文件上传和`entries`云函数；
- 本人记录列表和本人删除；
- `private/shared`授权状态；
- “守望”照护者只读取主动分享的类型和摘要，不读取原文/文件；
- 照护者权限由云函数`ADMIN_OPENIDS`环境变量控制；
- Node领域测试和项目结构/TypeScript检查。

## 本地验证

```bash
npm install
npm run verify
```

最近实测（2026-07-17）：7/7领域测试通过，项目结构检查通过，TypeScript检查通过，演示流程通过。上述测试覆盖的是旧记录/分享型POC-0，不覆盖v3.0规划中的模型、长期记忆、临时对话和行动闭环。

## 微信开发者工具接入

1. 安装微信开发者工具，导入本目录；首次克隆时复制`project.config.example.json`为本机`project.config.json`。
2. 在开发者工具中选择测试/正式AppID；真实AppID所在的`project.config.json`和`project.private.config.json`均已Git忽略，不得强制加入版本库。
3. 开通CloudBase环境，在`miniprogram/config/env.ts`本机填写环境ID，不提交真实值。
4. 创建`entries`集合；安全规则禁止小程序端直接读写，所有访问只经云函数。
5. 在`cloudfunctions/entries`安装依赖并上传部署云函数。
6. 云函数环境变量设置`ADMIN_OPENIDS=<照护者openid>`。
7. 用两个微信账号验证：A的私密输入B不可见；A主动共享后照护者只看到摘要；B不能删除A记录。

## 当前验收边界

自动测试、TypeScript检查、微信开发者工具导入、测试AppID绑定和预览二维码均已真实通过；预览包约22.8KB。本机AppID配置已从Git索引移除并由`.gitignore`保护。微信CLI明确返回“测试号不能使用云服务”，因此必须换正式小程序AppID后才能创建CloudBase环境、部署云函数、跑通真实CRUD和双账号隔离。当前口径是“本地代码POC＋微信预览完成”，不是完整POC。

## 已知安全债

官方最新版`wx-server-sdk@4.0.2`的传递依赖当前被`npm audit`报告1个中危、5个高危；回退`2.5.3`会恶化为3个严重、6个高危，因此POC保持官方最新版，不用未验证的`overrides`强改内部依赖。正式发布前必须验证上游修复或替代调用方案。
