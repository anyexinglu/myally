/**
 * 我在 A/B 自动化测试 — 通过 miniprogram-automator 操作真实小程序界面
 *
 * 完全复用用户操作路径：
 *   模拟器页面输入文字 → 点击发送 → wx.cloud.callFunction → hy3 → 读取回复
 *
 * 对照组（A - raw）：云函数直接调 hy3，无记忆无 Agent
 * 实验组（B - product）：正常产品管线（Agent + 记忆 + 知识）
 *
 * 用法：
 *   先打开微信开发者工具，确认服务端口已开启（当前 58002）
 *   node ab-automation.js scenarios/health-memory.json              # 两边跑
 *   node ab-automation.js scenarios/health-memory.json --mode raw    # 只跑裸模型
 *   node ab-automation.js scenarios/health-memory.json --mode product # 只跑产品
 */

const automator = require('miniprogram-automator');
const path = require('node:path');
const fs = require('node:fs');

const PROJECT_PATH = path.resolve(__dirname, '../..');
const SCENARIOS_DIR = path.join(__dirname, 'scenarios');
const WS_PORT = '9420';

function loadScenario(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForReply(page, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const data = await page.data();
      const msgs = data.messages || [];
      // 找最后一条非 pending、非 failed 的 assistant 消息
      const last = [...msgs].reverse().find(m =>
        m.role === 'assistant' && !m.pending && !m.failed && m.text && m.text.length > 0
      );
      if (last) return last;
    } catch {}
    await sleep(500);
  }
  return null;
}

async function runScenario(scenario, mode) {
  const label = mode === 'raw' ? '对照组 A：裸 hy3' : '实验组 B：我在产品';
  console.log(`\n📱 [${label}] 连接开发者工具 :${WS_PORT}...`);

  let miniProgram;
  try {
    miniProgram = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${WS_PORT}` });
    console.log(`  ✅ 已连接到运行中的 DevTools`);
  } catch (err) {
    console.log(`  ❌ 连接失败: ${err.message}`);
    console.log(`  请确认微信开发者工具已打开，且安全设置中「服务端口」已开启`);
    return null;
  }

  // 打开首页
  const page = await miniProgram.navigateTo('/pages/home/index');
  console.log(`  📄 已打开首页`);

  // 等待页面加载
  await sleep(2000);

  const steps = scenario.steps || [];
  const results = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`\n── 第${step.turn}轮: "${step.user.slice(0, 40)}..." ──`);

    // 输入文字（通过 page.callMethod 触发 onText，与用户操作一致）
    await page.callMethod('onText', { detail: { value: step.user } });
    await sleep(200);

    // 点击发送（调用 send 方法）
    await page.callMethod('send');
    console.log(`  📤 已发送`);

    // 等回复
    const assistant = await waitForReply(page);
    if (assistant && assistant.text) {
      console.log(`  💬 (${assistant.text.length}字): ${assistant.text.slice(0, 120)}...`);
      results.push({
        turn: step.turn,
        user: step.user,
        reply: assistant.text,
        replyLength: assistant.text.length,
        memoryCount: assistant.memoryCount || 0,
        toolCalls: (assistant.toolCalls || []).length,
      });
    } else {
      console.log(`  ⚠️ 超时未收到回复`);
      results.push({ turn: step.turn, user: step.user, reply: '', replyLength: 0, memoryCount: 0, toolCalls: 0 });
    }

    // 轮次间隔
    await sleep(1500);
  }

  await miniProgram.close();
  return { scenario: scenario.name, mode, label, results };
}

function printComparison(raw, product) {
  if (!raw || !product) {
    console.log('\n⚠️ 对比需要两组数据都完整才能进行');
    return;
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  A/B 对比报告（通过真实小程序界面 × 真实 hy3）');
  console.log('═══════════════════════════════════════════════\n');

  for (let i = 0; i < raw.results.length; i++) {
    const a = raw.results[i] || {};
    const b = product.results[i] || {};

    console.log(`第${a.turn || i + 1}轮: "${(a.user || '').slice(0, 30)}"`);
    console.log(`  A（裸 hy3）  ${a.replyLength || 0}字 | 记忆: 无`);
    console.log(`     ${(a.reply || '(无回复)').slice(0, 200)}`);
    console.log(`  B（产品）    ${b.replyLength || 0}字 | 记忆: ${b.memoryCount || 0}条 | 工具: ${b.toolCalls || 0}次`);
    console.log(`     ${(b.reply || '(无回复)').slice(0, 200)}`);
    console.log();
  }

  console.log('── 对比要点 ──');
  console.log('1. B 是否使用了记忆（memoryCount > 0）？A 始终无记忆');
  console.log('2. B 的回答是否随轮次越来越个性化？');
  console.log('3. B 是否比 A 更懂用户的情况？');
  console.log();
}

function printSingle(result) {
  if (!result) return;
  console.log(`\n── ${result.label} 结果 ──`);
  for (const r of result.results) {
    console.log(`  第${r.turn}轮: ${r.replyLength}字 | 记忆: ${r.memoryCount}条`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let scenarioPath = args.find(a => !a.startsWith('--')) || path.join(SCENARIOS_DIR, 'health-memory.json');
  const modeArg = args.find(a => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : null;

  if (!fs.existsSync(scenarioPath)) {
    const alt = path.join(SCENARIOS_DIR, scenarioPath);
    if (fs.existsSync(alt)) scenarioPath = alt;
    else { console.error(`找不到场景: ${scenarioPath}`); process.exit(1); }
  }

  const scenario = loadScenario(scenarioPath);
  console.log(`场景: ${scenario.name}`);
  console.log(`轮次: ${scenario.steps.length} 轮`);

  if (mode === 'raw') {
    const r = await runScenario(scenario, 'raw');
    printSingle(r);
  } else if (mode === 'product') {
    const r = await runScenario(scenario, 'product');
    printSingle(r);
  } else {
    // 两边都跑
    const raw = await runScenario(scenario, 'raw');
    const product = await runScenario(scenario, 'product');
    printComparison(raw, product);
  }
}

main().catch(err => {
  console.error('错误:', err);
  process.exitCode = 1;
});
