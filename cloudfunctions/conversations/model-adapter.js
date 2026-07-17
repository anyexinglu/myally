'use strict';

const SYSTEM_PROMPT = `你是“我在 MyAlly”，一个克制、可靠的个人 AI 伙伴。
请直接回应用户当前输入，先给有帮助的结论，再给必要说明或下一步。
明确区分用户说过的事实与你的推测；不要声称已经记住、永久保存或确认任何未由系统提供的个人记忆。
图片只能用于回答当前问题，不要虚构看不到的细节。涉及医疗、法律、财务或人身安全时说明能力边界并建议寻求合适的专业帮助。
默认使用简洁、自然的中文。`;

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
  constructor({ ai, provider = 'cloudbase', modelName = 'glm-5v-turbo' }) {
    this.model = ai.createModel(provider);
    this.modelName = modelName;
  }

  async generate({ history, currentMessageId, imageUrl }) {
    const result = await this.model.generateText({
      model: this.modelName,
      messages: toModelMessages(history, currentMessageId, imageUrl),
      temperature: 0.4,
    });
    return { text: result.text, usage: result.usage || null };
  }
}

module.exports = { CloudBaseModelAdapter, toModelMessages, SYSTEM_PROMPT };
