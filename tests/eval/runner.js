'use strict';

/**
 * Runner — 加载YAML场景 → 调用ConversationService → 收集结果 → 评估
 *
 * 用法：
 *   node tests/eval/runner.js                    # 跑全部场景
 *   node tests/eval/runner.js --scenario basic    # 跑单个场景
 */

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const { ConversationService, InMemoryMessageRepository } = require('../../packages/conversation');
const { SkillRegistry, CapabilityRouter } = require('../../packages/skills');
const { ToolRegistry, PolicyEngine, createCoreTools } = require('../../packages/tools');
const { AgentOrchestrator } = require('../../packages/agent');
const { InMemoryMemoryRepository, MemoryService, MemoryObserver } = require('../../packages/memory');
const { evaluateStep, evaluateScenario } = require('./evaluator');
const { printReport, appendHistory } = require('./report');

const SCENARIOS_DIR = path.join(__dirname, 'scenarios');

// -------- Model: Fake Model（模拟记忆提取 + 记忆感知回答） --------
function createFakeModel() {
  let id = 0;
  return {
    async next(input) {
      const context = input.memoryItems.map((item) => item.value).join('；');
      const personal = context ? `结合你的情况：${context}。` : '';

      // 工具调用逻辑
      if (/现在几点|时间/.test(input.input.text) && !input.toolResults.length) {
        return { type: 'tool', toolName: 'current_time', arguments: {} };
      }
      if (input.toolResults.length) {
        return { type: 'final', text: `工具核验时间：${input.toolResults[0].output.iso}` };
      }

      // 正常回答：有记忆就个性化
      if (personal) {
        return { type: 'final', text: `${personal}关于低风险投资，我建议你考虑债券基金和大额存单，这些方向波动小、适合长期持有。` };
      }
      return { type: 'final', text: '这是一个通用回答。你有什么具体问题需要讨论吗？' };
    },
    async extractMemories({ text }) {
      // 提取记忆：低风险偏好 → 建立记忆
      const candidates = [];
      if (text.includes('低风险') || text.includes('保守')) {
        candidates.push({
          type: 'preference', value: '偏好低风险投资方案', keywords: ['低风险', '投资'],
          sourceType: 'explicit_user_statement', confidence: 'high', sensitivity: 'low',
        });
      }
      if (text.includes('体重') || text.includes('减重') || text.includes('跑步')) {
        candidates.push({
          type: 'goal', value: '半年内减重到60公斤，每天跑步半小时', keywords: ['减重', '跑步', '健康'],
          sourceType: 'explicit_user_statement', confidence: 'high', sensitivity: 'low',
        });
      }
      if (text.includes('房贷') || text.includes('月供')) {
        candidates.push({
          type: 'stable_fact', value: '每月有房贷1万元', keywords: ['房贷', '月供'],
          sourceType: 'explicit_user_statement', confidence: 'high', sensitivity: 'low',
        });
      }
      return { candidates };
    },
  };
}

// -------- Fixture（与现有测试一致） --------
function createFixture() {
  let id = 0;
  const memories = new MemoryService({
    repository: new InMemoryMemoryRepository(),
    idFactory: () => `eval-memory-${++id}`,
  });
  const model = createFakeModel();
  const tools = new ToolRegistry();
  for (const tool of createCoreTools({ memoryService: memories, now: () => new Date('2026-07-18T12:00:00.000Z') })) {
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
    idFactory: () => `eval-id-${++id}`,
    now: () => new Date(`2026-07-18T12:00:${String(id).padStart(2, '0')}.000Z`),
  });
  return { service, memories };
}

// -------- 加载场景 --------
function loadScenarios(filter) {
  const files = fs.readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith('.yaml'));
  const all = files.map((f) => {
    const doc = yaml.load(fs.readFileSync(path.join(SCENARIOS_DIR, f), 'utf8'));
    return { file: f, ...doc };
  });

  if (filter) {
    const keyword = filter.toLowerCase();
    return all.filter((s) => s.name.toLowerCase().includes(keyword) || s.file.toLowerCase().includes(keyword));
  }
  return all;
}

// -------- 执行场景 --------
async function runScenario(scenario) {
  const { service } = createFixture();
  const conversations = {}; // ownerId → conversationId
  const results = [];

  for (const [idx, step] of scenario.steps.entries()) {
    const input = step.input;

    // 处理 @prev 和 @new 标记
    if (input.conversationId === '@prev') {
      input.conversationId = conversations[input.ownerId] || undefined;
    }
    if (input.conversationId === '@new') {
      input.conversationId = undefined;
    }

    try {
      const turn = await service.send(input.ownerId, {
        type: input.type,
        text: input.text,
        requestId: input.requestId || `eval-step-${idx}-${Date.now()}`,
        conversationId: input.conversationId,
        temporary: input.temporary || false,
      });
      // 记录 conversationId 供后续步骤使用
      conversations[input.ownerId] = turn.conversationId;

      const evalResult = evaluateStep(turn, step.expect || {});
      results.push({ step: idx + 1, turn, evalResult });
    } catch (err) {
      results.push({
        step: idx + 1,
        error: err.message,
        evalResult: { score: 0, checks: [{ key: 'execution', pass: false, message: err.message }] },
      });
    }
  }

  const summary = evaluateScenario(results);
  return { scenario: scenario.name, results, summary };
}

// -------- 主入口 --------
async function main() {
  const args = process.argv.slice(2);
  const filterIdx = args.indexOf('--scenario');
  const filter = filterIdx >= 0 ? args[filterIdx + 1] : null;

  const scenarios = loadScenarios(filter);
  if (scenarios.length === 0) {
    console.log(`没有找到匹配的场景${filter ? `（过滤词: ${filter}）` : ''}`);
    process.exit(1);
  }

  console.log(`\n🔍 「我在」评测框架 — 共 ${scenarios.length} 个场景\n`);

  const allResults = [];
  for (const scenario of scenarios) {
    console.log(`▶ 运行场景: ${scenario.name}`);
    try {
      const result = await runScenario(scenario);
      allResults.push(result);
      printReport(result);
    } catch (err) {
      console.error(`  ❌ 场景执行失败: ${err.message}`);
      allResults.push({ scenario: scenario.name, error: err.message });
    }
  }

  // 汇总
  const passed = allResults.filter((r) => r.summary && r.summary.allPass);
  console.log(`\n📊 汇总: ${passed.length}/${allResults.length} 通过`);

  // 追加历史
  const historyEntry = {
    date: new Date().toISOString().slice(0, 10),
    version: process.env.npm_package_version || 'dev',
    scenarios: allResults.map((r) => ({
      name: r.scenario,
      pass: r.summary ? r.summary.allPass : false,
      score: r.summary ? r.summary.avgScore.toFixed(2) : '0.00',
      steps: r.summary ? r.summary.stepCount : 0,
    })),
    totalPass: passed.length,
    totalScenarios: allResults.length,
  };

  appendHistory(historyEntry);
  console.log('');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exitCode = 1;
});
