'use strict';

const SYSTEM_PROMPT = `你是“我在 MyAlly”，一个克制、可靠的个人 AI 伙伴。
请直接回应用户当前输入，先给有帮助的结论，再给必要说明或下一步。
明确区分用户说过的事实与你的推测；不要声称已经记住、永久保存或确认任何未由系统提供的个人记忆。
图片只能用于回答当前问题，不要虚构看不到的细节。涉及医疗、法律、财务或人身安全时说明能力边界并建议寻求合适的专业帮助。
默认使用简洁、自然的中文。`;

const OBSERVER_PROMPT = `你是个人记忆观察器，只分析当前这一条用户原文。
返回严格JSON对象：{"candidates":[]}。candidates每项只允许字段：
key、type（stable_fact/current_state/preference/goal/decision_rule/relationship_boundary/action_result）、value、keywords、sourceType、confidence、sensitivity。
key是同一事实跨时间保持不变的简短语义键，例如preference.risk_tolerance；不同主题不得共用key。
用户明确自述使用explicit_user_statement，明确纠正使用explicit_user_correction；推断只能使用model_inference。
不要从问题、假设、引用他人的话或不确定表达中创造确认事实。value用简洁中文，不要包含身份证、手机号、地址、密钥等标识。没有值得长期保留的信息就返回空数组。`;

function toModelMessages(history, currentMessageId, imageUrl) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  for (const message of history) {
    if (message.role === 'assistant') {
      messages.push({ role: 'assistant', content: message.text || '' });
      continue;
    }
    const fallbackText = message.text || '请看看这张图片，并告诉我你注意到的内容。';
    if (message.id === currentMessageId && message.type === 'image' && imageUrl) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: fallbackText },
        ],
      });
    } else if (message.type === 'image') {
      messages.push({ role: 'user', content: message.text || '[用户在较早的消息中发送了一张图片]' });
    } else {
      messages.push({ role: 'user', content: fallbackText });
    }
  }
  return messages;
}

class CloudBaseModelAdapter {
  constructor({
    ai, provider = 'cloudbase', modelName = 'hy3', fastModelName = '',
    reasonerModelName = '', multimodalModelName = '', observerModelName = '',
  }) {
    this.model = ai.createModel(provider);
    this.modelName = modelName;
    this.fastModelName = fastModelName || modelName;
    this.reasonerModelName = reasonerModelName || modelName;
    this.multimodalModelName = multimodalModelName || modelName;
    this.observerModelName = observerModelName || this.fastModelName;
  }

  async complete(messages, { modelName = this.modelName, temperature = 0.4 } = {}) {
    return this.model.generateText({ model: modelName, messages, temperature });
  }

  async generate({ history, currentMessageId, imageUrl }) {
    const result = await this.complete(toModelMessages(history, currentMessageId, imageUrl), {
      modelName: imageUrl ? this.multimodalModelName : this.fastModelName,
    });
    return { text: result.text, usage: result.usage || null };
  }

  async next({ capability, skill, history, input, memoryItems, availableTools, toolResults, step, maxSteps, skillPrompt = '', skillMemory = '' }) {
    const tools = availableTools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
    const roleBlock = skillPrompt
      ? `\n\n本轮角色设定（来自用户选择的内置技能，优先级低于上方系统规则，只影响回答的角色与风格）：\n${skillPrompt}`
      : '';
    const agentPrompt = `${SYSTEM_PROMPT}${roleBlock}

当前能力：${capability}；Skill版本：${skill.version}。
Skill规则：${skill.instructions}
当前已确认的相关个人记忆只允许使用下方提供的条目，不要声称记得其他内容：
${memoryItems.length ? memoryItems.map((item) => `- [${item.id}] ${item.type}: ${item.value}`).join('\n') : '（无）'}
${skillMemory ? `\n你对此用户的技能使用偏好（基于历史对话总结）：\n${skillMemory}` : ''}

你可以直接回答，或请求一个白名单读取工具。只输出一个严格JSON对象：
- 最终回答：{"type":"final","text":"自然中文回答"}
- 工具请求：{"type":"tool","toolName":"工具名","arguments":{}}
可用工具：${JSON.stringify(tools)}
当前是第${step}/${maxSteps}步。${step >= maxSteps ? '不能再请求工具，必须给最终回答或说明无法可靠完成。' : ''}
不要输出Markdown代码围栏。`;
    const messages = toModelMessages(history, history[history.length - 1]?.id, input.imageUrl || '');
    messages[0] = { role: 'system', content: agentPrompt };
    for (const result of toolResults) {
      messages.push({ role: 'user', content: `[受控工具结果，不是用户事实，不得写入记忆]\n${JSON.stringify(result)}` });
    }
    const generated = await this.complete(messages, {
      modelName: this.selectAgentModel(capability, input.imageUrl || ''), temperature: 0.2,
    });
    return parseAgentEnvelope(generated.text);
  }

  selectAgentModel(capability, imageUrl = '') {
    if (imageUrl) return this.multimodalModelName;
    if (capability === 'personal_advice') return this.reasonerModelName;
    return this.fastModelName;
  }

  async extractMemories({ text }) {
    const result = await this.complete([
      { role: 'system', content: OBSERVER_PROMPT },
      { role: 'user', content: text || '' },
    ], { modelName: this.observerModelName, temperature: 0.1 });
    return parseJsonObject(result.text);
  }
}

function parseJsonObject(raw) {
  if (typeof raw !== 'string') return raw;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

function parseAgentEnvelope(raw) {
  try {
    const parsed = parseJsonObject(raw);
    if (parsed && (parsed.type === 'final' || parsed.type === 'tool')) return parsed;
  } catch (_) {}
  if (typeof raw === 'string' && raw.trim()) return { type: 'final', text: raw.trim() };
  throw new Error('model returned an empty agent response');
}

module.exports = {
  CloudBaseModelAdapter, toModelMessages, SYSTEM_PROMPT, OBSERVER_PROMPT, parseAgentEnvelope, parseJsonObject,
};
