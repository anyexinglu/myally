'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

// 纯内存仿 CloudBase SDK，加载真实部署文件 cloudfunctions/ingest-feed/index.js
function loadIngestFeed({ token = 'test-token-xyz', configMissing = false, feedsMissing = false, envToken = '' } = {}) {
  const state = {
    feeds: [],
    createdCollections: [],
  };
  const fakeCollection = (items) => ({
    async add({ data }) {
      if (feedsMissing && !state.createdCollections.includes('daily_feeds')) {
        throw new Error('collection.add:fail -502005 database collection not exists. DATABASE_COLLECTION_NOT_EXIST');
      }
      const record = structuredClone(data);
      record._id = `feed-${items.length + 1}`;
      items.push(record);
      return { _id: record._id };
    },
    where(filter) {
      return {
        limit() {
          return {
            async get() {
              return { data: structuredClone(items.filter((item) => Object.entries(filter).every(([k, v]) => item[k] === v))) };
            },
          };
        },
      };
    },
    doc(id) {
      return {
        async get() {
          if (configMissing) throw new Error('document.get:fail -502005 database collection not exists');
          if (id !== 'feed_ingest_token') throw new Error('document not found');
          return { data: { _id: id, value: token } };
        },
        async update({ data }) {
          const found = items.find((item) => item._id === id);
          if (found) Object.assign(found, structuredClone(data));
          return { stats: { updated: found ? 1 : 0 } };
        },
      };
    },
  });
  const fakeCloud = {
    DYNAMIC_CURRENT_ENV: Symbol('dynamic-current-env'),
    init() {},
    getWXContext() { return { OPENID: 'ingest-bot' }; },
    database() {
      return {
        collection(name) { return fakeCollection(name === 'daily_feeds' ? state.feeds : []); },
        async createCollection(name) { state.createdCollections.push(name); return {}; },
      };
    },
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return fakeCloud;
    return originalLoad.call(this, request, parent, isMain);
  };
  const entryPath = path.resolve(__dirname, '../cloudfunctions/ingest-feed/index.js');
  delete require.cache[entryPath];
  const previousEnvToken = process.env.FEED_INGEST_TOKEN;
  if (envToken) process.env.FEED_INGEST_TOKEN = envToken;
  else delete process.env.FEED_INGEST_TOKEN;
  let cloudFunction;
  try {
    cloudFunction = require(entryPath);
  } finally {
    Module._load = originalLoad;
  }
  const restore = () => {
    if (previousEnvToken === undefined) delete process.env.FEED_INGEST_TOKEN;
    else process.env.FEED_INGEST_TOKEN = previousEnvToken;
  };
  return { main: cloudFunction.main, state, restore };
}

const validEvent = {
  feedType: 'ai-news',
  date: '2026-07-21',
  title: '测试标题：今日 AI 动态（虚构）',
  content: '# 测试内容\n这是虚构的日报正文。',
  token: 'test-token-xyz',
};

test('ingest-feed validates enum, date, required fields and content length', async () => {
  const { main, state, restore } = loadIngestFeed();
  try {
    assert.equal((await main({ ...validEvent, feedType: 'stock-tips' })).code, 'VALIDATION');
    assert.equal((await main({ ...validEvent, date: '2026/07/21' })).code, 'VALIDATION');
    assert.equal((await main({ ...validEvent, title: '  ' })).code, 'VALIDATION');
    assert.equal((await main({ ...validEvent, content: '' })).code, 'VALIDATION');
    assert.equal((await main({ ...validEvent, content: 'x'.repeat(20001) })).code, 'VALIDATION');
    assert.equal((await main({ ...validEvent, content: 'x'.repeat(20000) })).ok, true);
    assert.equal(state.feeds.length, 1);
  } finally {
    restore();
  }
});

test('ingest-feed rejects wrong token with FORBIDDEN and fails closed when unconfigured', async () => {
  const { main, state, restore } = loadIngestFeed();
  try {
    const wrong = await main({ ...validEvent, token: 'wrong-token' });
    assert.deepEqual(wrong, { ok: false, code: 'FORBIDDEN', message: 'token 无效' });
    assert.equal(state.feeds.length, 0);
  } finally {
    restore();
  }

  const unconfigured = loadIngestFeed({ configMissing: true });
  try {
    const result = await unconfigured.main(validEvent);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INTERNAL');
    assert.equal(unconfigured.state.feeds.length, 0);
  } finally {
    unconfigured.restore();
  }
});

test('ingest-feed prefers environment token over config collection', async () => {
  const { main, state, restore } = loadIngestFeed({ token: 'config-token', envToken: 'env-token' });
  try {
    const withEnvToken = await main({ ...validEvent, token: 'env-token' });
    assert.equal(withEnvToken.ok, true);
    const withConfigToken = await main({ ...validEvent, token: 'config-token' });
    assert.equal(withConfigToken.code, 'FORBIDDEN');
    assert.equal(state.feeds.length, 1);
  } finally {
    restore();
  }
});

test('ingest-feed derives scope by feedType and upserts by feedType+date', async () => {
  const { main, state, restore } = loadIngestFeed();
  try {
    const first = await main(validEvent);
    assert.equal(first.ok, true);
    assert.equal(state.feeds[0].scope, 'public');

    const sidehustle = await main({ ...validEvent, feedType: 'sidehustle', title: '虚构副业观察' });
    assert.equal(sidehustle.ok, true);
    assert.equal(state.feeds[1].scope, 'personal');

    const updated = await main({ ...validEvent, title: '新标题（虚构）' });
    assert.equal(updated.ok, true);
    assert.equal(updated.id, first.id);
    assert.equal(state.feeds.length, 2, 'same feedType+date must not duplicate');
    assert.equal(state.feeds[0].title, '新标题（虚构）');
  } finally {
    restore();
  }
});

test('ingest-feed self-heals a missing daily_feeds collection then writes', async () => {
  const { main, state, restore } = loadIngestFeed({ feedsMissing: true });
  try {
    const result = await main(validEvent);
    assert.equal(result.ok, true);
    assert.deepEqual(state.createdCollections, ['daily_feeds']);
    assert.equal(state.feeds.length, 1);
  } finally {
    restore();
  }
});
