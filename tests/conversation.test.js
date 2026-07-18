'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ConversationService, InMemoryMessageRepository, ValidationError, ContentSafetyError,
} = require('../packages/conversation');
const { CloudBaseModelAdapter, toModelMessages, parseAgentEnvelope } = require('../cloudfunctions/conversations/model-adapter');

function fixture(modelGenerate, contentModerator) {
  let id = 0;
  const repository = new InMemoryMessageRepository();
  const service = new ConversationService({
    repository,
    model: { generate: modelGenerate || (async () => ({ text: '我收到了。' })) },
    contentModerator,
    imageUrlResolver: async (fileId) => `https://files.example/${encodeURIComponent(fileId)}`,
    now: () => new Date(`2026-07-17T08:00:${String(id).padStart(2, '0')}.000Z`),
    idFactory: () => `id-${++id}`,
  });
  return { service, repository };
}

test('unsafe user text is rejected before persistence and model execution', async () => {
  let modelCalls = 0;
  const { service, repository } = fixture(async () => {
    modelCalls += 1;
    return { text: '不应执行' };
  }, {
    checkText: async (_text, context) => ({ allowed: context.source !== 'user' }),
  });

  await assert.rejects(
    () => service.send('alice', { type: 'text', text: '合成风险输入', requestId: 'unsafe-input' }),
    ContentSafetyError,
  );
  assert.equal(modelCalls, 0);
  assert.deepEqual(await repository.list('alice', '', 50), []);
});

test('unsafe generated text is rejected before assistant persistence', async () => {
  const { service, repository } = fixture(async () => ({ text: '合成风险输出' }), {
    checkText: async (_text, context) => ({ allowed: context.source !== 'assistant' }),
  });

  await assert.rejects(
    () => service.send('alice', { type: 'text', text: '正常输入', requestId: 'unsafe-output', conversationId: 'safe-conversation' }),
    ContentSafetyError,
  );
  const stored = await repository.list('alice', 'safe-conversation', 50);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].role, 'user');
});

test('conversation deletion is scoped to the trusted owner', async () => {
  const { service, repository } = fixture();
  await service.send('alice', { type: 'text', text: '甲的对话', requestId: 'delete-a', conversationId: 'shared-conversation' });
  await service.send('bob', { type: 'text', text: '乙的对话', requestId: 'delete-b', conversationId: 'shared-conversation' });

  assert.equal(await service.deleteConversation('alice', 'shared-conversation'), 2);
  assert.deepEqual(await repository.list('alice', 'shared-conversation', 50), []);
  assert.equal((await repository.list('bob', 'shared-conversation', 50)).length, 2);
});

test('text turn is stored before the model runs and assistant output is not memory eligible', async () => {
  let storedAtGeneration = [];
  const { service, repository } = fixture(async ({ history }) => {
    storedAtGeneration = history;
    return { text: '听起来这是很值得开心的一刻。' };
  });
  const turn = await service.send('alice', { type: 'text', text: '项目上线了', requestId: 'request-1' });

  assert.equal(storedAtGeneration.length, 1);
  assert.equal(storedAtGeneration[0].provenance.source, 'user_message');
  assert.equal(turn.userMessage.provenance.memoryEligible, true);
  assert.equal(turn.assistantMessage.provenance.memoryEligible, false);
  assert.equal((await repository.list('alice', turn.conversationId)).length, 2);
});

test('image turn resolves a server-side URL and reaches the model as multimodal content', async () => {
  let modelInput;
  const { service } = fixture(async (input) => { modelInput = input; return { text: '图中是一张项目进度截图。' }; });
  const turn = await service.send('alice', {
    type: 'image', text: '帮我看看这张图', fileId: 'cloud://private/image.jpg', requestId: 'request-image',
  });
  const messages = toModelMessages(modelInput.history, modelInput.currentMessageId, modelInput.imageUrl);
  const current = messages[messages.length - 1];

  assert.equal(turn.userMessage.fileId, 'cloud://private/image.jpg');
  assert.equal(current.content[0].type, 'image_url');
  assert.match(current.content[0].image_url.url, /^https:\/\/files\.example\//);
  assert.equal(current.content[1].text, '帮我看看这张图');
});

test('same request id replays one completed turn without calling the model twice', async () => {
  let calls = 0;
  const { service } = fixture(async () => { calls += 1; return { text: '唯一回复' }; });
  const input = { type: 'text', text: '不要重复记录', requestId: 'request-same' };
  const first = await service.send('alice', input);
  const second = await service.send('alice', input);

  assert.equal(calls, 1);
  assert.equal(second.replayed, true);
  assert.equal(second.assistantMessage.id, first.assistantMessage.id);
});

test('failed generation keeps one user message and retry does not duplicate it', async () => {
  let calls = 0;
  const { service, repository } = fixture(async () => {
    calls += 1;
    if (calls === 1) throw new Error('temporary model failure');
    return { text: '重试成功' };
  });
  const input = { type: 'text', text: '请回复我', requestId: 'request-retry' };
  await assert.rejects(() => service.send('alice', input));
  assert.equal((await repository.findTurnByRequest('alice', input.requestId)).length, 1);
  const turn = await service.send('alice', input);
  assert.equal(turn.assistantMessage.text, '重试成功');
  assert.equal((await repository.findTurnByRequest('alice', input.requestId)).length, 2);
});

test('invalid text and missing image file are rejected', async () => {
  const { service } = fixture();
  await assert.rejects(() => service.send('alice', { type: 'text', text: '', requestId: 'r1' }), ValidationError);
  await assert.rejects(() => service.send('alice', { type: 'image', requestId: 'r2' }), ValidationError);
});

test('agent envelope accepts strict JSON and degrades plain model text to a final answer', () => {
  assert.deepEqual(parseAgentEnvelope('{"type":"tool","toolName":"current_time","arguments":{}}'), {
    type: 'tool', toolName: 'current_time', arguments: {},
  });
  assert.deepEqual(parseAgentEnvelope('直接回答'), { type: 'final', text: '直接回答' });
});

test('CloudBase model adapter routes fast, reasoner, multimodal, and observer workloads independently', async () => {
  const calls = [];
  const ai = {
    createModel(provider) {
      assert.equal(provider, 'cloudbase');
      return {
        async generateText(input) {
          calls.push(input.model);
          return { text: input.messages[0].content.includes('记忆观察器')
            ? '{"candidates":[]}'
            : '{"type":"final","text":"路由完成"}' };
        },
      };
    },
  };
  const adapter = new CloudBaseModelAdapter({
    ai, modelName: 'base-model', fastModelName: 'fast-model',
    reasonerModelName: 'reasoner-model', multimodalModelName: 'vision-model',
    observerModelName: 'observer-model',
  });
  const common = {
    skill: { version: '1.0.0', instructions: '测试' }, history: [], memoryItems: [],
    availableTools: [], toolResults: [], step: 1, maxSteps: 3,
  };
  await adapter.next({ ...common, capability: 'general', input: { text: '你好' } });
  await adapter.next({ ...common, capability: 'personal_advice', input: { text: '怎么选' } });
  await adapter.next({ ...common, capability: 'general', input: { text: '看图', imageUrl: 'https://files.example/image.jpg' } });
  await adapter.extractMemories({ text: '虚构偏好' });
  assert.deepEqual(calls, ['fast-model', 'reasoner-model', 'vision-model', 'observer-model']);
});
