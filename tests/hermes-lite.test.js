'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SkillRegistry, CapabilityRouter } = require('../packages/skills');
const { ToolRegistry, PolicyEngine, createCoreTools } = require('../packages/tools');
const { AgentOrchestrator } = require('../packages/agent');
const {
  InMemoryMemoryRepository, MemoryService, MemoryObserver,
} = require('../packages/memory');

test('router loads a versioned skill for personal advice and factual research', () => {
  const router = new CapabilityRouter();
  const skills = new SkillRegistry();
  assert.equal(router.route('结合我的情况给个低风险方案'), 'personal_advice');
  assert.equal(router.route('查一下今天最新的模型发布'), 'factual_research');
  assert.equal(skills.get('personal_advice').version, '1.0.0');
  assert.equal(skills.get('unknown'), null);
});

test('agent executes current_time once and returns the tool result to the model', async () => {
  const inputs = [];
  const model = {
    async next(input) {
      inputs.push(input);
      if (!input.toolResults.length) return { type: 'tool', toolName: 'current_time', arguments: {} };
      return { type: 'final', text: `现在是${input.toolResults[0].output.iso}` };
    },
  };
  const tools = new ToolRegistry();
  for (const tool of createCoreTools({ now: () => new Date('2026-07-17T14:00:00.000Z') })) tools.register(tool);
  const agent = new AgentOrchestrator({
    model, router: new CapabilityRouter(), skills: new SkillRegistry(),
    tools, policy: new PolicyEngine(), maxSteps: 3,
  });
  const result = await agent.run({ ownerId: 'user-a', input: { text: '现在几点？' }, history: [], memoryItems: [] });
  assert.equal(inputs.length, 2);
  assert.match(result.text, /2026-07-17T14:00:00.000Z/);
  assert.deepEqual(result.toolCalls, [{ name: 'current_time', status: 'ok' }]);
});

test('unknown write tool is denied and never executed', async () => {
  let calls = 0;
  const model = {
    async next(input) {
      calls += 1;
      if (!input.toolResults.length) return { type: 'tool', toolName: 'send_message', arguments: { text: 'x' } };
      assert.equal(input.toolResults[0].status, 'denied');
      return { type: 'final', text: '这个操作需要受控能力，当前没有执行。' };
    },
  };
  const agent = new AgentOrchestrator({
    model, router: new CapabilityRouter(), skills: new SkillRegistry(),
    tools: new ToolRegistry(), policy: new PolicyEngine(),
  });
  const result = await agent.run({ ownerId: 'user-a', input: { text: '替我发消息' }, history: [], memoryItems: [] });
  assert.equal(calls, 2);
  assert.deepEqual(result.toolCalls, [{ name: 'send_message', status: 'denied' }]);
});

test('observer confirms explicit user memory but rejects assistant-source pollution', async () => {
  let id = 0;
  const repository = new InMemoryMemoryRepository();
  const memory = new MemoryService({ repository, idFactory: () => `memory-${++id}`, now: () => new Date('2026-07-17T08:00:00.000Z') });
  const observer = new MemoryObserver({
    model: { extractMemories: async () => ({ candidates: [{
      type: 'preference', value: '偏好低风险方案', keywords: ['低风险', '方案'],
      sourceType: 'explicit_user_statement', confidence: 'high', sensitivity: 'low',
    }] }) },
    memoryService: memory,
  });
  const userMessage = {
    id: 'message-user', role: 'user', text: '我偏好低风险方案',
    provenance: { source: 'user_message', memoryEligible: true },
  };
  const observed = await observer.observe('user-a', userMessage);
  assert.equal(observed.status, 'completed');
  assert.equal((await memory.list('user-a')).length, 1);

  await assert.rejects(() => memory.recordCandidates('user-a', {
    ...userMessage, id: 'message-assistant', role: 'assistant',
    provenance: { source: 'assistant_generation', memoryEligible: false },
  }, [{ type: 'preference', value: '模型虚构偏好', sourceType: 'explicit_user_statement' }]));
  assert.equal((await memory.list('user-a')).length, 1);
});

test('retrieval is owner-scoped, bounded, deletable, and disabled in temporary mode', async () => {
  let id = 0;
  const repository = new InMemoryMemoryRepository();
  const memory = new MemoryService({ repository, idFactory: () => `id-${++id}` });
  const message = (owner, text) => ({
    id: `msg-${owner}`, role: 'user', text,
    provenance: { source: 'user_message', memoryEligible: true },
  });
  await memory.recordCandidates('user-a', message('a', '偏好低风险'), [{
    type: 'preference', value: '偏好低风险方案', keywords: ['低风险'], sourceType: 'explicit_user_statement',
  }]);
  await memory.recordCandidates('user-b', message('b', '偏好快速'), [{
    type: 'preference', value: '偏好快速方案', keywords: ['快速'], sourceType: 'explicit_user_statement',
  }]);
  const mine = await memory.retrieve('user-a', '给我一个低风险计划');
  assert.equal(mine.items.length, 1);
  assert.doesNotMatch(mine.context, /快速/);
  assert.match(mine.context, /do_not_store="true"/);
  assert.equal((await memory.retrieve('user-a', '低风险', { temporary: true })).items.length, 0);
  assert.equal(await memory.delete('user-b', mine.items[0].id), false);
  assert.equal(await memory.delete('user-a', mine.items[0].id), true);
  assert.equal((await memory.retrieve('user-a', '低风险')).items.length, 0);
});

test('temporary observer skips extraction and model failure is isolated', async () => {
  const memory = new MemoryService({ repository: new InMemoryMemoryRepository() });
  let calls = 0;
  const observer = new MemoryObserver({
    model: { extractMemories: async () => { calls += 1; throw new Error('invalid json'); } },
    memoryService: memory,
  });
  const userMessage = {
    id: 'message-user', role: 'user', text: '请记住虚构偏好',
    provenance: { source: 'user_message', memoryEligible: true },
  };
  assert.equal((await observer.observe('user-a', userMessage, { temporary: true })).status, 'skipped');
  assert.equal(calls, 0);
  assert.equal((await observer.observe('user-a', userMessage)).status, 'failed');
  assert.equal((await memory.list('user-a')).length, 0);
});
