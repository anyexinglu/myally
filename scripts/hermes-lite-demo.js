'use strict';

const { ConversationService, InMemoryMessageRepository } = require('../packages/conversation');
const { SkillRegistry, CapabilityRouter } = require('../packages/skills');
const { ToolRegistry, PolicyEngine, createCoreTools } = require('../packages/tools');
const { AgentOrchestrator } = require('../packages/agent');
const { InMemoryMemoryRepository, MemoryService, MemoryObserver } = require('../packages/memory');

async function run() {
  let id = 0;
  const memory = new MemoryService({ repository: new InMemoryMemoryRepository(), idFactory: () => `memory-${++id}` });
  const model = {
    async next(input) {
      if (/现在几点/.test(input.input.text) && !input.toolResults.length) {
        return { type: 'tool', toolName: 'current_time', arguments: {} };
      }
      if (input.toolResults.length) return { type: 'final', text: `工具核验时间：${input.toolResults[0].output.iso}` };
      const context = input.memoryItems.map((item) => item.value).join('；');
      return { type: 'final', text: context ? `按你的已确认约束执行：${context}` : '本轮没有使用长期记忆。' };
    },
    async extractMemories({ text }) {
      return text.includes('低风险') ? { candidates: [{
        type: 'preference', value: '偏好低风险方案', keywords: ['低风险'],
        sourceType: 'explicit_user_statement', confidence: 'high', sensitivity: 'low',
      }] } : { candidates: [] };
    },
  };
  const tools = new ToolRegistry();
  for (const tool of createCoreTools({ memoryService: memory, now: () => new Date('2026-07-17T14:00:00.000Z') })) tools.register(tool);
  const agent = new AgentOrchestrator({
    model, router: new CapabilityRouter(), skills: new SkillRegistry(), tools, policy: new PolicyEngine(),
  });
  const service = new ConversationService({
    repository: new InMemoryMessageRepository(), model, agent, memoryService: memory,
    observer: new MemoryObserver({ model, memoryService: memory }), idFactory: () => `id-${++id}`,
  });

  const first = await service.send('synthetic-user-a', { type: 'text', text: '我偏好低风险方案', requestId: 'demo-1' });
  const second = await service.send('synthetic-user-a', {
    type: 'text', text: '给我下一步计划', requestId: 'demo-2', conversationId: first.conversationId,
  });
  const toolTurn = await service.send('synthetic-user-a', {
    type: 'text', text: '现在几点？', requestId: 'demo-3', conversationId: first.conversationId,
  });
  const temporary = await service.send('synthetic-user-a', {
    type: 'text', text: '临时给我一个低风险回答', requestId: 'demo-temp', temporary: true,
  });
  const otherAccount = await service.listMemories('synthetic-user-b');
  const remembered = await service.listMemories('synthetic-user-a');
  await service.deleteMemory('synthetic-user-a', remembered[0].id);
  const afterDelete = await memory.retrieve('synthetic-user-a', '低风险');

  console.log(JSON.stringify({
    firstTurnMemoryStatus: first.memoryStatus,
    secondTurnReply: second.assistantMessage.text,
    secondTurnMemoryRefs: second.usedMemories.map((item) => item.id),
    toolTurnReply: toolTurn.assistantMessage.text,
    toolCalls: toolTurn.assistantMessage.agent.toolCalls,
    temporaryMemoryStatus: temporary.memoryStatus,
    temporaryUsedMemories: temporary.usedMemories.length,
    otherAccountMemories: otherAccount.length,
    memoriesAfterDelete: afterDelete.items.length,
  }, null, 2));
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
