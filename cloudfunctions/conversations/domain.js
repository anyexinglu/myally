'use strict';

class ConversationError extends Error {}
class ValidationError extends ConversationError {}
class ContentSafetyError extends ConversationError {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const INPUT_TYPES = new Set(['text', 'image']);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const clone = (value) => structuredClone(value);

function normalizeInput(input) {
  const type = input && input.type;
  if (!INPUT_TYPES.has(type)) throw new ValidationError('type must be text or image');
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  const fileId = typeof input.fileId === 'string' ? input.fileId.trim() : '';
  const requestId = typeof input.requestId === 'string' ? input.requestId.trim() : '';
  const conversationId = typeof input.conversationId === 'string' ? input.conversationId.trim() : '';
  const temporary = input && input.temporary === true;
  const skillPrompt = typeof input.skillPrompt === 'string' ? input.skillPrompt.trim() : '';
  const skillId = typeof input.skillId === 'string' ? input.skillId.trim() : '';
  if (type === 'text' && !text) throw new ValidationError('text is required');
  if (text.length > 2000) throw new ValidationError('text is too long');
  if (type === 'image' && !fileId) throw new ValidationError('cloud file id is required');
  if (!requestId || requestId.length > 100) throw new ValidationError('valid requestId is required');
  if (conversationId.length > 100) throw new ValidationError('conversationId is too long');
  if (skillPrompt.length > 1000) throw new ValidationError('skillPrompt is too long');
  return { type, text, fileId, requestId, conversationId, temporary, skillPrompt, skillId };
}

function makeMessage({ id, ownerId, conversationId, requestId, role, type, text, fileId, createdAt, temporary = false, agent = null }) {
  const isUser = role === 'user';
  return {
    id, ownerId, conversationId, requestId, role,
    type: isUser ? type : 'text',
    text: text || null,
    fileId: isUser && fileId ? fileId : null,
    provenance: {
      source: isUser ? 'user_message' : 'assistant_generation',
      memoryEligible: isUser,
    },
    temporary: !!temporary,
    agent: isUser ? null : agent,
    createdAt,
  };
}

class InMemoryMessageRepository {
  constructor() { this.items = []; }
  async add(message) { this.items.push(clone(message)); return clone(message); }
  async findTurnByRequest(ownerId, requestId) {
    return this.items.filter((item) => item.ownerId === ownerId && item.requestId === requestId).map(clone);
  }
  async list(ownerId, conversationId, limit = 30) {
    return this.items.filter((item) => item.ownerId === ownerId && item.conversationId === conversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(-limit).map(clone);
  }
  async deleteConversation(ownerId, conversationId) {
    const before = this.items.length;
    this.items = this.items.filter((item) => item.ownerId !== ownerId || item.conversationId !== conversationId);
    return before - this.items.length;
  }
}

class ConversationService {
  constructor({ repository, model, agent = null, memoryService = null, observer = null, contentModerator = null, imageUrlResolver = async () => '', now = () => new Date(), idFactory = () => crypto.randomUUID(), database = null }) {
    if (!repository) throw new ValidationError('repository is required');
    if (!agent && (!model || typeof model.generate !== 'function')) throw new ValidationError('model adapter or agent is required');
    this.repository = repository;
    this.model = model;
    this.agent = agent;
    this.memoryService = memoryService;
    this.observer = observer;
    this.contentModerator = contentModerator;
    this.imageUrlResolver = imageUrlResolver;
    this.now = now;
    this.idFactory = idFactory;
    this.database = database;
  }

  async ensureSafeText(text, context) {
    if (!nonEmpty(text) || !this.contentModerator) return;
    let result;
    try {
      result = await this.contentModerator.checkText(text, context);
    } catch (error) {
      console.error('content safety check failed', {
        name: error && error.name,
        code: error && (error.code || error.errCode),
        message: error && (error.message || error.errMsg),
      });
      throw new ContentSafetyError('CONTENT_SAFETY_UNAVAILABLE');
    }
    if (!result || result.allowed !== true) throw new ContentSafetyError('CONTENT_UNSAFE');
  }

