'use strict';

function normalizeDecision(value) {
  if (typeof value === 'string' && value.trim()) return { type: 'final', text: value.trim() };
  if (!value || typeof value !== 'object') throw new Error('model returned an invalid agent decision');
  if (value.type === 'final' && typeof value.text === 'string' && value.text.trim()) {
    return { type: 'final', text: value.text.trim() };
  }
  if (value.type === 'tool' && typeof value.toolName === 'string' && value.toolName.trim()) {
    return { type: 'tool', toolName: value.toolName.trim(), arguments: value.arguments && typeof value.arguments === 'object' ? value.arguments : {} };
  }
  throw new Error('model returned an invalid agent decision');
}

class AgentOrchestrator {
  constructor({ model, router, skills, tools, policy, maxSteps = 3 }) {
    if (!model || typeof model.next !== 'function') throw new Error('agent model is required');
    this.model = model;
    this.router = router;
    this.skills = skills;
    this.tools = tools;
    this.policy = policy;
    this.maxSteps = Math.max(1, Math.min(Number(maxSteps) || 3, 3));
  }

  async run({ ownerId, input, history = [], memoryItems = [], temporary = false, skillPrompt = '' }) {
    const inputText = String(input && input.text || '');
    const capability = this.router.route(inputText);
    const skill = this.skills.get(capability) || this.skills.get('general');
    const toolResults = [];
    const toolCalls = [];

    for (let step = 1; step <= this.maxSteps; step += 1) {
      const decision = normalizeDecision(await this.model.next({
        ownerId, capability, skill, history, input, memoryItems,
        memoryContext: memoryItems.map((item) => ({ id: item.id, type: item.type, value: item.value })),
        availableTools: this.tools.list(), toolResults: structuredClone(toolResults), step, maxSteps: this.maxSteps,
        temporary, skillPrompt,
      }));
      if (decision.type === 'final') {
        return { text: decision.text, capability, skillVersion: skill.version, toolCalls, usedMemoryIds: memoryItems.map((item) => item.id) };
      }

      if (step >= this.maxSteps) {
        toolCalls.push({ name: decision.toolName, status: 'denied' });
        return {
          text: '我已达到本轮工具调用上限，最后一次工具请求没有执行；当前信息不足以可靠完成这次回答。',
          capability, skillVersion: skill.version, toolCalls,
          usedMemoryIds: memoryItems.map((item) => item.id), bounded: true,
        };
      }

      const tool = this.tools.get(decision.toolName);
      const authorization = this.policy.authorize(decision.toolName, tool, { ownerId, temporary });
      if (!authorization.allowed) {
        toolCalls.push({ name: decision.toolName, status: 'denied' });
        toolResults.push({ name: decision.toolName, status: 'denied', code: authorization.code });
      } else {
        const argumentsCheck = this.tools.validateArguments(decision.toolName, decision.arguments);
        if (!argumentsCheck.valid) {
          toolCalls.push({ name: decision.toolName, status: 'denied' });
          toolResults.push({ name: decision.toolName, status: 'denied', code: argumentsCheck.code });
          continue;
        }
        try {
          const output = await this.tools.execute(decision.toolName, decision.arguments, { ownerId, temporary, inputText });
          const status = output && output.status === 'unavailable' ? 'unavailable' : 'ok';
          toolCalls.push({ name: decision.toolName, status });
          toolResults.push({ name: decision.toolName, status, output });
        } catch (_) {
          toolCalls.push({ name: decision.toolName, status: 'failed' });
          toolResults.push({ name: decision.toolName, status: 'failed', code: 'TOOL_FAILED' });
        }
      }
    }

    return {
      text: '我已停止继续调用工具，避免无休止执行；当前信息不足以可靠完成这次回答。',
      capability, skillVersion: skill.version, toolCalls,
      usedMemoryIds: memoryItems.map((item) => item.id), bounded: true,
    };
  }
}

module.exports = { AgentOrchestrator, normalizeDecision };
