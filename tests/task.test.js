'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TaskService, InMemoryTaskRepository, ValidationError } = require('../packages/task');

function service() {
  let id = 0;
  return new TaskService({
    repository: new InMemoryTaskRepository(),
    now: () => new Date('2026-07-19T08:00:00.000Z'),
    idFactory: () => `task-${++id}`,
  });
}

test('create task requires title', async () => {
  const app = service();
  await assert.rejects(() => app.create('alice', { title: '' }), ValidationError);
  await assert.rejects(() => app.create('alice', {}), ValidationError);
});

test('create and list tasks', async () => {
  const app = service();
  const t1 = await app.create('alice', { title: '去超市买牛奶', description: '记得买全脂的' });
  const t2 = await app.create('alice', { title: '回复邮件' });
  assert.equal(t1.title, '去超市买牛奶');
  assert.equal(t2.status, 'pending');
  const all = await app.list('alice');
  assert.equal(all.length, 2);
});

test('tasks are isolated by owner', async () => {
  const app = service();
  await app.create('alice', { title: 'Alice的任务' });
  await app.create('bob', { title: 'Bob的任务' });
  assert.equal((await app.list('alice')).length, 1);
  assert.equal((await app.list('bob')).length, 1);
});

test('complete and cancel tasks', async () => {
  const app = service();
  const task = await app.create('alice', { title: '需要完成的任务' });
  await app.complete('alice', task.id);
  const completed = await app.repository.getById(task.id);
  assert.equal(completed.status, 'completed');
  assert.ok(completed.completedAt);
  await app.cancel('alice', task.id);
  const cancelled = await app.repository.getById(task.id);
  assert.equal(cancelled.status, 'cancelled');
});

test('only owner can complete', async () => {
  const app = service();
  const task = await app.create('alice', { title: '私密任务' });
  await assert.rejects(() => app.complete('bob', task.id), ValidationError);
});

test('list pending returns only pending tasks', async () => {
  const app = service();
  const t1 = await app.create('alice', { title: '待办1' });
  const t2 = await app.create('alice', { title: '待办2' });
  await app.complete('alice', t1.id);
  const pending = await app.listPending('alice');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, t2.id);
});
