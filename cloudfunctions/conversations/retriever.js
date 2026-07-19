'use strict';

/**
 * Retriever — 混合检索包装器（CloudBase 版）
 *
 * 使用 Kimi K3 做语义评分，不需要外部 embedding 服务。
 */

const { hybridRetrieve } = require('./hybrid-retriever');

class Retriever {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
  }

  async retrieve({ query, items, maxItems = 8, maxChars = 2400 }) {
    if (!this.enabled || !items || items.length === 0) {
      return { items: [], context: '' };
    }
    return hybridRetrieve({ query, items, maxItems, maxChars });
  }
}

module.exports = { Retriever };
