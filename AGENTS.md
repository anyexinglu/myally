# 我在 MyAlly｜个人AI助理项目 Agent接手规则

任何参与本项目的 Agent 在分析、规划或改代码前，必须依次阅读：

1. `docs/PRODUCT-PLAN.md`：整体产品与技术主计划；
2. `docs/PRODUCT-HANDOFF.md`：最新定位、讨论结论、竞品证据、关键取舍和待验证问题；
3. `docs/OPENSPEC-WORKFLOW.md`：结构性变更的提案、实施、验证、同步和归档规则；
4. `README.md`：当前代码实现与真实验收边界。

如果上述文档冲突，以 `docs/PRODUCT-HANDOFF.md` 中日期最新且标为“已确认”的产品决策为准；已生效OpenSpec规格描述系统行为，README描述真实实现状态。必须显式解决冲突，不能静默沿用旧路线。

## 文档职责

- `docs/PRODUCT-PLAN.md`：目标架构、阶段路线、交付物、验收标准；
- `docs/PRODUCT-HANDOFF.md`：为什么这样做、讨论演进、证据来源、未决问题、交接状态；
- `docs/OPENSPEC-WORKFLOW.md`：OpenSpec与现有文档的职责分工和操作约束；
- `openspec/specs/`：初始化后保存当前已生效的可验证行为契约；
- `openspec/changes/`：初始化后保存活跃变更及其proposal、design、tasks和spec delta；
- `README.md`：代码当前真正实现了什么、如何运行和验证；
- 代码注释：只解释局部实现，不承载产品决策。

## 沉淀规则

每次出现以下内容，都要在结束任务前同步到 Markdown：

- 用户定位、产品承诺或优先级变化；
- 架构决策、模型/框架选型及理由；
- 竞品能力、开源项目、许可证和一手来源；
- 被否决的路线及否决理由；
- 新风险、隐私边界、安全约束；
- 实测结果、验收边界和未完成项；
- 下一位 Agent 无聊天上下文会缺失的任何信息。

不要把聊天记录原样堆入文档。应整理成：`结论 → 依据 → 影响 → 待办/待验证`。

## 隐私红线（严格执行，违反即拒绝）

### 四级隔离架构

```
Hermes 分身私有数据（~/.hermes/private/）
   ↓ 仅同步「公共技能定义、能力层」，不携带任何用户个人信息
小程序公共代码库（miniprogram/ + cloudfunctions/）
   ↓ 按 openid 天然隔离
云数据库（messages / observations / skill_memory / profile_items）
   ↓ 文档 key 以 openid 前缀隔离
用户 A ←→ 用户 B 互不可见
```

- **小程序代码（miniprogram/、cloudfunctions/、tests/）不得包含任何真实用户个人数据**：不得有年龄、住址、健康数据、家庭信息、作息习惯、人名。所有示例必须用通用虚构数据（如「30岁上班族」「两岁宝宝」）。
- `skill_memory` / `profile_items` / `observations` 等集合文档 key 以 `openid` 前缀天然隔离，查询必须带 `ownerId` 过滤。
- 云函数 conversations 中的 `SYSTEM_PROMPT` 是公共模板，不得嵌入任何用户的个人信息。
- 测试用例可以使用虚构数据（mock OpenAI user），但必须与被测代码完全隔离、不写入生产集合。
- AGENTS.md、README.md、Git 历史、文档、注释不得出现 AppID、环境 ID、Token、OpenID 等真实标识。

## 自进化架构（通用能力，所有技能共享）

### 核心意图

每个技能（占卜师、育儿、健康、话术、健身……）都具备**三个层次的进化能力**，全部以通用机制实现，新增技能自动继承：

**层次一：技能级记忆（已实现）**
- 每用户×每技能一条 skill_memory，记录用户偏好（领域偏好、使用习惯、沟通方式）
- 对话前自动注入 agent prompt（model-adapter.js）
- 对话后自动提取新偏好并更新（domain.js send() 末尾）
- 示例：用户 A 第一次问感情塔罗，第二次再聊时 AI 自动知道「这位用户偏好塔罗感情方向」

