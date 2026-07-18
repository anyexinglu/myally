/**
 * 评测测试页 — 在真实小程序环境自动化测试「我在」效果
 * 走真实流水线：小程序 → cloud function → CloudBase AI(混元)
 *
 * 使用方式：
 *   手动：打开页面 → 点「全部运行」或单个用例
 *   自动：pages/devtest/index?auto=1 → 页面加载后自动跑全部用例
 */

import { callConversation } from '../../utils/cloud';

interface StepResult {
  step: number;
  desc: string;
  pass: boolean;
  detail: string;
  duration: number;
  memoryUsed: number;
  memoryCreated: number;
}

interface TestResult {
  id: string;
  label: string;
  steps: StepResult[];
  allPass: boolean;
  score: number;
}

const TEST_CASES: Array<{
  id: string;
  label: string;
  steps: Array<{ text: string; desc: string; temporary?: boolean; expectedTool?: string }>;
}> = [
  {
    id: 'memory-1',
    label: '记忆建立 + 召回',
    steps: [
      { text: '我偏好低风险的投资方式，不接受本金亏损', desc: '建立记忆' },
      { text: '帮我推荐适合我的投资组合', desc: '验证召回' },
    ],
  },
  {
    id: 'career-1',
    label: '职业建议',
    steps: [
      { text: '我最近工作压力很大，不确定要不要换工作', desc: '职业困惑' },
    ],
  },
  {
    id: 'privacy-1',
    label: '隐私隔离',
    steps: [
      { text: '帮我做个简单的理财规划', desc: '不依赖记忆的正常对话' },
    ],
  },
  {
    id: 'temp-1',
    label: '临时模式',
    steps: [
      { text: '帮我看看这个临时问题', desc: '临时对话', temporary: true },
    ],
  },
  {
    id: 'tool-time-1',
    label: '白名单时间工具',
    steps: [
      { text: '请使用当前时间工具告诉我现在几点', desc: '验证current_time', expectedTool: 'current_time' },
    ],
  },
];

type LogItem = { time: string; text: string; type: string };

