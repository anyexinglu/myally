'use strict';

// ingest-feed：接收外部系统（本机分身）每日生成的频道内容，写入 daily_feeds 集合。
//
// token 校验双通道（token 绝不硬编码进代码/仓库）：
//   1. 优先读环境变量 FEED_INGEST_TOKEN（可在 CloudBase 控制台 → 云函数 → 配置中设置）；
//   2. 微信开发者工具 CLI 的 functions deploy 不支持设置环境变量，因此默认走回退通道：
//      读 config 集合中 _id='feed_ingest_token' 文档的 value 字段。
//      初始化方式（一次性手动）：CloudBase 控制台 → 数据库 → 新建 config 集合（保持默认全拒权限）
//      → 添加文档 { _id: 'feed_ingest_token', value: '<随机长串>' }。
//   3. 两个通道都未配置时关闭式失败（INTERNAL），不放行任何写入。

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (value) => value === undefined
    ? undefined
    : JSON.parse(JSON.stringify(value));
}

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const FEED_SCOPES = {
  'ai-news': 'public',
  parenting: 'public',
  sidehustle: 'personal',
};
const MAX_CONTENT_LENGTH = 20000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FEEDS_COLLECTION = 'daily_feeds';

function validationError(message) {
  return { ok: false, code: 'VALIDATION', message };
}

async function resolveExpectedToken() {
  const fromEnv = (process.env.FEED_INGEST_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const result = await db.collection('config').doc('feed_ingest_token').get();
    const value = result && result.data && String(result.data.value || '').trim();
    return value || '';
  } catch (error) {
    // config 集合不存在或文档缺失一律按“未配置”处理，关闭式失败。
    return '';
  }
}

function isCollectionMissing(error) {
  const message = String((error && error.message) || '');
  return message.includes('-502005') || message.includes('DATABASE_COLLECTION_NOT_EXIST') || message.includes('collection not exists');
}

async function upsertFeed(record) {
  const collection = db.collection(FEEDS_COLLECTION);
  const existing = await collection.where({ feedType: record.feedType, date: record.date }).limit(1).get();
  const found = existing.data && existing.data[0];
  if (found && found._id) {
    await collection.doc(found._id).update({ data: record });
    return found._id;
  }
  const added = await collection.add({ data: record });
  return added._id;
}

async function upsertFeedWithSelfHealing(record) {
  try {
    return await upsertFeed(record);
  } catch (error) {
    if (!isCollectionMissing(error)) throw error;
    // daily_feeds 首次使用前不存在时自动创建（等价于控制台手动建集合），再重试一次。
    await db.createCollection(FEEDS_COLLECTION);
    return upsertFeed(record);
  }
}

exports.main = async (event) => {
  try {
    const { feedType, date, title, content, token } = event || {};
    if (!FEED_SCOPES[feedType]) return validationError('feedType 必须是 ai-news / parenting / sidehustle 之一');
    if (!DATE_PATTERN.test(String(date || ''))) return validationError('date 必须是 YYYY-MM-DD 格式');
    if (typeof title !== 'string' || !title.trim()) return validationError('title 不能为空');
    if (typeof content !== 'string' || !content.trim()) return validationError('content 不能为空');
    if (content.length > MAX_CONTENT_LENGTH) return validationError(`content 不能超过 ${MAX_CONTENT_LENGTH} 字符`);

    const expectedToken = await resolveExpectedToken();
    if (!expectedToken) return { ok: false, code: 'INTERNAL', message: 'ingest token 未配置' };
    if (String(token || '') !== expectedToken) return { ok: false, code: 'FORBIDDEN', message: 'token 无效' };

    const record = {
      feedType,
      date,
      title: title.trim(),
      content,
      scope: FEED_SCOPES[feedType],
      createdAt: new Date().toISOString(),
    };
    const id = await upsertFeedWithSelfHealing(record);
    return { ok: true, id };
  } catch (error) {
    console.error('ingest-feed cloud function failed', { name: error.name, message: error.message });
    return { ok: false, code: 'INTERNAL', message: '服务暂时不可用' };
  }
};
