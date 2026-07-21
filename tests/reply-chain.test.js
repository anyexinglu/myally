'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('production conversation fallback stays on the enabled growth-plan model', () => {
  const entry = read('cloudfunctions/conversations/index.js');
  assert.match(entry, /MYALLY_MODEL_NAME\s*\|\|\s*'hy3'/);
  assert.doesNotMatch(entry, /MYALLY_MODEL_NAME\s*\|\|\s*'kimi-k3'/);
});

test('voice recognition waits for recording completion and reuses the conversation send path', () => {
  const app = JSON.parse(read('miniprogram/app.json'));
  const home = read('miniprogram/pages/home/index.ts');
  assert.equal(app.plugins, undefined);
  assert.equal(app.permission?.['scope.record'], undefined);
  assert.match(home, /wx\.getRecorderManager\(\)/);
  assert.match(home, /recorder\.onStop\(this\._recorderStopHandler\)/);
  assert.match(home, /recorder\.onError\(this\._recorderErrorHandler\)/);
  assert.doesNotMatch(home, /recorder\.on(?:Stop|Error)\s*=/);
  assert.match(home, /onUnload\(\)[\s\S]*this\.endRecording\(\)[\s\S]*this\.clearVoiceCallbacks\(\)/);
  assert.match(home, /finally\s*\{\s*this\.clearVoiceCallbacks\(\)/);
  assert.match(home, /name:\s*'asr'/);
  assert.match(home, /await this\.send\(\)/);
  assert.match(home, /录音上传超时，请改用文字输入/);
  assert.match(home, /语音识别超时，请改用文字输入/);
  assert.doesNotMatch(home, /setTimeout\(r\s*=>\s*r\(\),\s*200\)/);
});

test('ASR uses temporary cloud-function credentials and always removes the uploaded recording', () => {
  const asr = read('cloudfunctions/asr/index.js');
  const pkg = JSON.parse(read('cloudfunctions/asr/package.json'));
  assert.match(asr, /TENCENTCLOUD_SECRETID/);
  assert.match(asr, /TENCENTCLOUD_SESSIONTOKEN/);
  assert.match(asr, /SentenceRecognition/);
  assert.match(asr, /cloud\.deleteFile\(\{ fileList: \[fileId\] \}\)/);
  assert.doesNotMatch(asr, /kimi-k3|audioTranslate|audioUrl/);
  assert.equal(pkg.dependencies['@tencentcloud/asr'], undefined);
});
