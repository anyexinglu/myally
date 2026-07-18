'use strict';

/**
 * Task — 定时任务/行动领域模型
 *
 * 核心逻辑：用户输入 → Agent 识别行动意图 → 创建 Task → 展示 → 完成反馈
 */

class TaskError extends Error {}
class ValidationError extends TaskError {}

const STATUSES = new Set(['pending', 'completed', 'cancelled']);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

function normalizeCreateInput(ownerId, input, { now, idFactory }) {
  if (!nonEmpty(ownerId)) throw new ValidationError('ownerId is required');
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 200) throw new ValidationError('title is required (max 200 chars)');
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const dueAt = input.dueAt || null;
  const sourceMessageId = typeof input.sourceMessageId === 'string' ? input.sourceMessageId.trim() : '';
  const createdAt = now().toISOString();
  return {
    id: idFactory(), ownerId, title, description: description || null,
    status: 'pending', dueAt, sourceMessageId: sourceMessageId || null,
    createdAt, updatedAt: createdAt, completedAt: null,
  };
}

class InMemoryTaskRepository {
  constructor() { this.items = new Map(); }
  async add(task) { this.items.set(task.id, structuredClone(task)); return structuredClone(task); }
  async getById(id) { const v = this.items.get(id); return v ? structuredClone(v) : null; }
  async listByOwner(ownerId) {
    return [...this.items.values()]
      .filter(x => x.ownerId === ownerId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
  async listPending(ownerId) {
    return this.listByOwner(ownerId).then(all => all.filter(x => x.status === 'pending'));
  }
  async update(id, fields) {
    const task = this.items.get(id);
    if (!task) return null;
    Object.assign(task, fields, { updatedAt: new Date().toISOString() });
    return structuredClone(task);
  }
  async remove(id) { this.items.delete(id); }
}

class TaskService {
  constructor({ repository, now = () => new Date(), idFactory = () => crypto.randomUUID() }) {
    if (!repository) throw new ValidationError('repository is required');
    this.repository = repository;
    this.now = now;
    this.idFactory = idFactory;
  }

  async create(ownerId, input) {
    const task = normalizeCreateInput(ownerId, input || {}, { now: this.now, idFactory: this.idFactory });
    return this.repository.add(task);
  }

  async list(ownerId) { return this.repository.listByOwner(ownerId); }
  async listPending(ownerId) { return this.repository.listPending(ownerId); }

  async complete(requesterId, taskId) {
    const task = await this.repository.getById(taskId);
    if (!task) throw new ValidationError('task not found');
    if (task.ownerId !== requesterId) throw new ValidationError('only owner can complete');
    return this.repository.update(taskId, { status: 'completed', completedAt: this.now().toISOString() });
  }

  async cancel(requesterId, taskId) {
    const task = await this.repository.getById(taskId);
    if (!task) throw new ValidationError('task not found');
    if (task.ownerId !== requesterId) throw new ValidationError('only owner can cancel');
    return this.repository.update(taskId, { status: 'cancelled' });
  }
}

module.exports = { TaskService, InMemoryTaskRepository, TaskError, ValidationError, normalizeCreateInput };