**层次二：分身级进化（LLM 驱动，每 2 天同步）**
- cron (2e82885734ac) 每 2 天读取分身当前状态（SOUL.md + 对话记录 + definitions.json）
- LLM 分析判断是否需要调整 any 技能的定义（话术、逻辑、合规等）
- 有调整 → patch hermes-twin/src/skills/definitions.json
- sync.cjs 校验隐私 → 写入小程序 skills.json → tsc → git commit
- 分身自进化主阵地在 hermes-twin，小程序复用结果

**层次三：公共升级不影响个人**
- skills.json 升级（话术优化、能力扩展）→ 所有用户自动生效
- 用户已有的 skill_memory 仍自动注入，体验连续
- 用户间的 skill_memory 完全隔离，互不影响

### 复用方式

新增技能时只需要：① 在 skills.json 加一条定义 ② systemPrompt 末尾加自进化指令（参见占卜师样例「【自进化指令】……」）
skill_memory 读写、隔离、提取全部自动继承，无需改云函数。

### 公共技能层 vs 私有用户数据层

- `skills.json` / `skills.ts` / `solutions.json` / `solutions.ts` — **公共模板**，所有用户共享。升级后所有用户自动生效，不影响已有 skill_memory。
- `skill_memory` 集合 — **每个用户×每个技能独立**。升级技能提示词后，skill_memory 仍自动注入，用户感受连续。
- `profile_items` / `observations` — **每个用户独立**。由 MemoryObserver 写入，`ownerId` 过滤读取。

### 技能同步（每 2 天从 Hermes/hermes-twin，LLM 驱动）

- Kanonical 源：`~/Documents/hermes-twin/src/skills/definitions.json`
- 同步不是纯文件拷贝，cron agent 会先：
  1. 读取 definitions.json + SOUL.md + HERMES-ISSUES.md
  2. 用 session_search 检索近期分身与用户的对话（是否有技能改进方向）
  3. LLM 分析判断是否需要调整 any 技能（不限于一个）
  4. 有调整→patch definitions.json；无变化→跳过
  5. 执行同步脚本（校验隐私 + 写 skills.json + tsc）
  6. git commit + 报告
- 自进化主阵地在 Hermes-twin：分身的行为进化、偏好记录、技能调优在 hermes-twin 完成；小程序侧的 skill_memory 只面向公众用户，两者不交叉。
- Hermes Agent 版本升级不影响：分身身份（SOUL.md/SKILL.md）、记忆（memory tool）、技能定义与分身工作流完全独立于 Hermes 框架版本，升级后自动继承。

## 工作纪律

- 先设计、确认，再做结构性改动；
- OpenSpec初始化后，结构性改动必须先建立change并获得用户确认，再进入实现；完成后先验证和同步规格，再归档；
- 区分代码 POC、实际集成和端到端验收；
- 未安装、未绑定、未部署、未真机测试的能力不得称为完成；
- 优先复用经过许可证和源码审计的开源思想/模块，不整套照搬未经验证的项目；
- 修改后运行项目现有验证命令，并把真实结果更新到 README 或交接文档。
- **三级自证纪律**：每次修复/功能改动后，必须按 L0(编译测试) → L1(automator行为自测) → L2(真机确认) 逐级验证，每级通过才能进入下一级。汇报时必须写出真实验证结果，不允许只说"已修复"。
- **数据文件一律 .ts 禁止 .json import**：小程序 TS 项目关掉 useCompilerPlugins 后，工具不处理 `.json` import。所有数据文件（skills.json、solutions.json、onboarding-questions.json 等）必须用同名 .ts 文件 export default，import 时不带扩展名。新增数据文件时必须同时创建 .ts 版本。`.json` 只做数据源存储，不参与编译链。
