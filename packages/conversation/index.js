'use strict';

class ConversationError extends Error {}
class ValidationError extends ConversationError {}

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
  if (type === 'text' && !text) throw new ValidationError('text is required');
  if (text.length > 2000) throw new ValidationError('text is too long');
  if (type === 'image' && !fileId) throw new ValidationError('cloud file id is required');
  if (!requestId || requestId.length > 100) throw new ValidationError('valid requestId is required');
  if (conversationId.length > 100) throw new ValidationError('conversationId is too long');
  return { type, text, fileId, requestId, conversationId };
}

function makeMessage({ id, ownerId, conversationId, requestId, role, type, text, fileId, createdAt }) {
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
}

class ConversationService {
  constructor({ repository, model, imageUrlResolver = async () => '', now = () => new Date(), idFactory = () => crypto.randomUUID() }) {
    if (!repository) throw new ValidationError('repository is required');
    if (!model || typeof model.generate !== 'function') throw new ValidationError('model adapter is required');
    this.repository = repository;
    this.model = model;
    this.imageUrlResolver = imageUrlResolver;
    this.now = now;
    this.idFactory = idFactory;
  }

  async send(ownerId, rawInput) {
    if (!nonEmpty(ownerId)) throw new ValidationError('ownerId is required');
    const input = normalizeInput(rawInput || {});
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
      createdAt: this.now().toISOString(),
    }));
    const history = await this.repository.list(ownerId, conversationId, 12);
    const imageUrl = userMessage.fileId ? await this.imageUrlResolver(userMessage.fileId) : '';
    const generated = await this.model.generate({ history, currentMessageId: userMessage.id, imageUrl });
    if (!generated || !nonEmpty(generated.text)) throw new ConversationError('model returned an empty response');
    const assistantMessage = await this.repository.add(makeMessage({
      id: this.idFactory(), ownerId, conversationId, requestId: input.requestId,
      role: 'assistant', text: generated.text.trim(), createdAt: this.now().toISOString(),
    }));
    return { conversationId, userMessage, assistantMessage, replayed: false };
  }

  async list(ownerId, conversationId) {
    if (!nonEmpty(ownerId)) throw new ValidationError('ownerId is required');
    if (!nonEmpty(conversationId)) return [];
    return this.repository.list(ownerId, conversationId, 50);
  }
}

module.exports = {
  ConversationService, InMemoryMessageRepository, ConversationError, ValidationError,
  normalizeInput, makeMessage,
};
