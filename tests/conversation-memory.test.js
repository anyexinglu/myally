'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ConversationService, InMemoryMessageRepository } = require('../packages/conversation');
const { SkillRegistry, CapabilityRouter } = require('../packages/skills');
const { ToolRegistry, PolicyEngine, createCoreTools } = require('../packages/tools');
const { AgentOrchestrator } = require('../packages/agent');
const { InMemoryMemoryRepository, MemoryService, MemoryObserver } = require('../packages/memory');

function fixture() {
  let id = 0;
  const memories = new MemoryService({ repository: new InMemoryMemoryRepository(), idFactory: () => `memory-${++id}` });
  const model = {
    async next(input) {
      const personal = input.memoryItems.map((item) => item.value).join('；');
      return { type: 'final', text: personal ? `结合你的情况：${personal}` : '这是不使用长期记忆的回答。' };
    },
    async extractMemories({ text }) {
      if (!text.includes('低风险')) return { candidates: [] };
      return { candidates: [{
        type: 'preference', value: '偏好低风险方案', keywords: ['低风险'],
        sourceType: 'explicit_user_statement', confidence: 'high', sensitivity: 'low',
      }] };
    },
  };
  const tools = new ToolRegistry();
  for (const tool of createCoreTools({ memoryService: memories })) tools.register(tool);
  const agent = new AgentOrchestrator({
    model, router: new CapabilityRouter(), skills: new SkillRegistry(), tools, policy: new PolicyEngine(),
  });
  const observer = new MemoryObserver({ model, memoryService: memories });
  const service = new ConversationService({
    repository: new InMemoryMessageRepository(), model, agent, memoryService: memories, observer,
    idFactory: () => `id-${++id}`, now: () => new Date(`2026-07-17T08:00:${String(id).padStart(2, '0')}.000Z`),
  });
  return { service, memories };
}

test('second turn uses first-turn memory and returns memory references', async () => {
  const { service } = fixture();
  const first = await service.send('user-a', { type: 'text', text: '我偏好低风险方案', requestId: 'r1' });
  assert.equal(first.memoryStatus, 'completed');
  const second = await service.send('user-a', {
    type: 'text', text: '给我安排下一步', requestId: 'r2', conversationId: first.conversationId,
  });
  assert.match(second.assistantMessage.text, /低风险/);
  assert.equal(second.usedMemories.length, 1);
});

test('temporary turn neither reads nor writes long-term memory', async () => {
  const { service, memories } = fixture();
  await service.send('user-a', { type: 'text', text: '我偏好低风险方案', requestId: 'r1' });
  const before = (await memories.list('user-a')).length;
  const temporary = await service.send('user-a', {
    type: 'text', text: '低风险地回答我', requestId: 'temp', temporary: true,
  });
  assert.doesNotMatch(temporary.assistantMessage.text, /偏好低风险方案/);
  assert.equal(temporary.memoryStatus, 'skipped');
  assert.equal((await memories.list('user-a')).length, before);
});
