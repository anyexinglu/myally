'use strict';

const cloud = require('wx-server-sdk');
const { ConversationService, ValidationError } = require('./domain');
const { CloudBaseModelAdapter } = require('./model-adapter');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, timeout: 60000 });
const collection = cloud.database().collection('messages');

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
}

async function resolveImageUrl(fileId) {
  const result = await cloud.getTempFileURL({ fileList: [fileId] });
  const item = result.fileList && result.fileList[0];
  if (!item || item.status !== 0 || !item.tempFileURL) throw new ValidationError('image is unavailable');
  return item.tempFileURL;
}

function makeService() {
  return new ConversationService({
    repository: new CloudBaseMessageRepository(),
    model: new CloudBaseModelAdapter({
      ai: cloud.ai(),
      provider: process.env.MYALLY_MODEL_PROVIDER || 'cloudbase',
      modelName: process.env.MYALLY_MODEL_NAME || 'glm-5v-turbo',
    }),
    imageUrlResolver: resolveImageUrl,
    idFactory: () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
  });
}

function errorResponse(error) {
  if (error instanceof ValidationError) return { ok: false, code: 'VALIDATION', message: error.message };
  console.error('conversations cloud function failed', { name: error.name, message: error.message });
  return { ok: false, code: 'MODEL_UNAVAILABLE', message: '我暂时没有成功回复，但你的输入已经安全记录，可以稍后重试。' };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const service = makeService();
  try {
    let data;
    switch (event.action) {
      case 'send': data = await service.send(OPENID, event.payload || {}); break;
      case 'list': data = await service.list(OPENID, event.conversationId); break;
      default: throw new ValidationError('unknown action');
    }
    return { ok: true, data };
  } catch (error) {
    return errorResponse(error);
  }
};