Page({
  data: {
    testCases: TEST_CASES,
    logs: [] as LogItem[],
    running: false,
    currentTest: '',
    currentStep: 0,
    results: [] as TestResult[],
    autoMode: false,
  },

  onLoad(options: any) {
    const auto = options && options.auto === '1';
    if (auto) {
      this.setData({ autoMode: true });
      this.addLog('system', '⚡ 自动模式已启动，即将执行全部测试用例...');
      setTimeout(() => this.runAll(), 500);
    } else {
      this.addLog('system', '评测页已加载。点击「全部运行」或选择单个用例。');
    }
  },

  addLog(type: string, text: string) {
    const time = new Date().toLocaleTimeString();
    const logs = [...this.data.logs, { time, text, type }];
    this.setData({ logs });
  },

  clearLogs() {
    this.setData({ logs: [], results: [], conversationId: '' });
  },

  // ======== 单个用例 ========

  async runTest(e: any) {
    if (this.data.running) return;
    const testId = e.currentTarget.dataset.test;
    const test = TEST_CASES.find(t => t.id === testId);
    if (!test) return;
    await this.executeTest(test);
  },

  async executeTest(test: typeof TEST_CASES[0]): Promise<TestResult> {
    this.setData({ running: true, currentTest: test.label, currentStep: 0 });
    this.addLog('system', `▶ ${test.label}（${test.steps.length}步）`);

    const stepResults: StepResult[] = [];
    let convId = '';

    for (let i = 0; i < test.steps.length; i++) {
      const step = test.steps[i];
      this.setData({ currentStep: i + 1 });
      this.addLog('send', `[步${i + 1}] ${step.desc}: "${step.text}"`);

      try {
        const start = Date.now();
        const turn: any = await callConversation('send', {
          payload: {
            type: 'text',
            text: step.text,
            requestId: `test-${test.id}-${i}-${Date.now()}`,
            conversationId: convId,
            temporary: (step as any).temporary || false,
            mode: (step as any).mode || 'product',
          },
        });
        const dur = Date.now() - start;
        if (turn.conversationId) convId = turn.conversationId;

        const assistant = turn.assistantMessage;
        const usedMem = (turn.usedMemories || []) as any[];
        const createdMem = (turn.createdMemories || []) as any[];

        // 评估
        const checks: string[] = [];
        let pass = true;

        // 有回复
        const hasReply = !!(assistant && assistant.text && assistant.text.length > 10);
        if (hasReply) checks.push('✅有回复'); else { checks.push('❌无回复'); pass = false; }

        // 记忆召回（预期有记忆的步骤）
        if (i > 0) {
          if (usedMem.length > 0) {
            checks.push(`✅召回了${usedMem.length}条记忆`);
          } else {
            checks.push('❌未召回记忆');
            pass = false;
          }
        }

        // 临时模式跳过记忆
        if ((step as any).temporary) {
          if (turn.memoryStatus === 'skipped') {
            checks.push('✅临时跳过'); 
          } else {
            checks.push('⚠️临时未跳过');
          }
        }

        if ((step as any).expectedTool) {
          const expectedTool = (step as any).expectedTool;
          const toolCalls = assistant && assistant.agent && Array.isArray(assistant.agent.toolCalls)
            ? assistant.agent.toolCalls : [];
          if (toolCalls.some((item: any) => item.name === expectedTool && item.status === 'ok')) {
            checks.push(`✅工具${expectedTool}`);
          } else {
            checks.push(`❌未执行工具${expectedTool}`);
            pass = false;
          }
        }

        // 新建记忆
        if (createdMem.length > 0) {
          checks.push(`📝新建${createdMem.length}条`);
        }

        // 耗时
        const timeOk = dur < 30000;
        checks.push(timeOk ? `⏱${(dur / 1000).toFixed(1)}s` : `⚠️${(dur / 1000).toFixed(1)}s`);

        stepResults.push({
          step: i + 1, desc: step.desc, pass,
          detail: checks.join(' · '), duration: dur,
          memoryUsed: usedMem.length, memoryCreated: createdMem.length,
        });

        this.addLog('result', `  ${pass ? '✅' : '❌'} ${checks.join(' · ')}: ${assistant.text.slice(0, 100)}...`);

      } catch (err: any) {
        stepResults.push({ step: i + 1, desc: step.desc, pass: false, detail: `❌${err.message}`, duration: 0, memoryUsed: 0, memoryCreated: 0 });
        this.addLog('error', `  ❌ ${err.message}`);
      }
    }

    const allPass = stepResults.every(s => s.pass);
    const score = (stepResults.filter(s => s.pass).length / stepResults.length) * 5;

    const result: TestResult = { id: test.id, label: test.label, steps: stepResults, allPass, score };
    this.addLog('system', `${allPass ? '✅' : '⚠️'} ${test.label}: ${score.toFixed(1)}/5.0`);

    this.setData({ running: false, currentTest: '' });
    return result;
  },

  // ======== 全部运行 ========

  async runAll() {
    if (this.data.running) return;
    this.setData({ logs: [], results: [], running: true });
    this.addLog('system', `▶ 全部用例（${TEST_CASES.length}个）`);

    const results: TestResult[] = [];
    for (const test of TEST_CASES) {
      const r = await this.executeTest(test);
      results.push(r);
    }

    // 汇总报告
    const passCount = results.filter(r => r.allPass).length;
    this.addLog('system', '');
    this.addLog('system', '═══════════════════════════════════');
    this.addLog('system', '  测试报告');
    this.addLog('system', '═══════════════════════════════════');
    for (const r of results) {
      const icon = r.allPass ? '✅' : '⚠️';
      const failSteps = r.steps.filter(s => !s.pass).map(s => `步${s.step}`).join(',');
      this.addLog('system', `  ${icon} ${r.label}: ${r.score.toFixed(1)}/5.0${failSteps ? ` （失败: ${failSteps}）` : ''}`);
    }
    this.addLog('system', `  通过率: ${passCount}/${results.length}`);
    this.addLog('system', '═══════════════════════════════════');

    this.setData({ results, running: false });
  },
});
