'use strict';

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (value) => value === undefined
    ? undefined
    : JSON.parse(JSON.stringify(value));
}

const cloud = require('wx-server-sdk');
const { EntryService, ValidationError, ForbiddenError, NotFoundError } = require('./domain');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const collection = cloud.database().collection('entries');

class CloudBaseEntryRepository {
  async add(entry) { const result = await collection.add({ data: entry }); return { ...entry, id: result._id || entry.id }; }
  async getById(id) { const result = await collection.where({ id }).limit(1).get(); return result.data[0] || null; }
  async listByOwner(ownerId) { const result = await collection.where({ ownerId }).orderBy('createdAt', 'desc').limit(100).get(); return result.data; }
  async listShared() { const result = await collection.where({ visibility: 'shared' }).orderBy('createdAt', 'desc').limit(100).get(); return result.data; }
  async remove(id) { await collection.where({ id }).remove(); }
}

const adminIds = () => (process.env.ADMIN_OPENIDS || '').split(',').map((x) => x.trim()).filter(Boolean);

function errorResponse(error) {
  if (error instanceof ValidationError) return { ok: false, code: 'VALIDATION', message: error.message };
  if (error instanceof ForbiddenError) return { ok: false, code: 'FORBIDDEN', message: error.message };
  if (error instanceof NotFoundError) return { ok: false, code: 'NOT_FOUND', message: error.message };
  console.error('entries cloud function failed', { name: error.name, message: error.message });
  return { ok: false, code: 'INTERNAL', message: '服务暂时不可用' };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const service = new EntryService({
    repository: new CloudBaseEntryRepository(), adminIds: adminIds(),
    idFactory: () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  });
  try {
    let data;
    switch (event.action) {
      case 'create': data = await service.create(OPENID, event.payload || {}); break;
      case 'listMine': data = await service.listMine(OPENID); break;
      case 'listShared': data = await service.listShared(OPENID); break;
      case 'remove': data = await service.remove(OPENID, event.entryId); break;
      default: throw new ValidationError('unknown action');
    }
    return { ok: true, data };
  } catch (error) { return errorResponse(error); }
};
