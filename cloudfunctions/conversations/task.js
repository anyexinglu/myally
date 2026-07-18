'use strict';

/**
 * 定时任务 — CloudBase 适配版
 */

class TaskValidationError extends Error {}

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

class CloudBaseTaskRepository {
  constructor(database) {
    this.collection = database.collection('tasks');
  }

  async add(task) {
    await this.collection.add({ data: task });
    return task;
  }

  async getById(id) {
    const result = await this.collection.doc(id).get();
    return result.data || null;
  }

  async listByOwner(ownerId) {
    const result = await this.collection.where({ ownerId }).orderBy('createdAt', 'asc').limit(100).get();
    return result.data || [];
  }

  async listPending(ownerId) {
    const result = await this.collection.where({ ownerId, status: 'pending' }).orderBy('createdAt', 'asc').limit(100).get();
    return result.data || [];
  }

  async update(id, fields) {
    await this.collection.doc(id).update({ data: { ...fields, updatedAt: new Date().toISOString() } });
    return this.getById(id);
  }

  async remove(id) {
    await this.collection.doc(id).remove();
  }
}

class TaskService {
  constructor({ repository, now = () => new Date(), idFactory }) {
    this.repository = repository;
    this.now = now;
    this.idFactory = idFactory;
  }

  async create(ownerId, input) {
    if (!nonEmpty(ownerId)) throw new TaskValidationError('ownerId is required');
    const title = typeof input?.title === 'string' ? input.title.trim() : '';
    if (!title || title.length > 200) throw new TaskValidationError('title is required');
    const task = {
      id: this.idFactory(), ownerId, title,
      description: (input.description || '').trim() || null,
      status: 'pending',
      dueAt: input.dueAt || null,
      sourceMessageId: input.sourceMessageId || null,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
      completedAt: null,
    };
    return this.repository.add(task);
  }

  async list(ownerId) { return this.repository.listByOwner(ownerId); }
  async listPending(ownerId) { return this.repository.listPending(ownerId); }
}

module.exports = { TaskService, CloudBaseTaskRepository, TaskValidationError };
