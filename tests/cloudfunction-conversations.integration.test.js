'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

class FakeQuery {
  constructor(items, filter) {
    this.items = items;
    this.filter = filter;
    this.maximum = Infinity;
  }

  limit(value) {
    this.maximum = value;
    return this;
  }

  matches(item) {
    return Object.entries(this.filter).every(([key, value]) => item[key] === value);
  }

  async get() {
    return { data: structuredClone(this.items.filter((item) => this.matches(item)).slice(0, this.maximum)) };
  }

  async update({ data }) {
    let updated = 0;
    for (const item of this.items) {
      if (!this.matches(item)) continue;
      Object.assign(item, structuredClone(data));
      updated += 1;
    }
    return { stats: { updated } };
  }
}

class FakeCollection {
  constructor(items) { this.items = items; }
  async add({ data }) { this.items.push(structuredClone(data)); return { _id: data.id }; }
  where(filter) { return new FakeQuery(this.items, filter); }
}

function loadCloudFunction() {
  const state = {
    ownerId: 'owner-a',
    collections: { messages: [], observations: [], profile_items: [] },
    modelCalls: [],
    userMessagesAtFirstAgentCall: null,
  };
  const fakeCloud = {
    DYNAMIC_CURRENT_ENV: Symbol('dynamic-current-env'),
    init() {},
    getWXContext() { return { OPENID: state.ownerId }; },
    database() {
      return {
        collection(name) {
          if (!state.collections[name]) state.collections[name] = [];
          return new FakeCollection(state.collections[name]);
        },
      };
    },
    ai() {
      return {
        createModel() {
          return {
            async generateText(input) {
              state.modelCalls.push(structuredClone(input));
              const system = String(input.messages[0] && input.messages[0].content || '');
              if (system.includes('个人记忆观察器')) {
                const userText = String(input.messages[1] && input.messages[1].content || '');
                if (userText.includes('低风险')) {
                  return { text: JSON.stringify({ candidates: [{
                    key: 'preference.risk_tolerance', type: 'preference', value: '偏好低风险方案',
                    keywords: ['低风险'], sourceType: 'explicit_user_statement',
                    confidence: 'high', sensitivity: 'low',
                  }] }) };
                }
                return { text: '{"candidates":[]}' };
              }
              if (state.userMessagesAtFirstAgentCall === null) {
                state.userMessagesAtFirstAgentCall = state.collections.messages.filter((item) => item.role === 'user').length;
              }
              const personalized = system.includes('偏好低风险方案');
              return { text: JSON.stringify({
                type: 'final',
                text: personalized ? '结合你的低风险偏好，先从小额可逆方案开始。' : '我已经收到你的说明。',
              }) };
            },
          };
        },
      };
    },
    async getTempFileURL() { return { fileList: [] }; },
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return fakeCloud;
    return originalLoad.call(this, request, parent, isMain);
  };
  const entryPath = path.resolve(__dirname, '../cloudfunctions/conversations/index.js');
  delete require.cache[entryPath];
  let cloudFunction;
  try {
    cloudFunction = require(entryPath);
  } finally {
    Module._load = originalLoad;
  }
  return { main: cloudFunction.main, state };
}

test('deployed conversations entry persists, calls the LLM, remembers, and isolates trusted owners', async () => {
  const { main, state } = loadCloudFunction();
  const first = await main({
    action: 'send',
    ownerId: 'spoofed-owner',
    payload: { type: 'text', text: '我偏好低风险方案', requestId: 'cloud-r1' },
  });

  assert.equal(first.ok, true);
  assert.equal(first.data.userMessage.ownerId, 'owner-a');
  assert.equal(first.data.assistantMessage.text, '我已经收到你的说明。');
  assert.equal(state.modelCalls[0].model, 'hy3');
  assert.equal(state.userMessagesAtFirstAgentCall, 1, 'user message must exist before the first model call');
  assert.equal(state.collections.messages.length, 2);
  assert.equal(state.collections.observations.length, 1);
  assert.equal(state.collections.profile_items.length, 1);

  const second = await main({
    action: 'send',
    payload: {
      type: 'text', text: '结合我的情况给个下一步', requestId: 'cloud-r2',
      conversationId: first.data.conversationId,
    },
  });
  assert.equal(second.ok, true);
  assert.match(second.data.assistantMessage.text, /低风险偏好/);
  assert.deepEqual(second.data.usedMemories.map((item) => item.value), ['偏好低风险方案']);
  assert.equal(state.collections.messages.length, 4);

  state.ownerId = 'owner-b';
  const otherOwnerList = await main({ action: 'list', conversationId: first.data.conversationId });
  assert.deepEqual(otherOwnerList, { ok: true, data: [] });
  const otherOwnerMemories = await main({ action: 'listMemories' });
  assert.deepEqual(otherOwnerMemories, { ok: true, data: [] });
});
