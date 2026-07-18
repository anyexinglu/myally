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
  if (type === 'text' && !text) throw new ValidationError('text is required');
  if (text.length > 2000) throw new ValidationError('text is too long');
  if (type === 'image' && !fileId) throw new ValidationError('cloud file id is required');
  if (!requestId || requestId.length > 100) throw new ValidationError('valid requestId is required');
  if (conversationId.length > 100) throw new ValidationError('conversationId is too long');
  return { type, text, fileId, requestId, conversationId, temporary };
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
  constructor({ repository, model, agent = null, memoryService = null, observer = null, contentModerator = null, imageUrlResolver = async () => '', now = () => new Date(), idFactory = () => crypto.randomUUID() }) {
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
  }

  async ensureSafeText(text, context) {
    if (!nonEmpty(text) || !this.contentModerator) return;
    let result;
    try {
      result = await this.contentModerator.checkText(text, context);
    } catch (_) {
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
    const generated = this.agent
      ? await this.agent.run({
        ownerId, input: { ...input, imageUrl }, history, memoryItems: memoryResult.items,
        temporary: input.temporary,
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
