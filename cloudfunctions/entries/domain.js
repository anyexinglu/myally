'use strict';

class DomainError extends Error {}
class ValidationError extends DomainError {}
class ForbiddenError extends DomainError {}
class NotFoundError extends DomainError {}

const TYPES = new Set(['text', 'voice', 'image']);
const VISIBILITIES = new Set(['private', 'shared']);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

function normalizeCreateInput(ownerId, input, { now, idFactory }) {
  if (!nonEmpty(ownerId)) throw new ValidationError('ownerId is required');
  const type = input && input.type;
  if (!TYPES.has(type)) throw new ValidationError('type must be text, voice, or image');
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  const fileId = typeof input.fileId === 'string' ? input.fileId.trim() : '';
  if (type === 'text' && !text) throw new ValidationError('text is required');
  if (type === 'text' && text.length > 2000) throw new ValidationError('text is too long');
  if ((type === 'voice' || type === 'image') && !fileId) throw new ValidationError('cloud file id is required');
  const visibility = input.visibility || 'private';
  if (!VISIBILITIES.has(visibility)) throw new ValidationError('invalid visibility');
  const summary = typeof input.summary === 'string' ? input.summary.trim() : '';
  if (visibility === 'shared' && !summary) throw new ValidationError('shared entry requires a summary');
  if (summary.length > 120) throw new ValidationError('summary is too long');
  const createdAt = now().toISOString();
  return {
    id: idFactory(), ownerId, type, text: text || null, fileId: fileId || null,
    durationMs: Number.isFinite(input.durationMs) ? input.durationMs : null,
    visibility, summary: summary || null, createdAt, updatedAt: createdAt,
  };
}

class InMemoryEntryRepository {
  constructor() { this.items = new Map(); }
  async add(entry) { this.items.set(entry.id, structuredClone(entry)); return structuredClone(entry); }
  async getById(id) { const value = this.items.get(id); return value ? structuredClone(value) : null; }
  async listByOwner(ownerId) { return [...this.items.values()].filter((x) => x.ownerId === ownerId).map((x) => structuredClone(x)); }
  async listShared() { return [...this.items.values()].filter((x) => x.visibility === 'shared').map((x) => structuredClone(x)); }
  async remove(id) { this.items.delete(id); }
}

function newestFirst(a, b) {
  const time = b.createdAt.localeCompare(a.createdAt);
  return time || b.id.localeCompare(a.id);
}

class EntryService {
  constructor({ repository, adminIds = [], now = () => new Date(), idFactory = () => crypto.randomUUID() }) {
    if (!repository) throw new ValidationError('repository is required');
    this.repository = repository;
    this.adminIds = new Set(adminIds.filter(Boolean));
    this.now = now;
    this.idFactory = idFactory;
  }
  async create(ownerId, input) {
    return this.repository.add(normalizeCreateInput(ownerId, input || {}, { now: this.now, idFactory: this.idFactory }));
  }
  async listMine(ownerId) {
    if (!nonEmpty(ownerId)) throw new ValidationError('ownerId is required');
    return (await this.repository.listByOwner(ownerId)).sort(newestFirst);
  }
  async listShared(requesterId) {
    if (!this.adminIds.has(requesterId)) throw new ForbiddenError('caregiver access required');
    return (await this.repository.listShared()).sort(newestFirst)
      .map(({ id, ownerId, type, summary, createdAt }) => ({ id, ownerId, type, summary, createdAt }));
  }
  async remove(requesterId, entryId) {
    const entry = await this.repository.getById(entryId);
    if (!entry) throw new NotFoundError('entry not found');
    if (entry.ownerId !== requesterId) throw new ForbiddenError('only owner can delete');
    await this.repository.remove(entryId);
    return { removed: true, id: entryId };
  }
}

module.exports = { EntryService, InMemoryEntryRepository, DomainError, ValidationError, ForbiddenError, NotFoundError, normalizeCreateInput };
