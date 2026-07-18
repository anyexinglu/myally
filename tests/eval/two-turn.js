'use strict';

/**
 * Two-turn test — 验证记忆持久性
 * 第一轮建立记忆 → 第二轮验证记忆是否被使用
 */

const { ConversationService, InMemoryMessageRepository } = require('../../packages/conversation');
const { SkillRegistry, CapabilityRouter } = require('../../packages/skills');
const { ToolRegistry, PolicyEngine, createCoreTools } = require('../../packages/tools');
const { AgentOrchestrator } = require('../../packages/agent');
const { InMemoryMemoryRepository, MemoryService, MemoryObserver } = require('../../packages/memory');
const { RealModelAdapter } = require('./model-adapter');

async function createFixture(now) {
  let id = 0;
  const memories = new MemoryService({
    repository: new InMemoryMemoryRepository(),
    idFactory: () => `tt-mem-${++id}`,
  });
  const model = new RealModelAdapter();
  const tools = new ToolRegistry();
  for (const tool of createCoreTools({ memoryService: memories, now: now || (() => new Date()) })) {
    tools.register(tool);
  }
  const agent = new AgentOrchestrator({
    model, router: new CapabilityRouter(), skills: new SkillRegistry(), tools, policy: new PolicyEngine(),
  });
  const observer = new MemoryObserver({ model, memoryService: memories });
  const service = new ConversationService({
    repository: new InMemoryMessageRepository(), model, agent, memoryService: memories, observer,
    idFactory: () => `tt-id-${++id}`,
    now: now || (() => new Date()),
  });
  return { service, memories };
}

function status(ok) { return ok ? '✅' : '⚠️'; }

async function main() {
  console.log('\n═══════════════════════════════════════');
  console.log('  记忆持久性双轮测试');
  console.log('═══════════════════════════════════════\n');

  const { service, memories } = await createFixture();

  // 第一轮：用户建立记忆
  console.log('── 第一轮：建立记忆 ──');
  const turn1 = await service.send('user-a', {
    type: 'text',
    text: '我比较保守，偏好低风险的投资方式，不太能接受本金亏损。',
    requestId: `2t-${Date.now()}`,
  });
  console.log(`回复: ${turn1.assistantMessage.text.slice(0, 120)}...`);
  console.log(`记忆状态: ${turn1.memoryStatus}`);
  console.log(`创建记忆: ${(turn1.createdMemories || []).length} 条`);
  for (const m of (turn1.createdMemories || [])) {
    console.log(`  [${m.type}] ${m.value}`);
  }

  const memPass1 = turn1.memoryStatus === 'completed' && (turn1.createdMemories || []).length >= 1;
  console.log(` ${status(memPass1)} 记忆建立: ${memPass1 ? '通过' : '失败'}\n`);

  // 第二轮：同一用户，看是否能召回记忆
  console.log('── 第二轮：验证记忆召回 ──');
  const turn2 = await service.send('user-a', {
    type: 'text',
    text: '帮我推荐一个适合我的投资组合',
    requestId: `2t-${Date.now() + 1}`,
    conversationId: turn1.conversationId,
  });
  console.log(`回复: ${turn2.assistantMessage.text.slice(0, 200)}...`);
  console.log(`使用的记忆: ${(turn2.usedMemories || []).length} 条`);
  for (const m of (turn2.usedMemories || [])) {
    console.log(`  [${m.type}] ${m.value}`);
  }

  const memPass2 = (turn2.usedMemories || []).length > 0;
  const textPass2 = turn2.assistantMessage.text.includes('保守') || turn2.assistantMessage.text.includes('低风险') || turn2.assistantMessage.text.includes('本金');
  console.log(` ${status(memPass2)} 记忆召回: ${memPass2 ? '通过' : '失败'}`);
  console.log(` ${status(textPass2)} 个性化回答: ${textPass2 ? '通过（提及偏好）' : '⚠️ 未提及用户偏好'}`);

  // 汇总
  const checks = [
    { name: '记忆建立', pass: memPass1 },
    { name: '记忆召回', pass: memPass2 },
    { name: '个性化回答', pass: textPass2 },
  ];
  const passCount = checks.filter(c => c.pass).length;

  console.log(`\n── 结果汇总 ──`);
  for (const c of checks) {
    console.log(` ${status(c.pass)} ${c.name}`);
  }
  console.log(`\n📊 ${passCount}/${checks.length} 通过`);
  console.log('═══════════════════════════════════════\n');
}

main().catch(err => {
  console.error('测试失败:', err.message);
  process.exitCode = 1;
});
