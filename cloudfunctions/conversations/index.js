'use strict';

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (value) => value === undefined
    ? undefined
    : JSON.parse(JSON.stringify(value));
}

const cloud = require('wx-server-sdk');
const { ConversationService, ValidationError, ContentSafetyError } = require('./domain');
const { CloudBaseModelAdapter } = require('./model-adapter');
const { AgentOrchestrator } = require('./agent');
const { MemoryService, MemoryObserver, MemoryValidationError } = require('./memory');
const { SkillRegistry, CapabilityRouter } = require('./skills');
const { ToolRegistry, PolicyEngine, createCoreTools } = require('./tools');
const { HttpSearchAdapter } = require('./search-adapter');
const { WechatContentModerator } = require('./content-safety');
const { TaskService, CloudBaseTaskRepository } = require('./task');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, timeout: 60000 });
const database = cloud.database();
const collection = database.collection('messages');
const observations = database.collection('observations');
const profileItems = database.collection('profile_items');

class CloudBaseMessageRepository {
  async add(message) {
    await collection.add({ data: message });
    return message;
  }

  async findTurnByRequest(ownerId, requestId) {
    const result = await collection.where({ ownerId, requestId }).limit(2).get();
    return result.data;
  }

  async list(ownerId, conversationId, limit = 30) {
    const result = await collection.where({ ownerId, conversationId }).limit(Math.max(limit, 50)).get();
    return result.data
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(-limit);
  }
  async deleteConversation(ownerId, conversationId) {
    const result = await collection.where({ ownerId, conversationId }).remove();
    return result.stats ? result.stats.removed : 0;
  }
}

class CloudBaseMemoryRepository {
  async addObservation(item) { await observations.add({ data: item }); return item; }
  async addProfileItem(item) { await profileItems.add({ data: item }); return item; }
  async supersede(ownerId, key, validTo) {
    const result = await profileItems.where({ ownerId, key, status: 'confirmed' }).update({
      data: { status: 'superseded', validTo, updatedAt: validTo },
    });
    return result.stats ? result.stats.updated : 0;
  }
  async list(ownerId) {
    const result = await profileItems.where({ ownerId }).limit(100).get();
    return result.data.filter((item) => !item.deletedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async listCurrent(ownerId) {
    const now = new Date().toISOString();
    const result = await profileItems.where({ ownerId, status: 'confirmed' }).limit(100).get();
    return result.data.filter((item) => !item.deletedAt && (!item.validTo || item.validTo > now));
  }
  async delete(ownerId, id, deletedAt) {
    const result = await profileItems.where({ ownerId, id }).update({
      data: { status: 'deleted', deletedAt, updatedAt: deletedAt },
    });
    return !!(result.stats && result.stats.updated);
  }
}

async function resolveImageUrl(fileId) {
  const result = await cloud.getTempFileURL({ fileList: [fileId] });
  const item = result.fileList && result.fileList[0];
  if (!item || item.status !== 0 || !item.tempFileURL) throw new ValidationError('image is unavailable');
  return item.tempFileURL;
}

function makeService() {
  const model = new CloudBaseModelAdapter({
    ai: cloud.ai(),
    provider: process.env.MYALLY_MODEL_PROVIDER || 'cloudbase',
    modelName: process.env.MYALLY_MODEL_NAME || 'hy3',
    fastModelName: process.env.MYALLY_FAST_MODEL_NAME || '',
    reasonerModelName: process.env.MYALLY_REASONER_MODEL_NAME || '',
    multimodalModelName: process.env.MYALLY_MULTIMODAL_MODEL_NAME || '',
    observerModelName: process.env.MYALLY_OBSERVER_MODEL_NAME || '',
  });
  const memoryService = new MemoryService({
    repository: new CloudBaseMemoryRepository(),
    idFactory: () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
  });
  const tools = new ToolRegistry();
  const searchAdapter = process.env.MYALLY_SEARCH_ENDPOINT ? new HttpSearchAdapter({
    endpoint: process.env.MYALLY_SEARCH_ENDPOINT,
    apiKey: process.env.MYALLY_SEARCH_API_KEY || '',
  }) : null;
  const taskService = new TaskService({
    repository: new CloudBaseTaskRepository(database),
    idFactory: () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
  });
  for (const tool of createCoreTools({ memoryService, searchAdapter, taskService })) tools.register(tool);
  const agent = new AgentOrchestrator({
    model, router: new CapabilityRouter(), skills: new SkillRegistry(),
    tools, policy: new PolicyEngine(), maxSteps: 3,
  });
  const observer = new MemoryObserver({ model, memoryService });
  return new ConversationService({
    repository: new CloudBaseMessageRepository(),
    model, agent, memoryService, observer,
    contentModerator: new WechatContentModerator({ openapi: cloud.openapi }),
    imageUrlResolver: resolveImageUrl,
    idFactory: () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
  });
}

function errorResponse(error) {
  if (error instanceof ContentSafetyError) {
    if (error.code === 'CONTENT_UNSAFE') {
      return { ok: false, code: error.code, message: '内容未通过安全检查，请调整后再试。' };
    }
    return { ok: false, code: error.code, message: '内容安全检查暂时不可用，请稍后重试。' };
  }
  if (error instanceof ValidationError || error instanceof MemoryValidationError) {
    return { ok: false, code: 'VALIDATION', message: error.message };
  }
  console.error('conversations cloud function failed', { name: error.name, message: error.message });
  const message = String(error && error.message || '');
  if (/-502005|DATABASE_COLLECTION_NOT_EXIST|database collection not exists/i.test(message)) {
    return { ok: false, code: 'SETUP_REQUIRED', message: '服务尚未完成初始化，本次消息未保存，请稍后再试。' };
  }
  return { ok: false, code: 'MODEL_UNAVAILABLE', message: '我暂时没有成功回复，请稍后在原消息上重试。' };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const service = makeService();
  try {
    if (!OPENID) throw new ValidationError('trusted user identity is unavailable');
    let data;
    switch (event.action) {
      case 'send': data = await service.send(OPENID, event.payload || {}); break;
      case 'list': data = await service.list(OPENID, event.conversationId); break;
      case 'listMemories': data = await service.listMemories(OPENID); break;
      case 'deleteMemory': data = await service.deleteMemory(OPENID, event.memoryId); break;
      case 'deleteConversation': data = await service.deleteConversation(OPENID, event.conversationId); break;
      case 'listTasks': data = await taskService.list(OPENID); break;
      case 'listPendingTasks': data = await taskService.listPending(OPENID); break;
      case 'completeTask': data = await taskService.complete(OPENID, event.taskId); break;
      case 'cancelTask': data = await taskService.cancel(OPENID, event.taskId); break;
      default: throw new ValidationError('unknown action');
    }
    return { ok: true, data };
  } catch (error) {
    return errorResponse(error);
  }
};
