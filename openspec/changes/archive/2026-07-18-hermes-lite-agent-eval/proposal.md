## Why

当前 POC-1B 已完成 Hermes-lite Agent Loop 的代码实现和本地 34 个单元测试，覆盖了输入验证、数据存储、工具调用和隐私隔离。但缺少对 **AI 回复质量** 本身的可重复评估：

1. "我在"是否正确使用了记忆？
2. 多轮对话后，记忆是积累还是覆盖？
3. 回答是否个性化、有针对性？
4. 重新实现或更换模型后，质量是否回退？

现有单元测试只能回答"代码是否正确执行"，不能回答"AI 回答得好不好"。需要一个独立的评测框架来解决这个缺口。

## What Changes

在 `tests/eval/` 下建立 OpenSpec 风格的评测框架：

```
tests/eval/
├── scenarios/         # 场景定义（YAML），新增用例只建文件
│   ├── basic-memory.yaml     # 基本记忆持久性
│   ├── multi-turn.yaml       # 多轮记忆积累
│   ├── privacy.yaml          # 隐私隔离
│   ├── temporary.yaml        # 临时模式
│   └── quality.yaml          # 回复质量（LLM-Judge）
├── runner.js         # 场景运行器
├── evaluator.js      # 评估器（硬断言 + LLM评分）
├── judge.js          # LLM-Judge 调用封装
├── report.js         # 报告与历史
└── HISTORY.md        # 趋势跟踪
```

### Goals

- YAML定义场景，新增用例不写代码
- 每个场景包含多轮对话，模拟真实使用
- 支持硬断言（关键词/状态检查）和 LLM-Judge（回答质量评分）
- 运行结果写入 HISTORY.md 跟踪趋势
- `npm run test:eval` 一键运行
- 第一个YAML场景即可在当前代码上执行并出结果

### Non-goals

- 不做小程序UI自动化
- 不做真实用户数据回放
- 不做大规模并发评测（>100场景）
- 不做 CI 自动阻断（Phase 4再做）

## Impact

- 新增约 200 行 Node.js 代码（runner + evaluator + judge）
- 新增 5 个 YAML 场景文件
- 新增依赖：`js-yaml`（YAML加载）
- 不影响现有业务代码和测试

## Privacy

- 场景数据完全虚构
- LLM-Judge 调用只传虚构场景文本和评估标准，不传真实用户数据
- HISTORY.md 只记录分数，不记录对话内容
