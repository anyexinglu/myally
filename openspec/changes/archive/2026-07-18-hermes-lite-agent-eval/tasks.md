# Hermes-lite Agent 评估框架 · 实施任务

## 前置条件

- `@fission-ai/openspec` 已安装
- `js-yaml` 已安装（`npm install js-yaml`）
- 项目单元测试全部通过（`npm test`）

---

## Task 1: 评测框架核心代码

**文件：** `tests/eval/runner.js`, `tests/eval/evaluator.js`, `tests/eval/judge.js`, `tests/eval/report.js`

### 验证条件

- [ ] `runner.js` 能加载 YAML 场景文件
- [ ] 能调用 ConversationService.send() 执行多轮对话
- [ ] `evaluator.js` 支持以下断言类型：
  - [ ] memoryStatus
  - [ ] usesMemory
  - [ ] containsKeywords
  - [ ] notContains
  - [ ] createdMemories
- [ ] 输出控制台表格（场景名 / pass数 / 总分）
- [ ] 运行结果追加到 HISTORY.md
- [ ] `npm run test:eval` 一键运行

---

## Task 2: 首批YAML场景

**文件：** `tests/eval/scenarios/basic-memory.yaml`

### 验证条件

- [ ] Scenario 1-1（低风险偏好）：3步，验证记忆建立、使用和跨轮持续
- [ ] Scenario 1-2（个人目标）：2步，验证不同类型记忆的建立和召回

---

## Task 3: 隐私与临时模式场景

**文件：** `tests/eval/scenarios/privacy.yaml`, `tests/eval/scenarios/temporary.yaml`

### 验证条件

- [ ] 跨用户隔离场景（2步）
- [ ] 临时模式不写记忆（2步）

---

## Task 4: LLM-Judge 集成

**文件：** `tests/eval/judge.js`, `tests/eval/scenarios/quality.yaml`

### 验证条件

- [ ] judge.js 调用 deepseek-chat 评估回答质量
- [ ] quality.yaml 包含实用度/个性化评估维度
- [ ] 评分结果写回 report 表格

---

## Task 5: 回回归对比

**文件：** `tests/eval/runner.js`（扩展）

### 验证条件

- [ ] `--baseline` 和 `--current` 参数
- [ ] 输出对比表格
