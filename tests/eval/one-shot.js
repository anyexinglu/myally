'use strict';

/**
 * One-Shot Evaluator — 真实流水线单次测试 + 效果评估
 *
 * 用法：
 *   node tests/eval/one-shot.js "我最近工作压力很大"
 *   node tests/eval/one-shot.js --scenario scenarios/basic-memory.yaml
 */

const fs = require('node:fs');
const path = require('node:path');
const { ConversationService, InMemoryMessageRepository } = require('../../packages/conversation');
const { SkillRegistry, CapabilityRouter } = require('../../packages/skills');
const { ToolRegistry, PolicyEngine, createCoreTools } = require('../../packages/tools');
const { AgentOrchestrator } = require('../../packages/agent');
const { InMemoryMemoryRepository, MemoryService, MemoryObserver } = require('../../packages/memory');
const { RealModelAdapter } = require('./model-adapter');

// ======== 评估报告 ========

function generateReport({ input, turn, duration }) {
  const assistant = turn.assistantMessage;
  const agent = assistant.agent || {};
  const usedMemories = turn.usedMemories || [];
  const createdMemories = turn.createdMemories || [];
  const toolCalls = agent.toolCalls || [];

  const report = {
    summary: {
      input: input.text,
      modelUsed: turn.modelUsed || 'N/A',
      durationMs: duration,
      memoryStatus: turn.memoryStatus || 'disabled',
    },
    response: {
      text: assistant.text,
      length: assistant.text.length,
      toolCalls: toolCalls.length > 0 ? toolCalls : 'none',
      capability: agent.capability || 'general',
      skillVersion: agent.skillVersion || 'N/A',
    },
    memory: {
      used: usedMemories.map(m => ({ type: m.type, value: m.value })),
      created: createdMemories.map(m => ({ type: m.type, value: m.value })),
      usedCount: usedMemories.length,
      createdCount: createdMemories.length,
    },
    evaluation: null, // 待 LLM-Judge 填充
  };

  // 效果评估（规则判断）
  const evals = [];

  // 1. 是否回复了
  evals.push({
    dimension: '有回复',
    pass: !!assistant.text && assistant.text.length > 10,
    detail: assistant.text ? `回复长度 ${assistant.text.length} 字` : '无回复',
  });

  // 2. 是否个性化（用了记忆）
  evals.push({
    dimension: '个性化',
    pass: usedMemories.length > 0,
    detail: usedMemories.length > 0
      ? `使用了 ${usedMemories.length} 条记忆: ${usedMemories.map(m => m.value).join('; ')}`
      : '未使用记忆',
  });

  // 3. 工具调用
  evals.push({
    dimension: '工具调用',
    pass: toolCalls.length > 0,
    detail: toolCalls.length > 0
      ? `调用了 ${toolCalls.length} 个工具`
      : '未调用工具',
  });

  // 4. 响应时间
  evals.push({
    dimension: '响应速度',
    pass: duration < 15000,
    detail: `${(duration / 1000).toFixed(1)}s`,
  });

  // 5. 记忆提取
  evals.push({
    dimension: '记忆提取',
    pass: turn.memoryStatus === 'completed',
    detail: `状态: ${turn.memoryStatus}`,
  });

  report.evaluation = evals;
  return report;
}

function printReport(report) {
  console.log('\n═══════════════════════════════════════');
  console.log('  「我在」 真实流水线测试报告');
  console.log('═══════════════════════════════════════\n');

  console.log(`📝 输入: ${report.summary.input}`);
  console.log(`🤖 模型: ${report.summary.modelUsed}`);
  console.log(`⏱ 耗时: ${report.summary.durationMs}ms`);
  console.log(`💾 记忆状态: ${report.summary.memoryStatus}\n`);

  console.log('── 回复 ──');
  console.log(report.response.text);
  console.log('');

  if (report.memory.used.length > 0) {
    console.log('── 使用的记忆 ──');
    report.memory.used.forEach(m => console.log(`  [${m.type}] ${m.value}`));
    console.log('');
  }

  if (report.memory.created.length > 0) {
    console.log('── 新建立的记忆 ──');
    report.memory.created.forEach(m => console.log(`  [${m.type}] ${m.value}`));
    console.log('');
  }

  if (report.response.toolCalls !== 'none') {
    console.log('── 工具调用 ──');
    report.response.toolCalls.forEach(t => console.log(`  ${t.name}: ${t.status}`));
    console.log('');
  }

  console.log('── 效果评估 ──');
  let passCount = 0;
  for (const evalItem of report.evaluation) {
    const icon = evalItem.pass ? '✅' : '⚠️';
    console.log(`  ${icon} ${evalItem.dimension}: ${evalItem.detail}`);
    if (evalItem.pass) passCount++;
  }
  console.log(`\n📊 评分: ${passCount}/${report.evaluation.length} 通过`);
  console.log('═══════════════════════════════════════\n');
}

// ======== Fixture（使用真实 Model Adapter） ========

async function createOneShotFixture() {
  let id = 0;
  const memories = new MemoryService({
    repository: new InMemoryMemoryRepository(),
    idFactory: () => `real-test-mem-${++id}`,
  });
  const model = new RealModelAdapter();
  const tools = new ToolRegistry();
  for (const tool of createCoreTools({
    memoryService: memories,
    now: () => new Date(),
  })) {
    tools.register(tool);
  }
  const agent = new AgentOrchestrator({
    model,
    router: new CapabilityRouter(),
    skills: new SkillRegistry(),
    tools,
    policy: new PolicyEngine(),
  });
  const observer = new MemoryObserver({ model, memoryService: memories });
  const service = new ConversationService({
    repository: new InMemoryMessageRepository(),
    model,
    agent,
    memoryService: memories,
    observer,
    idFactory: () => `real-test-id-${++id}`,
    now: () => new Date(),
  });
  return { service, memories };
}

// ======== 主入口 ========

async function main() {
  const inputText = process.argv[2] || '我最近工作压力很大，不知道要不要换工作，帮我分析一下';

  const start = Date.now();
  const { service } = await createOneShotFixture();

  const turn = await service.send('test-user', {
    type: 'text',
    text: inputText,
    requestId: `one-shot-${Date.now()}`,
  });

  const duration = Date.now() - start;

  const report = generateReport({ input: { text: inputText }, turn, duration });
  printReport(report);
}

main().catch(err => {
  console.error('测试失败:', err.message);
  process.exitCode = 1;
});
