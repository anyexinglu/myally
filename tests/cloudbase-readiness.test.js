'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'cloudbase/schema.json'), 'utf8'));

test('CloudBase schema declares the complete POC data and function surface', () => {
  assert.deepEqual(schema.collections.map((item) => item.name), [
    'entries', 'messages', 'observations', 'profile_items',
  ]);
  assert.deepEqual(schema.cloudFunctions, ['entries', 'conversations']);
  for (const collection of schema.collections) {
    assert.equal(collection.clientAccess, 'deny');
    assert.ok(collection.indexes.length > 0);
    for (const index of collection.indexes) {
      assert.ok(index.name);
      assert.ok(index.fields.every((field) => ['asc', 'desc'].includes(field.direction)));
    }
  }
});

test('CloudBase deployment helper never embeds an environment id or secret', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/cloudbase-readiness.js'), 'utf8');
  assert.match(script, /MYALLY_CLOUDBASE_ENV_ID/);
  assert.doesNotMatch(script, /secret(Id|Key)\s*[:=]/i);
  assert.doesNotMatch(script, /wx[a-zA-Z0-9]{16}/);
});
