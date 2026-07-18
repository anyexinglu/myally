'use strict';

/**
 * A/B Test Harness Bridge — Node.js CLI
 *
 * 两种模式：
 *   raw: 直接调模型API，无上下文无记忆（模拟裸模型）
 *   product: 走完整 Hermes-lite 流水线（Agent+记忆+技能+工具）
 *
 * 用法：
 *   node bridge.js raw '{"text":"提问"}'                    # 裸模型
 *   node bridge.js product '{"text":"提问","turn":1}'        # 完整产品
 *   node bridge.js product '{"text":"后续提问","turn":2,"convId":"..."}'
 */

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

// ======== 引用产品 packages ========
const { ConversationService, InMemoryMessageRepository } = require('../../packages/conversation');
const { SkillRegistry, CapabilityRouter } = require('../../packages/skills');
const { ToolRegistry, PolicyEngine, createCoreTools } = require('../../packages/tools');
const { AgentOrchestrator } = require('../../packages/agent');
const { InMemoryMemoryRepository, MemoryService, MemoryObserver } = require('../../packages/memory');

// ======== API 配置 ========

function loadApiKey() {
  try {
    const envPath = path.join(require('node:os').homedir(), '.hermes', '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const idx = t.indexOf('=');
      const k = t.slice(0, idx).trim();
      const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (k === 'DEEPSEEK_API_KEY') return { key: v, baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' };
    }
  } catch {}
  return { key: process.env.MYALLY_API_KEY || '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' };
}

function callLLM(messages, systemPrompt, temp = 0.7) {
  return new Promise((resolve, reject) => {
    const config = loadApiKey();
    if (!config.key) return reject('API Key 未配置');
    const payload = JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt || '你是一个有用的AI助手。' },
        ...messages,
      ],
      temperature: temp, max_tokens: 4096,
    });
    const url = new URL('/v1/chat/completions', config.baseUrl);
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` },
      timeout: 60000,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body).choices?.[0]?.message?.content || ''); }
        catch { reject('响应解析失败'); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject('超时'); });
    req.write(payload);
    req.end();
  });
}

const HEALTH_SYSTEM_PROMPT = `你是「我在」健康助理，用户的长期健康伙伴。

## 知识来源
- 国内：中国高血压防治指南、国家卫健委膳食指南、中国居民营养与慢性病报告
- 国际：WHO指南、美国心脏协会(AHA)指南、Mayo Clinic建议

## 行为准则
1. 优先引用权威医学指南，区分确定结论和待研究领域
2. 给出的建议必须是用户可执行的，不空谈
3. 涉及药物调整、诊断等，必须建议咨询医生
4. 使用用户提供的个人情况，让建议更有针对性

## 回答风格
简洁、具体、有依据。中文回答。`;

// ======== 模式A：裸模型 ========

async function runRaw(input) {
  const messages = [{ role: 'user', content: input.text }];
  const reply = await callLLM(messages, HEALTH_SYSTEM_PROMPT);
  return { mode: 'raw', reply, metadata: { model: loadApiKey().model } };
}

// ======== 模式B：完整产品 ========

// 全局缓存，模拟"多年使用"的记忆积累
const productState = { memories: null, service: null, convId: null };

async function getProductService() {
  if (productState.service) return productState.service;
  let id = 0;
  const mem = new MemoryService({
    repository: new InMemoryMemoryRepository(),
    idFactory: () => `ab-mem-${++id}`,
  });
  const model = {
    async next(input) {
      // 通过真实 API 驱动 Agent
      const memCtx = input.memoryItems.map(m => `[${m.type}] ${m.value}`).join('\n');
      const sysExtra = memCtx ? `\n\n## 该用户的已知信息：\n${memCtx}\n在回答时使用这些信息。` : '';
      const msgs = [];
      for (const h of (input.history || []).slice(-20)) {
        if (h.role === 'user') msgs.push({ role: 'user', content: h.text || '' });
        else if (h.role === 'assistant') msgs.push({ role: 'assistant', content: h.text || '' });
      }
      msgs.push({ role: 'user', content: input.input.text || '' });
      const reply = await callLLM(msgs, HEALTH_SYSTEM_PROMPT + sysExtra);
      return { type: 'final', text: reply };
    },
    async extractMemories({ text }) {
      const cands = [];
      if (text.includes('高血压')) cands.push({ type: 'stable_fact', value: '有高血压', keywords: ['高血压', '健康'], sourceType: 'explicit_user_statement', confidence: 'high', sensitivity: 'low' });
      if (text.includes('跑步')) cands.push({ type: 'current_state', value: '最近开始每天跑步半小时', keywords: ['跑步', '运动'], sourceType: 'explicit_user_statement', confidence: 'high', sensitivity: 'low' });
      if (text.includes('膝盖') || text.includes('不舒服')) cands.push({ type: 'current_state', value: '跑步后膝盖不舒服', keywords: ['膝盖', '跑步', '受伤'], sourceType: 'explicit_user_statement', confidence: 'high', sensitivity: 'low' });
      return { candidates: cands };
    },
  };
  const tools = new ToolRegistry();
  for (const tool of createCoreTools({ memoryService: mem, now: () => new Date() })) tools.register(tool);
  const agent = new AgentOrchestrator({ model, router: new CapabilityRouter(), skills: new SkillRegistry(), tools, policy: new PolicyEngine() });
  const observer = new MemoryObserver({ model, memoryService: mem });
  const svc = new ConversationService({
    repository: new InMemoryMessageRepository(), model, agent, memoryService: mem, observer,
    idFactory: () => `ab-id-${++id}`, now: () => new Date(),
  });
  productState.memories = mem;
  productState.service = svc;
  return svc;
}

async function runProduct(input) {
  const service = await getProductService();
  const turn = await service.send('ab-test-user', {
    type: 'text',
    text: input.text,
    requestId: `ab-${input.turn || 1}-${Date.now()}`,
    conversationId: input.convId || undefined,
  });
  if (turn.conversationId) productState.convId = turn.conversationId;

  // 同时再跑一次裸模型作为对照
  const rawReply = await runRaw(input);

  return {
    mode: 'product',
    reply: turn.assistantMessage.text,
    convId: turn.conversationId,
    usedMemories: (turn.usedMemories || []).map(m => ({ type: m.type, value: m.value })),
    createdMemories: (turn.createdMemories || []).map(m => ({ type: m.type, value: m.value })),
    memoryStatus: turn.memoryStatus,
    rawComparison: rawReply.reply,
    metadata: { model: loadApiKey().model },
  };
}

// ======== 主入口 ========

async function main() {
  const mode = process.argv[2];
  const input = JSON.parse(process.argv[3] || '{}');
  const prevResult = process.argv[4] ? JSON.parse(process.argv[4]) : null;

  let result;
  if (mode === 'raw') {
    result = await runRaw(input);
  } else if (mode === 'product') {
    if (prevResult && prevResult.convId) input.convId = prevResult.convId;
    result = await runProduct(input);
  } else {
    throw new Error('mode 必须是 raw 或 product');
  }

  process.stdout.write(JSON.stringify(result, null, 2));
}

main().catch(err => {
  process.stdout.write(JSON.stringify({ error: err.message || String(err) }));
  process.exitCode = 1;
});
