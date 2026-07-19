'use strict';

/**
 * Embedder — 使用 Kimi K3 做语义相似度判断
 *
 * 在 CloudBase 环境中，无法调本地 Ollama。
 * 改用 Kimi K3 模型直接判断查询与候选记忆的语义相关性。
 * 虽然比向量检索慢，但不需要额外服务。
 */

const cloud = require('wx-server-sdk');

/**
 * 用 Kimi K3 判断 query 与一段记忆文本的语义相关度（0-1）
 */
async function semanticScore(query, memoryText) {
  if (!query || !memoryText) return 0;
  try {
    const ai = cloud.ai();
    const model = ai.createModel('cloudbase');
    const result = await model.generateText({
      model: process.env.MYALLY_MODEL_NAME || 'kimi-k3',
      messages: [
        { role: 'system', content: '你是一个语义相关性判断器。判断用户查询与一段记忆是否语义相关。只输出0到1之间的小数，0表示完全不相关，1表示高度相关。只输出数字，不要解释。' },
        { role: 'user', content: `查询：${query}\n记忆：${memoryText}\n相关度：` },
      ],
      temperature: 0.1,
      max_tokens: 10,
    });
    const text = (result?.text || '').trim();
    const score = parseFloat(text);
    return isNaN(score) ? 0 : Math.max(0, Math.min(1, score));
  } catch {
    return 0;
  }
}

/**
 * 批量为多个记忆项计算语义分数
 */
async function batchSemanticScore(query, items) {
  if (!query || !items || items.length === 0) return items.map(() => 0);
  // 每个 item 单独打分
  const scores = await Promise.all(
    items.map(item => semanticScore(query, item.value || '').catch(() => 0))
  );
  return scores;
}

module.exports = { semanticScore, batchSemanticScore };
