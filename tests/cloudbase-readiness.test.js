'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'cloudbase/schema.json'), 'utf8'));

test('conversations declares the WeChat content-safety OpenAPI permission', () => {
  const config = JSON.parse(fs.readFileSync(
    path.join(root, 'cloudfunctions/conversations/config.json'),
    'utf8',
  ));
  assert.ok(config.permissions?.openapi?.includes('security.msgSecCheck'));
});

test('CloudBase schema declares the complete POC data and function surface', () => {
  assert.deepEqual(schema.collections.map((item) => item.name), [
    'entries', 'messages', 'observations', 'profile_items', 'daily_feeds', 'config', 'tasks',
  ]);
  assert.deepEqual(schema.cloudFunctions, ['entries', 'conversations', 'asr', 'ingest-feed']);
  assert.equal(schema.cloudFunctionConfig.conversations.timeoutSeconds, 60);
  assert.ok(schema.cloudFunctionConfig.conversations.timeoutSeconds > schema.cloudFunctionConfig.entries.timeoutSeconds);
  assert.deepEqual(schema.conversationDefaults, { provider: 'cloudbase', model: 'hy3' });
  for (const collection of schema.collections) {
    if (collection.name === 'daily_feeds') {
      // 小程序端任何用户可读、写仅云函数/控制台（控制台手动设置一次安全规则）
      assert.equal(collection.clientAccess, 'read-only');
    } else {
      assert.equal(collection.clientAccess, 'deny');
    }
    if (collection.name !== 'config') assert.ok(collection.indexes.length > 0);
    for (const index of collection.indexes) {
      assert.ok(index.name);
      assert.ok(index.fields.every((field) => ['asc', 'desc'].includes(field.direction)));
    }
  }
  const dailyFeeds = schema.collections.find((item) => item.name === 'daily_feeds');
  const feedTypeDate = dailyFeeds.indexes.find((index) => index.name === 'feed_type_date');
  assert.equal(feedTypeDate.unique, true);
  assert.deepEqual(feedTypeDate.fields.map((field) => field.name), ['feedType', 'date']);
  const profileItems = schema.collections.find((item) => item.name === 'profile_items');
  assert.ok(profileItems.indexes.some((index) => index.name === 'owner_key_status'));
  const messages = schema.collections.find((item) => item.name === 'messages');
  const requestRole = messages.indexes.find((index) => index.name === 'owner_request_role');
  assert.equal(requestRole.unique, true);
  assert.deepEqual(requestRole.fields.map((field) => field.name), ['ownerId', 'requestId', 'role']);
});

test('CloudBase deployment helper never embeds an environment id or secret', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/cloudbase-readiness.js'), 'utf8');
  assert.match(script, /MYALLY_CLOUDBASE_ENV_ID/);
  assert.match(script, /Base resp abnormal/);
  assert.match(script, /reported a CloudBase platform error/);
  assert.doesNotMatch(script, /secret(Id|Key)\s*[:=]/i);
  assert.doesNotMatch(script, /wx[a-zA-Z0-9]{16}/);
});
