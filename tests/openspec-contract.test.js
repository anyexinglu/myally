'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ConversationService, InMemoryMessageRepository } = require('../packages/conversation');
const { AgentOrchestrator } = require('../packages/agent');
const { SkillRegistry, CapabilityRouter } = require('../packages/skills');
const { ToolRegistry, PolicyEngine, createCoreTools } = require('../packages/tools');
const { InMemoryMemoryRepository, MemoryService } = require('../packages/memory');

test('same conversation id remains isolated by trusted owner', async () => {
  let id = 0;
  const repository = new InMemoryMessageRepository();
  const service = new ConversationService({
    repository, model: { generate: async () => ({ text: '已收到' }) },
    idFactory: () => `conversation-contract-${++id}`,
  });
  await service.send('owner-a', { type: 'text', text: '甲的内容', requestId: 'owner-a-request', conversationId: 'shared-id' });
  await service.send('owner-b', { type: 'text', text: '乙的内容', requestId: 'owner-b-request', conversationId: 'shared-id' });
  const ownerA = await service.list('owner-a', 'shared-id');
  const ownerB = await service.list('owner-b', 'shared-id');
  assert.equal(ownerA.length, 2);
  assert.equal(ownerB.length, 2);
  assert.match(ownerA[0].text, /甲/);
  assert.match(ownerB[0].text, /乙/);
  assert.doesNotMatch(JSON.stringify(ownerA), /乙/);
});

test('last model step cannot execute a tool whose result cannot reach a final answer', async () => {
  let modelSteps = 0;
  let executions = 0;
  const tools = new ToolRegistry();
  tools.register({
    name: 'bounded_read', description: '只读测试工具', readOnly: true,
    inputSchema: { type: 'object', additionalProperties: false },
    execute: async () => { executions += 1; return { value: executions }; },
  });
  const agent = new AgentOrchestrator({
    model: { next: async () => { modelSteps += 1; return { type: 'tool', toolName: 'bounded_read', arguments: {} }; } },
    router: new CapabilityRouter(), skills: new SkillRegistry(), tools, policy: new PolicyEngine(), maxSteps: 3,
  });
  const result = await agent.run({ ownerId: 'owner-a', input: { text: '一直查询' }, memoryItems: [] });
  assert.equal(modelSteps, 3);
  assert.equal(executions, 2);
  assert.equal(result.bounded, true);
  assert.deepEqual(result.toolCalls.at(-1), { name: 'bounded_read', status: 'denied' });
});

test('repository skills are immutable across model attempts', async () => {
  const skills = new SkillRegistry();
  const personal = skills.get('personal_advice');
  assert.throws(() => { personal.instructions = '模型改写'; }, TypeError);
  assert.notEqual(skills.get('personal_advice').instructions, '模型改写');
});

test('realtime search absence is returned to the model as unavailable', async () => {
  const tools = new ToolRegistry();
  for (const tool of createCoreTools()) tools.register(tool);
  const agent = new AgentOrchestrator({
    model: {
      async next(input) {
        if (!input.toolResults.length) return { type: 'tool', toolName: 'realtime_search', arguments: { query: '虚构新发布' } };
        assert.equal(input.toolResults[0].status, 'unavailable');
        return { type: 'final', text: '实时搜索当前不可用，因此没有声称已核验。' };
      },
    },
    router: new CapabilityRouter(), skills: new SkillRegistry(), tools, policy: new PolicyEngine(),
  });
  const result = await agent.run({ ownerId: 'owner-a', input: { text: '查最新发布' }, memoryItems: [] });
  assert.match(result.text, /不可用/);
  assert.deepEqual(result.toolCalls, [{ name: 'realtime_search', status: 'unavailable' }]);
});

test('inferred memory remains a non-retrievable observation with provenance', async () => {
  let id = 0;
  const repository = new InMemoryMemoryRepository();
  const memory = new MemoryService({
    repository, idFactory: () => `candidate-${++id}`,
    now: () => new Date('2026-07-17T10:00:00.000Z'),
  });
  const message = {
    id: 'synthetic-message', role: 'user', text: '也许可以试试早起',
    provenance: { source: 'user_message', memoryEligible: true },
  };
  const created = await memory.recordCandidates('owner-a', message, [{
    type: 'preference', value: '偏好早起', keywords: ['早起'], sourceType: 'model_inference',
    confidence: 'low', sensitivity: 'low',
  }]);
  assert.equal(created.length, 0);
  assert.equal(repository.observations.length, 1);
  assert.equal(repository.observations[0].sourceMessageId, 'synthetic-message');
  assert.equal(repository.observations[0].status, 'candidate');
  assert.equal((await memory.retrieve('owner-a', '早起')).items.length, 0);
});
