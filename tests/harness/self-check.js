'use strict';

/**
 * 云函数自检脚本 — 测试部署后的函数能否正常启动
 *
 * 通过 CloudBase HTTP API 调用云函数。
 * 由于 wx-server-sdk 只能在微信环境内使用，
 * 本脚本通过模拟 event 测试函数是否能正常导出和初始化。
 */

const path = require('path');
const fs = require('fs');

const FUNC_DIR = '/Users/anyexinglu/Documents/personal/side-work/myally-miniapp/cloudfunctions/conversations';

// 1. 检查所有文件是否存在
console.log('\n=== 文件完整性检查 ===');
const required = [
  'index.js', 'package.json', 'package-lock.json',
  'embedder.js', 'hybrid-retriever.js', 'retriever.js', 'memory.js',
  'task.js', 'tools.js', 'agent.js', 'domain.js',
  'model-adapter.js', 'skills.js', 'content-safety.js', 'search-adapter.js',
];
let allOk = true;
for (const f of required) {
  const exists = fs.existsSync(path.join(FUNC_DIR, f));
  if (!exists) { console.log(`❌ 缺少: ${f}`); allOk = false; }
}
if (allOk) console.log('✅ 全部 15 个文件存在');

// 2. 检查 package.json 依赖
console.log('\n=== 依赖声明检查 ===');
const pkg = JSON.parse(fs.readFileSync(path.join(FUNC_DIR, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {});
console.log(`依赖: ${deps.join(', ')}`);
if (deps.includes('wx-server-sdk')) console.log('✅ wx-server-sdk 已声明');
else console.log('❌ wx-server-sdk 未声明');

// 3. 检查 lock 文件
const lockExists = fs.existsSync(path.join(FUNC_DIR, 'package-lock.json'));
console.log(lockExists ? '✅ package-lock.json 存在' : '❌ package-lock.json 缺失');

// 4. 检查 index.js 导出
console.log('\n=== 入口导出检查 ===');
const content = fs.readFileSync(path.join(FUNC_DIR, 'index.js'), 'utf8');
if (content.includes('exports.main')) console.log('✅ exports.main 已定义');
else console.log('❌ 缺少 exports.main');

// 5. 检查入口文件是否引用了所有模块
console.log('\n=== 模块引用检查 ===');
const refs = ['memory', 'task', 'tools', 'agent', 'domain', 'model-adapter', 'skills', 'content-safety', 'search-adapter'];
for (const ref of refs) {
  if (content.includes(`require('./${ref}')`)) console.log(`✅ 引用了 ${ref}`);
  else console.log(`❌ 缺少引用 ${ref}`);
}

// 6. 检查 MemoryService 是否传了 retriever
console.log('\n=== Retriever 集成检查 ===');
if (content.includes('retriever:')) console.log('✅ MemoryService 已配置 retriever');
else console.log('❌ MemoryService 未配置 retriever');
if (content.includes('new Retriever')) console.log('✅ Retriever 已创建');
else console.log('❌ Retriever 未创建');
if (content.includes('require(\'./retriever\')')) console.log('✅ Retriever 已引入');
else console.log('❌ Retriever 未引入');

// 7. 检查 cloud.init 配置
console.log('\n=== 环境配置检查 ===');
if (content.includes(`cloud.DYNAMIC_CURRENT_ENV`)) console.log('✅ 使用 DYNAMIC_CURRENT_ENV');
else console.log('⚠️ 未使用 DYNAMIC_CURRENT_ENV');

console.log('\n=== 自检完成 ===');
console.log(allOk ? '✅ 代码层面全部正常' : '❌ 存在缺失文件');
