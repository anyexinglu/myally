'use strict';

/**
 * Evaluator — 对一轮对话结果执行断言检查并评分。
 * 同时支持硬断言和可选的关键词检查。
 */

const assert = require('node:assert/strict');

class EvalError extends Error {}

// 断言检查注册表
const CHECKERS = {
  // 记忆提取状态
  memoryStatus(turn, expected) {
    const actual = turn.memoryStatus || 'disabled';
    if (actual !== expected) {
      return { pass: false, expected, actual, message: `memoryStatus 应为 ${expected}，实际为 ${actual}` };
    }
    return { pass: true };
  },

  // 是否使用了记忆
  usesMemory(turn, expected) {
    const actual = (turn.usedMemories || []).length > 0;
    if (actual !== expected) {
      return {
        pass: false, expected, actual,
        message: expected ? '应使用记忆但未使用' : '不应使用记忆但实际使用了',
      };
    }
    return { pass: true };
  },

  // 回答包含预期关键词
  containsKeywords(turn, expected) {
    const text = (turn.assistantMessage && turn.assistantMessage.text) || '';
    const missing = expected.filter((kw) => !text.includes(kw));
    if (missing.length > 0) {
      return { pass: false, expected, actual: text.substring(0, 100), message: `回答应包含关键词: ${missing.join(', ')}` };
    }
    return { pass: true };
  },

  // 回答不包含禁止词
  notContains(turn, expected) {
    const text = (turn.assistantMessage && turn.assistantMessage.text) || '';
    const found = expected.filter((kw) => text.includes(kw));
    if (found.length > 0) {
      return { pass: false, expected, actual: text.substring(0, 100), message: `回答不应包含: ${found.join(', ')}` };
    }
    return { pass: true };
  },

  // 创建的记忆条数
  createdMemories(turn, expected) {
    const actual = (turn.createdMemories || []).length;
    if (typeof expected === 'number' && actual !== expected) {
      return { pass: false, expected, actual, message: `创建记忆数应为 ${expected}，实际为 ${actual}` };
    }
    if (typeof expected === 'string' && expected.startsWith('>=')) {
      const min = parseInt(expected.slice(2), 10);
      if (actual < min) {
        return { pass: false, expected, actual, message: `创建记忆数应 >= ${min}，实际为 ${actual}` };
      }
    }
    return { pass: true };
  },
};

const WEIGHTS = {
  memoryStatus: 1.0,
  usesMemory: 1.0,
  containsKeywords: 0.5,
  notContains: 0.5,
  createdMemories: 0.5,
};

function evaluateStep(turn, expect) {
  const checks = [];
  let totalWeight = 0;
  let passWeight = 0;

  for (const [key, expected] of Object.entries(expect)) {
    const checker = CHECKERS[key];
    if (!checker) continue; // 跳过未知断言
    const weight = WEIGHTS[key] || 0.5;
    totalWeight += weight;
    const result = checker(turn, expected);
    checks.push({ key, ...result });
    if (result.pass) passWeight += weight;
  }

  const score = totalWeight > 0 ? (passWeight / totalWeight) * 5.0 : 5.0;
  return { checks, score, passWeight, totalWeight };
}

function evaluateScenario(scenarioResults) {
  let totalScore = 0;
  let stepCount = 0;

  for (const step of scenarioResults) {
    if (step.evalResult) {
      totalScore += step.evalResult.score;
      stepCount += 1;
    }
  }

  const avgScore = stepCount > 0 ? totalScore / stepCount : 0;
  const allPass = scenarioResults.every((s) => {
    if (!s.evalResult) return false;
    return s.evalResult.checks.every((c) => c.pass);
  });

  return { avgScore, allPass, stepCount };
}

module.exports = { evaluateStep, evaluateScenario, CHECKERS, EvalError };
