'use strict';

/**
 * HybridRetriever — 混合检索：关键词 + Embedding + FTS + 排序
 *
 * 评分公式：
 *   final = 0.25 * keyword + 0.35 * embedding + 0.20 * fts + 0.10 * recency + 0.10 * type_boost
 *
 * 过滤：
 * - 高敏感度项必须有明确的关键词命中才返回
 * - 已过期项由 listCurrent 过滤
 * - 上下文预算：最多 8 条 / 2400 字
 */

const { embed, cosineSimilarity } = require('./embedder');

// 简单的中文分词器：一元 + 二元组
function tokenize(text) {
  const s = String(text || '').toLowerCase().replace(/[^\u4e00-\u9fff\w]/g, ' ');
  const words = s.split(/\s+/).filter(Boolean);
  const tokens = new Set();
  for (const w of words) {
    if (w.length >= 2) tokens.add(w);
    // 中文二元组
    for (let i = 0; i < w.length - 1; i++) {
      const bigram = w.slice(i, i + 2);
      if (/[\u4e00-\u9fff]/.test(bigram)) tokens.add(bigram);
    }
  }
  return [...tokens];
}

// 构建倒排索引
function buildInvertedIndex(items) {
  const index = new Map(); // term → Set<itemIndex>
  items.forEach((item, idx) => {
    const text = `${item.value} ${(item.keywords || []).join(' ')}`;
    const tokens = tokenize(text);
    for (const t of tokens) {
      if (!index.has(t)) index.set(t, new Set());
      index.get(t).add(idx);
    }
  });
  return index;
}

// FTS 评分
function ftsScore(query, item, invertedIndex, itemIdx) {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;
  let hits = 0;
  for (const t of qTokens) {
    const set = invertedIndex.get(t);
    if (set && set.has(itemIdx)) hits++;
  }
  return hits / qTokens.length;
}

// 关键词评分（原逻辑保留）
function keywordScore(query, item) {
  const needle = String(query || '').toLowerCase();
  const texts = [item.value, ...(item.keywords || [])].map(s => String(s).toLowerCase());
  let score = 0;
  for (const t of texts) {
    if (needle && t && (needle.includes(t) || t.includes(needle))) score += 2;
  }
  return score;
}

// 时效性评分：越新越高
function recencyScore(item) {
  const age = Date.now() - new Date(item.updatedAt || item.observedAt || Date.now()).getTime();
  const days = age / (1000 * 60 * 60 * 24);
  if (days <= 1) return 1.0;
  if (days <= 7) return 0.8;
  if (days <= 30) return 0.5;
  if (days <= 90) return 0.3;
  return 0.1;
}

// 类型加成
function typeBoost(item, query) {
  const needle = String(query || '').toLowerCase();
  const requestsPersonal = /(结合我|我的情况|适合我|方案|计划|安排|下一步|怎么选|建议|取舍)/i.test(needle);
  if (!requestsPersonal) return 0;
  if (['preference', 'goal', 'decision_rule'].includes(item.type)) return 0.5;
  return 0;
}

// 主检索函数
async function hybridRetrieve({ query, items, maxItems = 8, maxChars = 2400 }) {
  if (!items || items.length === 0) return { items: [], context: '' };

  // 建倒排索引
  const invertedIndex = buildInvertedIndex(items);

  // 生成 query embedding（如果 Ollama 可用）
  let queryEmbedding = null;
  try {
    queryEmbedding = await embed(query || '');
  } catch {
    // Ollama 不可用，降级为纯关键词
  }

  // 各项打分
  const scored = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    const kw = keywordScore(query, item);
    const emb = queryEmbedding ? 0 : 0; // 下面统一算
    const fts = ftsScore(query, item, invertedIndex, i);
    const rec = recencyScore(item);
    const tb = typeBoost(item, query);

    let embScore = 0;
    // 如果有 query embedding 且 item 有 embedding
    if (queryEmbedding && item._embedding) {
      embScore = cosineSimilarity(queryEmbedding, item._embedding);
    }

    // 高敏感度过滤：无关键词命中则不返回
    if (item.sensitivity === 'high' && kw === 0) continue;

    const finalScore = 0.25 * kw + 0.35 * embScore + 0.20 * fts + 0.10 * rec + 0.10 * tb;
    if (finalScore > 0) {
      scored.push({ item, score: finalScore });
    }
  }

  // 排序 + 预算
  scored.sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt));

  const result = [];
  let chars = 0;
  for (const { item } of scored) {
    if (result.length >= maxItems || chars + item.value.length > maxChars) break;
    result.push(item);
    chars += item.value.length;
  }

  const context = result.length > 0
    ? `<retrieved_memory do_not_store=\"true\">\n${result.map((item) => `- [${item.id}] ${item.type}: ${item.value}`).join('\n')}\n</retrieved_memory>`
    : '';

  return { items: result, context };
}

module.exports = { hybridRetrieve, tokenize, keywordScore, ftsScore, recencyScore, typeBoost };
