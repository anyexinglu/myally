'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const required = [
  'project.config.json', 'project.config.example.json', 'miniprogram/app.json', 'miniprogram/app.ts',
  'miniprogram/pages/home/index.ts', 'miniprogram/pages/home/index.wxml',
  'miniprogram/pages/mine/index.ts', 'miniprogram/pages/watch/index.ts',
  'cloudfunctions/entries/index.js', 'cloudfunctions/entries/domain.js',
  'packages/domain/index.js',
  'cloudfunctions/conversations/index.js', 'cloudfunctions/conversations/domain.js',
  'cloudfunctions/conversations/model-adapter.js', 'cloudfunctions/conversations/search-adapter.js',
  'cloudfunctions/conversations/agent.js', 'cloudfunctions/conversations/memory.js',
  'cloudfunctions/conversations/skills.js', 'cloudfunctions/conversations/tools.js',
  'packages/conversation/index.js', 'packages/agent/index.js', 'packages/memory/index.js',
  'packages/skills/index.js', 'packages/tools/index.js',
  'cloudbase/schema.json', 'scripts/cloudbase-readiness.js',
];

for (const file of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`missing required file: ${file}`);
  if (fs.readFileSync(full, 'utf8').includes('...[truncated]')) throw new Error(`truncated marker found: ${file}`);
}

for (const file of ['project.config.json', 'project.config.example.json', 'miniprogram/app.json', 'miniprogram/sitemap.json', 'cloudfunctions/entries/package.json', 'cloudfunctions/conversations/package.json', 'cloudbase/schema.json']) {
  JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
const projectExample = JSON.parse(fs.readFileSync(path.join(root, 'project.config.example.json'), 'utf8'));
if (!/^(touristappid|wx[a-zA-Z0-9]{16})$/.test(project.appid || '')) {
  throw new Error('local project AppID is missing or invalid');
}
if (projectExample.appid !== 'touristappid') throw new Error('tracked project example must not contain a real AppID');
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/);
if (!gitignore.includes('project.config.json') || !gitignore.includes('project.private.config.json')) {
  throw new Error('local WeChat project configs must be ignored by Git');
}
if (project.miniprogramRoot !== 'miniprogram/' || project.cloudfunctionRoot !== 'cloudfunctions/') {
  throw new Error('project roots are invalid');
}

const domain = fs.readFileSync(path.join(root, 'packages/domain/index.js'), 'utf8');
const cloudDomain = fs.readFileSync(path.join(root, 'cloudfunctions/entries/domain.js'), 'utf8');
if (domain !== cloudDomain) throw new Error('cloud function domain copy is out of sync');
const conversationDomain = fs.readFileSync(path.join(root, 'packages/conversation/index.js'), 'utf8');
const cloudConversationDomain = fs.readFileSync(path.join(root, 'cloudfunctions/conversations/domain.js'), 'utf8');
if (conversationDomain !== cloudConversationDomain) throw new Error('conversation cloud function domain copy is out of sync');
for (const [source, deployed] of [
  ['packages/agent/index.js', 'cloudfunctions/conversations/agent.js'],
  ['packages/memory/index.js', 'cloudfunctions/conversations/memory.js'],
  ['packages/skills/index.js', 'cloudfunctions/conversations/skills.js'],
  ['packages/tools/index.js', 'cloudfunctions/conversations/tools.js'],
]) {
  if (fs.readFileSync(path.join(root, source), 'utf8') !== fs.readFileSync(path.join(root, deployed), 'utf8')) {
    throw new Error(`cloud function domain copy is out of sync: ${deployed}`);
  }
}

for (const file of [
  'packages/domain/index.js', 'cloudfunctions/entries/domain.js', 'cloudfunctions/entries/index.js',
  'packages/conversation/index.js', 'cloudfunctions/conversations/domain.js',
  'cloudfunctions/conversations/model-adapter.js', 'cloudfunctions/conversations/index.js',
  'cloudfunctions/conversations/search-adapter.js',
  'cloudfunctions/conversations/agent.js', 'cloudfunctions/conversations/memory.js',
  'cloudfunctions/conversations/skills.js', 'cloudfunctions/conversations/tools.js',
  'packages/agent/index.js', 'packages/memory/index.js', 'packages/skills/index.js', 'packages/tools/index.js',
]) {
  new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
}

for (const file of ['cloudfunctions/entries/index.js', 'cloudfunctions/conversations/index.js']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (!source.includes("typeof globalThis.structuredClone !== 'function'")) {
    throw new Error(`Node.js 16 structuredClone compatibility is missing: ${file}`);
  }
}

const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'));
for (const page of ['pages/home/index', 'pages/mine/index', 'pages/watch/index']) {
  if (!app.pages.includes(page)) throw new Error(`page not registered: ${page}`);
}

const homeLogic = fs.readFileSync(path.join(root, 'miniprogram/pages/home/index.ts'), 'utf8');
const homeTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/home/index.wxml'), 'utf8');
if (!homeLogic.includes('retrySend(event)') || !homeLogic.includes('requestId: draft.requestId')) {
  throw new Error('failed conversation retry must preserve the original requestId');
}
if (!homeTemplate.includes('bindtap="retrySend"')) throw new Error('failed conversation retry control is missing');

console.log(`project validation passed: ${required.length} required files, ${app.pages.length} pages`);
