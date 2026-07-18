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
  assert.equal(skills.get('personal_advice').version, '1.1.0');
  assert.match(skills.get('personal_advice').instructions, /当前输入优先/);
  assert.match(skills.get('personal_advice').instructions, /取舍/);
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

test('tool arguments must satisfy the registered JSON schema before execution', async () => {
  let executions = 0;
  const tools = new ToolRegistry();
  tools.register({
    name: 'strict_lookup', description: '严格查询', readOnly: true,
    inputSchema: {
      type: 'object', required: ['query'], additionalProperties: false,
      properties: { query: { type: 'string', minLength: 1 } },
    },
    execute: async () => { executions += 1; return { status: 'ok' }; },
  });
  const model = {
    async next(input) {
      if (!input.toolResults.length) {
        return { type: 'tool', toolName: 'strict_lookup', arguments: { query: '', unsafe: true } };
      }
      assert.equal(input.toolResults[0].status, 'denied');
      assert.equal(input.toolResults[0].code, 'INVALID_TOOL_ARGUMENTS');
      return { type: 'final', text: '参数不合法，未执行查询。' };
    },
  };
  const agent = new AgentOrchestrator({
    model, router: new CapabilityRouter(), skills: new SkillRegistry(),
    tools, policy: new PolicyEngine(),
  });
  const result = await agent.run({ ownerId: 'user-a', input: { text: '查询' }, history: [], memoryItems: [] });
  assert.equal(executions, 0);
  assert.deepEqual(result.toolCalls, [{ name: 'strict_lookup', status: 'denied' }]);
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

test('repeated identical explicit memory keeps observations but does not duplicate the profile', async () => {
  let id = 0;
  const repository = new InMemoryMemoryRepository();
  const memory = new MemoryService({ repository, idFactory: () => `dedupe-${++id}` });
  const candidate = {
    key: 'preference.risk_tolerance', type: 'preference', value: '偏好低风险方案', keywords: ['低风险'],
    sourceType: 'explicit_user_statement', confidence: 'high', sensitivity: 'low',
  };
  const makeMessage = (messageId) => ({
    id: messageId, role: 'user', text: '我偏好低风险方案',
    provenance: { source: 'user_message', memoryEligible: true },
  });

  assert.equal((await memory.recordCandidates('user-a', makeMessage('message-1'), [candidate])).length, 1);
  assert.equal((await memory.recordCandidates('user-a', makeMessage('message-2'), [candidate])).length, 0);
  assert.equal(repository.observations.length, 2);
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

test('retrieval excludes zero-relevance memories instead of injecting the complete profile', async () => {
  let id = 0;
  const repository = new InMemoryMemoryRepository();
  const memory = new MemoryService({ repository, idFactory: () => `relevance-${++id}` });
  const message = (index) => ({
    id: `msg-${index}`, role: 'user', text: `虚构偏好${index}`,
    provenance: { source: 'user_message', memoryEligible: true },
  });
  for (let index = 0; index < 10; index += 1) {
    await memory.recordCandidates('user-a', message(index), [{
      type: 'preference', value: `虚构偏好${index}`, keywords: [`偏好${index}`],
      sourceType: 'explicit_user_statement', confidence: 'high', sensitivity: 'low',
    }]);
  }
  const unrelated = await memory.retrieve('user-a', '今天上海天气如何');
  assert.equal(unrelated.items.length, 0);
  assert.equal(unrelated.context, '');
  const planning = await memory.retrieve('user-a', '结合我的情况给一个计划');
  assert.equal(planning.items.length, 8);
});

test('explicit correction closes the previous memory version and retrieves only the current value', async () => {
  let id = 0;
  let now = '2026-07-17T08:00:00.000Z';
  const repository = new InMemoryMemoryRepository();
  const memory = new MemoryService({
    repository, idFactory: () => `timeline-${++id}`, now: () => new Date(now),
  });
  const message = (messageId, text) => ({
    id: messageId, role: 'user', text,
    provenance: { source: 'user_message', memoryEligible: true },
  });
  await memory.recordCandidates('owner-a', message('old-message', '我一直偏好低风险方案'), [{
    key: 'preference.risk_tolerance', type: 'preference', value: '偏好低风险方案', keywords: ['风险方案'],
    sourceType: 'explicit_user_statement', confidence: 'high', sensitivity: 'low',
  }]);
  await memory.recordCandidates('owner-b', message('other-owner-message', '我也偏好低风险方案'), [{
    key: 'preference.risk_tolerance', type: 'preference', value: '偏好低风险方案', keywords: ['风险方案'],
    sourceType: 'explicit_user_statement', confidence: 'high', sensitivity: 'low',
  }]);
  now = '2026-07-18T09:30:00.000Z';
  await memory.recordCandidates('owner-a', message('new-message', '纠正一下，我现在愿意接受高风险方案'), [{
    key: 'preference.risk_tolerance', type: 'preference', value: '愿意接受高风险方案', keywords: ['风险方案'],
    sourceType: 'explicit_user_correction', confidence: 'high', sensitivity: 'low',
  }]);

  const history = await memory.list('owner-a');
  assert.equal(history.length, 2);
  assert.equal(history[0].status, 'superseded');
  assert.equal(history[0].validTo, '2026-07-18T09:30:00.000Z');
  assert.equal(history[1].status, 'confirmed');
  assert.equal(history[1].key, 'preference.risk_tolerance');
  const current = await memory.retrieve('owner-a', '结合我的风险方案给建议');
  assert.deepEqual(current.items.map((item) => item.value), ['愿意接受高风险方案']);
  assert.deepEqual((await memory.retrieve('owner-b', '结合我的风险方案给建议')).items.map((item) => item.value), ['偏好低风险方案']);
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
