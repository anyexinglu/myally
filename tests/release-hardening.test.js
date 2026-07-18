'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('production manifest contains only user-facing release pages', () => {
  const app = JSON.parse(read('miniprogram/app.json'));
  assert.deepEqual(app.pages, [
    'pages/home/index',
    'pages/mine/index',
    'pages/about/index',
  ]);
  assert.doesNotMatch(JSON.stringify(app), /devtest|watch/);
});

test('production cloud function has no client-selected raw model branch', () => {
  const source = read('cloudfunctions/conversations/index.js');
  assert.doesNotMatch(source, /event\.mode|mode\s*===\s*['"]raw['"]/);
  assert.match(source, /WechatContentModerator/);
});

test('assistant UI discloses AI generation and links service information', () => {
  const home = read('miniprogram/pages/home/index.wxml');
  const mine = read('miniprogram/pages/mine/index.wxml');
  assert.match(home, /AI生成，仅供参考/);
  assert.match(mine, /服务与隐私说明/);
  assert.doesNotMatch(home, /守望/);
  assert.doesNotMatch(mine, /开发者测试|守望/);
});
