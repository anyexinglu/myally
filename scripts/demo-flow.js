'use strict';

const { EntryService, InMemoryEntryRepository } = require('../packages/domain');

async function main() {
  let id = 0;
  const app = new EntryService({
    repository: new InMemoryEntryRepository(),
    adminIds: ['caregiver-demo'],
    idFactory: () => `demo-${++id}`,
    now: () => new Date(`2026-07-16T12:00:0${id}.000Z`),
  });

  const privateText = await app.create('user-demo', {
    type: 'text', text: '今天完成了一个小程序POC', visibility: 'private',
  });
  await app.create('user-demo', {
    type: 'voice', fileId: 'cloud://demo-voice', visibility: 'shared',
    summary: '今天状态平稳，录了一段语音',
  });
  await app.create('user-demo', {
    type: 'image', fileId: 'cloud://demo-image', visibility: 'shared',
    summary: '分享了一张今日活动图片',
  });

  let intruderDenied = false;
  try { await app.listShared('not-caregiver'); } catch { intruderDenied = true; }
  const mineBeforeDelete = await app.listMine('user-demo');
  const caregiverView = await app.listShared('caregiver-demo');
  await app.remove('user-demo', privateText.id);
  const mineAfterDelete = await app.listMine('user-demo');

  console.log(JSON.stringify({
    mineTypes: mineBeforeDelete.map((x) => x.type),
    caregiverView,
    caregiverHasRawContent: caregiverView.some((x) => 'text' in x || 'fileId' in x),
    intruderDenied,
    countAfterOwnerDelete: mineAfterDelete.length,
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
