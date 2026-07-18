/**
 * 我在 A/B 自动化测试 — 通过 miniprogram-automator 控制仿真小程序
 *
 * 工作方式：
 *   1. automator.launch() 启动 DevTools + 自动化端口
 *   2. 打开首页
 *   3. 输入文字 → 调用 send() → wx.cloud.callFunction → hy3
 *   4. 读取回复
 *
 * 用法：
 *   node ab-automation.js scenarios/health-memory.json              # 两边跑
 *   node ab-automation.js scenarios/health-memory.json --mode=raw   # 只跑 A
 *   node ab-automation.js scenarios/health-memory.json --mode=product
 */

const automator = require('miniprogram-automator');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const PROJECT_PATH = path.resolve(__dirname, '../..');
const SCENARIOS_DIR = path.join(__dirname, 'scenarios');
const CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';

function loadScenario(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runScenario(scenario, mode) {
  const label = mode === 'raw' ? 'A: 裸 hy3' : 'B: 我在产品';
  console.log(`\n[${label}] 启动自动化会话...`);

  const mp = await automator.launch({
    projectPath: PROJECT_PATH,
    cliPath: CLI_PATH,
    timeout: 60000,
  });
  console.log('  ✅ DevTools 启动，已连接');

  // 等 IDE 编译完成
  console.log('  等待项目编译...');
  await sleep(8000);

  // 打开首页
  let page;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      page = await mp.navigateTo('/pages/home/index');
      if (page) break;
    } catch (e) {
      console.log(`  尝试打开首页 (${attempt + 1}/5): ${e.message.slice(0, 60)}`);
      await sleep(3000);
    }
  }
  if (!page) { console.log('  ❌ 无法打开首页'); await mp.close(); return null; }
  console.log('  ✅ 已打开首页');
  await sleep(2000);

  const steps = scenario.steps || [];
  const results = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`\n── 第${step.turn}轮: "${step.user.slice(0, 40)}..." ──`);

    // 输入文字
    await page.callMethod('onText', { detail: { value: step.user } });
    await sleep(300);

    // 发送
    await page.callMethod('send');
    console.log('  📤 已发送');

    // 等回复
    let assistant = null;
    for (let w = 0; w < 60; w++) { // 最多等 60s
      await sleep(1000);
      try {
        const data = await page.data();
        const msgs = data.messages || [];
        assistant = [...msgs].reverse().find(m =>
          m.role === 'assistant' && !m.pending && !m.failed && m.text
        );
        if (assistant) break;
      } catch {}
    }

    if (assistant) {
      console.log(`  💬 ${assistant.text.length}字`);
      results.push({
        turn: step.turn, user: step.user,
        reply: assistant.text,
        replyLength: assistant.text.length,
        memoryCount: assistant.memoryCount || 0,
        toolCalls: (assistant.toolCalls || []).length,
      });
    } else {
      console.log('  ⚠️ 未收到回复');
      results.push({ turn: step.turn, user: step.user, reply: '', replyLength: 0, memoryCount: 0, toolCalls: 0 });
    }
  }

  await mp.close();
  return { scenario: scenario.name, mode, label, results };
}

// ======== 对比输出 ========

function printComparison(raw, product) {
  if (!raw || !product) { console.log('\n⚠️ 数据不完整'); return; }
  console.log('\n═══════════════════════════════════════════');
  console.log('  A/B 对比报告（真实 hy3 × 真实小程序界面）');
  console.log('═══════════════════════════════════════════\n');
  for (let i = 0; i < raw.results.length; i++) {
    const a = raw.results[i] || {};
    const b = product.results[i] || {};
    console.log(`第${a.turn || i + 1}轮:`);
    console.log(`  A（裸 hy3） ${a.replyLength || 0}字`);
    console.log(`     ${(a.reply || '').slice(0, 200)}`);
    console.log(`  B（产品）   ${b.replyLength || 0}字 | 记忆: ${b.memoryCount || 0}条`);
    console.log(`     ${(b.reply || '').slice(0, 200)}`);
    console.log();
  }
  console.log('结论: B 是否比 A 更"懂"用户？\n');
}

async function main() {
  const args = process.argv.slice(2);
  let scenarioPath = args.find(a => !a.startsWith('--')) || 'health-memory.json';
  const modeFlag = args.find(a => a.startsWith('--mode='));
  const mode = modeFlag ? modeFlag.split('=')[1] : null;

  if (!fs.existsSync(scenarioPath)) {
    const alt = path.join(SCENARIOS_DIR, scenarioPath);
    if (fs.existsSync(alt)) scenarioPath = alt;
    else { console.error('找不到场景'); process.exit(1); }
  }

  const scenario = loadScenario(scenarioPath);
  console.log(`场景: ${scenario.name}, ${scenario.steps.length} 轮`);

  if (mode === 'raw') {
    const r = await runScenario(scenario, 'raw');
    if (r) for (const s of r.results) console.log(`  第${s.turn}轮: ${s.replyLength}字`);
  } else if (mode === 'product') {
    const r = await runScenario(scenario, 'product');
    if (r) for (const s of r.results) console.log(`  第${s.turn}轮: ${s.replyLength}字 | 记忆:${s.memoryCount}`);
  } else {
    const raw = await runScenario(scenario, 'raw');
    const product = await runScenario(scenario, 'product');
    printComparison(raw, product);
  }
}

main().catch(e => { console.error('错误:', e.message); process.exitCode = 1; });
