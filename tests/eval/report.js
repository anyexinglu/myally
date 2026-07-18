'use strict';

/**
 * Report — 控制台输出 + HISTORY.md 追加
 */

const fs = require('node:fs');
const path = require('node:path');

const HISTORY_PATH = path.join(__dirname, 'HISTORY.md');

function printReport(result) {
  const { scenario, results, summary } = result;

  if (!results || results.length === 0) {
    console.log(`  ${scenario}: ⚠️ 无结果\n`);
    return;
  }

  for (const step of results) {
    const prefix = step.step ? `  步骤${step.step}: ` : '  ';
    if (step.error) {
      console.log(`${prefix}❌ 执行错误: ${step.error}`);
      continue;
    }

    const checks = step.evalResult.checks || [];
    const passCount = checks.filter((c) => c.pass).length;
    const totalCount = checks.length;

    if (totalCount === 0) {
      console.log(`${prefix}✓ 执行完成（无断言）`);
      continue;
    }

    const status = passCount === totalCount ? '✓' : '✗';
    console.log(`${prefix}${status} ${passCount}/${totalCount} 断言通过`);

    for (const check of checks) {
      if (!check.pass) {
        console.log(`       ${check.key}: ${check.message}`);
      }
    }
  }

  if (summary) {
    const status = summary.allPass ? '✅' : '⚠️';
    console.log(`  ${status} 总分: ${summary.avgScore.toFixed(2)}/5.0 (${summary.stepCount} 步)\n`);
  }
}

function appendHistory(entry) {
  const header = '## 评估历史\n\n| 日期 | 版本 | 场景 | 通过 | 分数 | 步数 |\n|------|------|------|:----:|:----:|:----:|';
  let content = '';

  if (fs.existsSync(HISTORY_PATH)) {
    content = fs.readFileSync(HISTORY_PATH, 'utf8');
  } else {
    content = `# 「我在」评测历史\n\n${header}\n`;
  }

  for (const s of entry.scenarios) {
    const date = s.date || entry.date;
    const version = s.version || entry.version;
    content += `\n| ${date} | ${version} | ${s.name} | ${s.pass ? '✅' : '❌'} | ${s.score} | ${s.steps} |`;
  }

  fs.writeFileSync(HISTORY_PATH, content, 'utf8');
}

module.exports = { printReport, appendHistory };
