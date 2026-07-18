## Architecture

```
tests/eval/scenarios/*.yaml          →  YAML场景定义
                    ↓
           runner.js                 →  加载YAML → 调用ConversationService → 收集每轮结果
                    ↓        ↕
           evaluator.js              →  硬断言检查 + LLM-Judge评分
                    ↓
           report.js                 →  控制台输出 + HISTORY.md写入
```

## Data Flow

```
1. runner.js 读取 scenarios/*.yaml
2. 每个 scenario 包含多个 steps
3. 每个 step 调用 ConversationService.send() 模拟对话
4. 收集每轮返回结果（assistantMessage, memoryStatus, usedMemories 等）
5. evaluator.js 对每轮结果执行断言检查
6. 评估器对每个 scenario 计算分数（pass/total + 平均分）
7. report.js 输出表格 + 追加到 HISTORY.md
8. LLM-Judge 模式：用 deepseek-chat 评估回答质量
```

## 评分模型

### 硬断言评分（覆盖功能正确性）

| 断言类型 | 说明 | 分值权重 |
|---------|------|---------|
| memoryStatus | 记忆提取状态是否正确 | 1.0 |
| usesMemory | 是否按预期使用了记忆 | 1.0 |
| containsKeywords | 回答是否包含预期关键词 | 0.5 |
| notContains | 回答是否不包含禁止词 | 0.5 |
| toolCalls | 工具调用是否符合预期 | 1.0 |
| createdMemories | 是否创建了预期数量的记忆 | 0.5 |

总分 = (通过项 × 权重) / (总项 × 权重) × 5.0

### LLM-Judge评分（覆盖回答质量）

| 维度 | 评估内容 | 权重 |
|------|---------|------|
| 实用度 | 是否给出可执行的第一步 | 1.0 |
| 个性化 | 是否使用了用户个人信息 | 1.0 |
| 不迎合 | 是否敢指出盲点而非一味赞同 | 0.5 |

用 deepseek-chat 作为 judge 模型，每项输出 1-5 分。

## 场景执行

- 所有场景共用同一 ConversationService 实例
- 每轮对话自动延续前一轮的 conversationId（`@prev`）
- 不同用户（ownerId）之间自动隔离
- 执行失败不阻塞后续场景，但标记为 failed

## 文件结构

```
tests/eval/
├── scenarios/                # YAML场景定义
│   ├── basic-memory.yaml     # P0：基本记忆持久性
│   ├── multi-turn.yaml       # P1：多轮记忆积累
│   ├── privacy.yaml          # P1：隐私隔离
│   └── temporary.yaml        # P2：临时模式
├── runner.js                 # 场景加载与执行引擎
├── evaluator.js              # 断言检查与评分
├── judge.js                  # LLM-Judge封装
├── report.js                 # 报告输出
└── HISTORY.md                # 历史趋势
```

## Runner 与业务代码的关系

- runner.js 直接 import `ConversationService`、`InMemoryMessageRepository` 等现有模块
- 使用 `InMemoryMemoryRepository` 避免依赖真实数据库
- 使用传入的 model adapter（可选真实模型或 fake model）
- 与现有测试用同样的 fixture 模式
