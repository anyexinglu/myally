'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EntryService,
  InMemoryEntryRepository,
  ValidationError,
  ForbiddenError,
} = require('../packages/domain');

function service(admins = ['caregiver']) {
  return new EntryService({
    repository: new InMemoryEntryRepository(),
    adminIds: admins,
    now: () => new Date('2026-07-16T12:00:00.000Z'),
    idFactory: (() => {
      let id = 0;
      return () => `entry-${++id}`;
    })(),
  });
}

test('text entry requires non-empty text', async () => {
  const app = service();
  await assert.rejects(
    () => app.create('alice', { type: 'text', text: '   ' }),
    ValidationError,
  );
});

test('voice and image entries require a cloud file id', async () => {
  const app = service();
  await assert.rejects(
    () => app.create('alice', { type: 'voice' }),
    ValidationError,
  );
  await assert.rejects(
    () => app.create('alice', { type: 'image' }),
    ValidationError,
  );
});

test('owner can create and list all own input types', async () => {
  const app = service();
  await app.create('alice', { type: 'text', text: '今天出去走了十分钟' });
  await app.create('alice', { type: 'voice', fileId: 'cloud://voice-1', durationMs: 4200 });
  await app.create('alice', { type: 'image', fileId: 'cloud://image-1' });

  const entries = await app.listMine('alice');
  assert.deepEqual(entries.map((item) => item.type), ['image', 'voice', 'text']);
  assert.ok(entries.every((item) => item.ownerId === 'alice'));
});

test('caregiver sees only explicitly shared entries and only minimal fields', async () => {
  const app = service();
  await app.create('alice', { type: 'text', text: '这条不分享', visibility: 'private' });
  await app.create('alice', {
    type: 'text',
    text: '今天精神不错，想让家人知道',
    visibility: 'shared',
    summary: '今天状态不错',
  });

  const shared = await app.listShared('caregiver');
  assert.equal(shared.length, 1);
  assert.deepEqual(Object.keys(shared[0]).sort(), [
    'createdAt', 'id', 'ownerId', 'summary', 'type',
  ]);
  assert.equal(shared[0].summary, '今天状态不错');
  assert.equal('text' in shared[0], false);
  assert.equal('fileId' in shared[0], false);
});

test('ordinary user cannot query caregiver feed', async () => {
  const app = service();
  await assert.rejects(() => app.listShared('alice'), ForbiddenError);
});

test('only owner can delete an entry', async () => {
  const app = service();
  const entry = await app.create('alice', { type: 'text', text: '待删除' });
  await assert.rejects(() => app.remove('bob', entry.id), ForbiddenError);
  assert.equal((await app.listMine('alice')).length, 1);
  await app.remove('alice', entry.id);
  assert.equal((await app.listMine('alice')).length, 0);
});

test('admin identity is server configuration, not request data', async () => {
  const app = service();
  await app.create('alice', {
    type: 'text',
    text: '授权分享',
    visibility: 'shared',
    summary: '有一条授权信息',
  });
  await assert.rejects(
    () => app.listShared('mallory', { isAdmin: true }),
    ForbiddenError,
  );
});
