# 我在 MyAlly｜OpenSpec迭代与归档规则

> 决策日期：2026-07-17。状态：已确认采用，尚未执行`openspec init`。下一次结构性开发开始前完成初始化并提交首个变更提案。

## 1. 为什么采用

本项目会由不同Agent跨会话接手。聊天记录不能成为需求事实源，而单一大计划也不适合承载每次实现的详细设计和任务状态。OpenSpec把“当前已生效的规格”和“正在提议的变更”分开，并在完成后保存提案、设计、任务和规格增量，适合本项目的棕地持续迭代。

官方项目：<https://github.com/Fission-AI/OpenSpec>；概念与归档：<https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md>。

## 2. 文档职责与优先级

| 文档/目录 | 职责 | 不负责 |
|---|---|---|
| `docs/PRODUCT-PLAN.md` | 长期产品目标、架构边界、阶段路线和退出条件 | 单次改动的逐文件任务 |
| `docs/PRODUCT-HANDOFF.md` | 决策依据、竞品/开源证据、真实实现状态和未决问题 | 代替可执行规格 |
| `README.md` | 当前代码真正实现了什么、如何运行和验证 | 描述尚未落地的能力为已完成 |
| `openspec/specs/` | 已生效、可验证的系统行为契约 | 产品愿景和讨论过程 |
| `openspec/changes/<change>/` | 单次变更的proposal、design、tasks和spec delta | 永久保存已完成变更 |
| `openspec/changes/archive/` | 已完成变更的完整审计轨迹 | 活跃任务管理 |

发生冲突时按以下顺序处理：

1. 最新且明确标为“已确认”的产品决策；
2. 已生效的`openspec/specs/`行为契约；
3. 当前已批准的OpenSpec change；
4. README中的真实代码与验收状态。

冲突不能静默选择一方。Agent必须指出冲突，修正文档或规格后再继续。

## 3. 使用新版OPSX工作流

OpenSpec 1.x使用动作式OPSX工作流。初始化后以本机实际安装版本的官方命令为准，典型流程为：

```text
/opsx:explore
→ /opsx:new 或 /opsx:ff
→ 用户审阅 proposal / design / specs / tasks
→ /opsx:apply
→ 自动测试与真实集成验证
→ /opsx:verify
→ /opsx:sync
→ /opsx:archive
```

不要依据旧教程假定`/openspec:proposal`等历史命令仍然有效。升级OpenSpec后必须先核对release notes和本地`openspec --version`。

## 4. 什么时候必须建Change

以下改动必须先建立OpenSpec change并由用户确认后实施：

- 新增或改变用户可见能力；
- API、数据模型、权限、隐私或删除语义变化；
- Agent Loop、Skill、Tool、Prompt、模型路由和记忆治理变化；
- 跨三个及以上模块的重构；
- 引入新的外部服务、开源Runtime或重要依赖；
- 验收标准、错误处理或降级语义变化。

纯文案、小范围样式修复、测试补充和不改变行为的内部整理可以不建Change，但仍需更新README或交接文档中的真实状态。

## 5. Change最低内容

每个结构性变更至少包含：

- `proposal.md`：现状、目标、范围、非目标、影响和风险；
- `design.md`：架构、数据流、接口、权限、失败与回滚；
- `tasks.md`：可独立验证的任务和顺序；
- `specs/*/spec.md`：新增、修改或删除的行为要求，每条要求至少有一个Scenario；
- 验收证据：自动测试结果、部署状态、真机/真实模型结果和未完成边界。

规格示例和测试数据必须完全虚构，不得包含`.hermes`真实画像、对话、医疗资料、OpenID、AppID、Token或生产日志。

## 6. POC-1首个Change

初始化后的第一个change建议命名为：

```text
hermes-lite-agent-memory-poc
```

它覆盖：Conversation契约、Agent Orchestrator、三类Skill、白名单工具、LLM回复、LLM Memory Observer、相关记忆注入、记忆中心、删除、临时模式和双账号隔离。真流式回复若会扩大基础设施，可拆为后续独立change，不得用UI假流式冒充服务端流式。

## 7. 初始化与升级约束

初始化前先确认Node.js满足OpenSpec当前要求，再使用官方包：`@fission-ai/openspec`。初始化会生成项目文件和Agent集成配置，因此必须先查看diff，不覆盖本项目已有`AGENTS.md`规则。OpenSpec升级后运行官方更新流程，并再次检查生成文件、命令名称和本项目隐私规则是否仍然存在。
