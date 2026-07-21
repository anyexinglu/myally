'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const required = [
  'project.config.json', 'project.config.example.json', 'miniprogram/app.json', 'miniprogram/app.ts',
  'miniprogram/pages/home/index.ts', 'miniprogram/pages/home/index.wxml',
  'miniprogram/pages/featured/index.ts', 'miniprogram/pages/featured/index.wxml',
  'miniprogram/pages/featured/index.wxss', 'miniprogram/pages/featured/index.json',
  'miniprogram/data/tools.json', 'miniprogram/data/solutions.ts', 'miniprogram/data/skills.ts',
  'miniprogram/pages/mine/index.ts', 'miniprogram/pages/watch/index.ts',
  'cloudfunctions/entries/index.js', 'cloudfunctions/entries/domain.js',
  'packages/domain/index.js',
  'cloudfunctions/conversations/index.js', 'cloudfunctions/conversations/domain.js',
  'cloudfunctions/conversations/model-adapter.js', 'cloudfunctions/conversations/search-adapter.js',
  'cloudfunctions/conversations/agent.js', 'cloudfunctions/conversations/memory.js',
  'cloudfunctions/conversations/skills.js', 'cloudfunctions/conversations/tools.js',
  'packages/conversation/index.js', 'packages/agent/index.js', 'packages/memory/index.js',
  'packages/skills/index.js', 'packages/tools/index.js',
  'cloudfunctions/ingest-feed/index.js', 'cloudfunctions/ingest-feed/package.json',
  'cloudbase/schema.json', 'scripts/cloudbase-readiness.js',
];

for (const file of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`missing required file: ${file}`);
  if (fs.readFileSync(full, 'utf8').includes('...[truncated]')) throw new Error(`truncated marker found: ${file}`);
}

for (const file of ['project.config.json', 'project.config.example.json', 'miniprogram/app.json', 'miniprogram/sitemap.json', 'cloudfunctions/entries/package.json', 'cloudfunctions/conversations/package.json', 'cloudfunctions/ingest-feed/package.json', 'cloudbase/schema.json']) {
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
  'cloudfunctions/ingest-feed/index.js',
]) {
  new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
}

for (const file of ['cloudfunctions/entries/index.js', 'cloudfunctions/conversations/index.js', 'cloudfunctions/ingest-feed/index.js']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (!source.includes("typeof globalThis.structuredClone !== 'function'")) {
    throw new Error(`Node.js 16 structuredClone compatibility is missing: ${file}`);
  }
}

const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'));
for (const page of ['pages/home/index', 'pages/featured/index', 'pages/mine/index', 'pages/watch/index']) {
  if (!app.pages.includes(page)) throw new Error(`page not registered: ${page}`);
}
const tabPaths = ((app.tabBar && app.tabBar.list) || []).map((item) => item.pagePath);
const expectedTabs = ['pages/home/index', 'pages/featured/index', 'pages/mine/index'];
if (JSON.stringify(tabPaths) !== JSON.stringify(expectedTabs)) {
  throw new Error(`tabBar must be exactly: ${expectedTabs.join(', ')}`);
}

const homeLogic = fs.readFileSync(path.join(root, 'miniprogram/pages/home/index.ts'), 'utf8');
const homeTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/home/index.wxml'), 'utf8');
if (!homeLogic.includes('retrySend(event)') || !homeLogic.includes('requestId: draft.requestId')) {
  throw new Error('failed conversation retry must preserve the original requestId');
}
if (!homeTemplate.includes('bindtap="retrySend"')) throw new Error('failed conversation retry control is missing');

const skillsData = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/data/skills.json'), 'utf8'));
if (!Array.isArray(skillsData) || skillsData.length !== 8) throw new Error('skills.json must contain exactly 8 built-in skills');
for (const skill of skillsData) {
  for (const field of ['id', 'name', 'emoji', 'oneLiner', 'welcomeMessage', 'systemPrompt']) {
    if (typeof skill[field] !== 'string' || !skill[field].trim()) throw new Error(`skill ${skill.id || '?'} missing field: ${field}`);
  }
  if (!Array.isArray(skill.tags) || skill.tags.length < 1 || skill.tags.length > 2) throw new Error(`skill ${skill.id} must have 1-2 tags`);
}

const featuredLogic = fs.readFileSync(path.join(root, 'miniprogram/pages/featured/index.ts'), 'utf8');
if (!featuredLogic.includes('globalData.pendingSkill') || !featuredLogic.includes("wx.switchTab")) {
  throw new Error('featured skill cards must stash pendingSkill and switchTab to home');
}
const homeSourceForSkill = fs.readFileSync(path.join(root, 'miniprogram/pages/home/index.ts'), 'utf8');
if (!homeSourceForSkill.includes('pendingSkill') || !homeSourceForSkill.includes('skillPrompt')) {
  throw new Error('home page must consume pendingSkill and send skillPrompt');
}
const appSource = fs.readFileSync(path.join(root, 'miniprogram/app.ts'), 'utf8');
if (!appSource.includes('pendingSkill')) throw new Error('app globalData must declare pendingSkill');

const schemaManifest = JSON.parse(fs.readFileSync(path.join(root, 'cloudbase/schema.json'), 'utf8'));
const schemaCollections = schemaManifest.collections.map((item) => item.name);
for (const name of ['daily_feeds', 'config']) {
  if (!schemaCollections.includes(name)) throw new Error(`schema.json missing collection: ${name}`);
}
if (!schemaManifest.cloudFunctions.includes('ingest-feed')) throw new Error('schema.json missing cloud function: ingest-feed');

const ingestSource = fs.readFileSync(path.join(root, 'cloudfunctions/ingest-feed/index.js'), 'utf8');
for (const marker of ['FEED_INGEST_TOKEN', 'feed_ingest_token', 'daily_feeds', "'ai-news'", 'parenting', 'sidehustle', '20000', 'FORBIDDEN']) {
  if (!ingestSource.includes(marker)) throw new Error(`ingest-feed is missing required marker: ${marker}`);
}
if (/FEED_INGEST_TOKEN\s*=\s*['"][^'"]+['"]/.test(ingestSource)) {
  throw new Error('ingest token must not be hardcoded');
}

if (!featuredLogic.includes('switchInfoChannel') || !featuredLogic.includes("collection('daily_feeds')") || !featuredLogic.includes('wx.cloud.database()')) {
  throw new Error('featured page must query daily_feeds for info channels');
}
const featuredTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/featured/index.wxml'), 'utf8');
if (!featuredTemplate.includes('内容生成中，明天再来看看')) {
  throw new Error('featured feed channels must show the empty-state copy');
}

console.log(`project validation passed: ${required.length} required files, ${app.pages.length} pages`);
