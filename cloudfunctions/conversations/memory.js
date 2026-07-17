'use strict';

class MemoryValidationError extends Error {}
const clone = (value) => structuredClone(value);
const CONFIRMED_SOURCES = new Set(['explicit_user_statement', 'explicit_user_correction']);
const TYPES = new Set(['stable_fact', 'current_state', 'preference', 'goal', 'decision_rule', 'relationship_boundary', 'action_result']);

function normalizeCandidates(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    value = JSON.parse(cleaned);
  }
  const items = Array.isArray(value) ? value : value && Array.isArray(value.candidates) ? value.candidates : [];
  return items.map((item) => {
    const type = TYPES.has(item.type) ? item.type : item.type === 'fact' ? 'stable_fact' : null;
    const content = typeof item.value === 'string' ? item.value.trim() : '';
    if (!type || !content || content.length > 500) return null;
    return {
      type, value: content,
      keywords: Array.isArray(item.keywords) ? item.keywords.filter((x) => typeof x === 'string').slice(0, 8) : [],
      sourceType: typeof item.sourceType === 'string' ? item.sourceType : 'model_inference',
      confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'medium',
      sensitivity: ['high', 'medium', 'low'].includes(item.sensitivity) ? item.sensitivity : 'low',
    };
  }).filter(Boolean);
}

class InMemoryMemoryRepository {
  constructor() { this.observations = []; this.items = []; }
  async addObservation(item) { this.observations.push(clone(item)); return clone(item); }
  async addProfileItem(item) { this.items.push(clone(item)); return clone(item); }
  async list(ownerId) { return this.items.filter((item) => item.ownerId === ownerId && !item.deletedAt).map(clone); }
  async listCurrent(ownerId) {
    const now = new Date().toISOString();
    return this.items.filter((item) => item.ownerId === ownerId && item.status === 'confirmed' && !item.deletedAt && (!item.validTo || item.validTo > now)).map(clone);
  }
  async delete(ownerId, id, deletedAt) {
    const item = this.items.find((entry) => entry.ownerId === ownerId && entry.id === id && !entry.deletedAt);
    if (!item) return false;
    item.deletedAt = deletedAt;
    item.status = 'deleted';
    return true;
  }
}

class MemoryService {
  constructor({ repository, idFactory = () => crypto.randomUUID(), now = () => new Date(), extractorVersion = 'myally-memory-observer-v1' } = {}) {
    if (!repository) throw new MemoryValidationError('memory repository is required');
    this.repository = repository;
    this.idFactory = idFactory;
    this.now = now;
    this.extractorVersion = extractorVersion;
  }

  async recordCandidates(ownerId, message, rawCandidates) {
    if (!ownerId) throw new MemoryValidationError('ownerId is required');
    if (!message || message.role !== 'user' || message.provenance?.source !== 'user_message' || !message.provenance?.memoryEligible) {
      throw new MemoryValidationError('only original user messages can create memory');
    }
    const candidates = normalizeCandidates(rawCandidates);
    const created = [];
    for (const candidate of candidates) {
      const observedAt = this.now().toISOString();
      const status = CONFIRMED_SOURCES.has(candidate.sourceType) ? 'confirmed' : 'candidate';
      const observation = {
        id: this.idFactory(), ownerId, sourceMessageId: message.id, role: 'user', ...candidate,
        status, observedAt, extractorVersion: this.extractorVersion,
      };
      await this.repository.addObservation(observation);
      if (status === 'confirmed') {
        const profile = {
          id: this.idFactory(), ownerId, sourceMessageId: message.id, type: candidate.type,
          value: candidate.value, keywords: candidate.keywords, sourceType: candidate.sourceType,
          confidence: candidate.confidence, sensitivity: candidate.sensitivity, status,
          observedAt, validFrom: observedAt, validTo: null, deletedAt: null,
          extractorVersion: this.extractorVersion, createdAt: observedAt, updatedAt: observedAt,
        };
        await this.repository.addProfileItem(profile);
        created.push(profile);
      }
    }
    return created;
  }

  async list(ownerId) { return this.repository.list(ownerId); }

  async retrieve(ownerId, query, { maxItems = 8, maxChars = 2400, temporary = false } = {}) {
    if (temporary) return { items: [], context: '' };
    const source = await this.repository.listCurrent(ownerId);
    const needle = String(query || '').toLowerCase();
    const scored = source.map((item) => {
      let score = ['preference', 'goal', 'decision_rule'].includes(item.type) ? 0.5 : 0;
      for (const keyword of [item.value, ...(item.keywords || [])]) {
        const key = String(keyword).toLowerCase();
        if (key && (needle.includes(key) || key.includes(needle))) score += 2;
      }
      return { item, score };
    }).sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt));
    const items = [];
    let chars = 0;
    for (const { item } of scored) {
      if (items.length >= maxItems || chars + item.value.length > maxChars) break;
      items.push(item);
      chars += item.value.length;
    }
    const context = items.length
      ? `<retrieved_memory do_not_store="true">\n${items.map((item) => `- [${item.id}] ${item.type}: ${item.value}`).join('\n')}\n</retrieved_memory>`
      : '';
    return { items, context };
  }

  async delete(ownerId, id) { return this.repository.delete(ownerId, id, this.now().toISOString()); }
}

class MemoryObserver {
  constructor({ model, memoryService }) { this.model = model; this.memoryService = memoryService; }
  async observe(ownerId, userMessage, { temporary = false } = {}) {
    if (temporary) return { status: 'skipped', created: [] };
    try {
      const raw = await this.model.extractMemories({ text: userMessage.text || '', sourceMessageId: userMessage.id });
      const created = await this.memoryService.recordCandidates(ownerId, userMessage, raw);
      return { status: 'completed', created };
    } catch (_) {
      return { status: 'failed', created: [] };
    }
  }
}

module.exports = {
  MemoryValidationError, InMemoryMemoryRepository, MemoryService, MemoryObserver, normalizeCandidates,
};