  async send(ownerId, rawInput) {
    if (!nonEmpty(ownerId)) throw new ValidationError('ownerId is required');
    const input = normalizeInput(rawInput || {});
    await this.ensureSafeText(input.text, { ownerId, source: 'user' });
    const previousTurn = await this.repository.findTurnByRequest(ownerId, input.requestId);
    const existingUser = previousTurn.find((item) => item.role === 'user');
    const existingAssistant = previousTurn.find((item) => item.role === 'assistant');
    if (existingUser && existingAssistant) {
      return { conversationId: existingUser.conversationId, userMessage: existingUser, assistantMessage: existingAssistant, replayed: true };
    }

    const conversationId = existingUser?.conversationId || input.conversationId || this.idFactory();
    const userMessage = existingUser || await this.repository.add(makeMessage({
      id: this.idFactory(), ownerId, conversationId, requestId: input.requestId,
      role: 'user', type: input.type, text: input.text, fileId: input.fileId,
      temporary: input.temporary,
      createdAt: this.now().toISOString(),
    }));
    const history = await this.repository.list(ownerId, conversationId, 12);
    const imageUrl = userMessage.fileId ? await this.imageUrlResolver(userMessage.fileId) : '';
    const memoryResult = this.memoryService
      ? await this.memoryService.retrieve(ownerId, userMessage.text || '', { temporary: input.temporary })
      : { items: [], context: '' };
    // 加载技能记忆（每个用户×每个技能的私有记忆）
    let skillMemory = '';
    if (input.skillId && this.database) {
      try {
        const smCol = this.database.collection('skill_memory');
        const smDoc = await smCol.where({ ownerId, skillId: input.skillId }).limit(1).get();
        if (smDoc.data && smDoc.data.length) skillMemory = smDoc.data[0].summary || '';
      } catch (_) { /* skill_memory collection not available yet */ }
    }
    const generated = this.agent
      ? await this.agent.run({
        ownerId, input: { ...input, imageUrl }, history, memoryItems: memoryResult.items,
        temporary: input.temporary, skillPrompt: input.skillPrompt, skillMemory,
      })
      : await this.model.generate({ history, currentMessageId: userMessage.id, imageUrl });
    if (!generated || !nonEmpty(generated.text)) throw new ConversationError('model returned an empty response');
    await this.ensureSafeText(generated.text, { ownerId, source: 'assistant' });
    const assistantMessage = await this.repository.add(makeMessage({
      id: this.idFactory(), ownerId, conversationId, requestId: input.requestId,
      role: 'assistant', text: generated.text.trim(), temporary: input.temporary,
      agent: this.agent ? {
        capability: generated.capability, skillVersion: generated.skillVersion,
        toolCalls: generated.toolCalls || [], memoryRefs: generated.usedMemoryIds || [],
      } : null,
      createdAt: this.now().toISOString(),
    }));
    const memoryObservation = this.observer
      ? await this.observer.observe(ownerId, userMessage, { temporary: input.temporary })
      : { status: input.temporary ? 'skipped' : 'disabled', created: [] };
    // 更新技能记忆（提取本轮的偏好偏好，非临时消息时才持久化）
    if (input.skillId && !input.temporary && this.database) {
      try {
        const smInput = `用户说：${(userMessage.text || '').slice(0, 300)}\nAI答：${(generated.text || '').slice(0, 500)}\n
提取用户对这个技能的偏好（几句话），包括：爱问的领域、习惯的交流方式、偏好何种工具/方法。只输出一段中文总结，不要JSON。`;
        const smResult = this.model && typeof this.model.complete === 'function'
          ? await this.model.complete([{ role: 'system', content: '你是一个技能偏好观察器，根据一段对话总结用户对当前技能的偏好，便于技能下次使用。输出一段话，不编造不存在的信息。' }, { role: 'user', content: smInput }], { modelName: this.model.fastModelName || this.model.modelName, temperature: 0.1 })
          : null;
        if (smResult && smResult.text && smResult.text.length > 2) {
          const newSummary = smResult.text.trim().slice(0, 500);
          const smCol = this.database.collection('skill_memory');
          const existing = await smCol.where({ ownerId, skillId: input.skillId }).limit(1).get();
          if (existing.data && existing.data.length) {
            await smCol.doc(existing.data[0]._id).update({ data: { summary: newSummary, updatedAt: this.now().toISOString() } });
          } else {
            await smCol.add({ data: { ownerId, skillId: input.skillId, summary: newSummary, createdAt: this.now().toISOString() } });
          }
        }
      } catch (_) { /* skill memory save is best-effort */ }
    }
    return {
      conversationId, userMessage, assistantMessage, replayed: false,
      usedMemories: memoryResult.items.map((item) => ({
        id: item.id, type: item.type, value: item.value,
        observedAt: item.observedAt, sourceMessageId: item.sourceMessageId,
      })),
      memoryStatus: memoryObservation.status,
      createdMemories: memoryObservation.created.map((item) => ({ id: item.id, type: item.type, value: item.value })),
    };
  }

  async list(ownerId, conversationId) {
    if (!nonEmpty(ownerId)) throw new ValidationError('ownerId is required');
    if (!nonEmpty(conversationId)) return [];
    return this.repository.list(ownerId, conversationId, 50);
  }

  async listMemories(ownerId) {
    if (!this.memoryService) return [];
    return this.memoryService.list(ownerId);
  }

  async deleteMemory(ownerId, memoryId) {
    if (!nonEmpty(memoryId)) throw new ValidationError('memoryId is required');
    if (!this.memoryService) return false;
    return this.memoryService.delete(ownerId, memoryId);
  }

  async deleteConversation(ownerId, conversationId) {
    if (!nonEmpty(ownerId)) throw new ValidationError('ownerId is required');
    if (!nonEmpty(conversationId)) throw new ValidationError('conversationId is required');
    if (typeof this.repository.deleteConversation !== 'function') throw new ConversationError('conversation deletion is unavailable');
    return this.repository.deleteConversation(ownerId, conversationId);
  }
}

module.exports = {
  ConversationService, InMemoryMessageRepository, ConversationError, ValidationError, ContentSafetyError,
  normalizeInput, makeMessage,
};
