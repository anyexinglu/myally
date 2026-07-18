'use strict';

/**
 * Retriever — 混合检索包装器
 *
 * 管理 embedding 缓存，调用 hybrid-retriever 做实际检索
 */

const { embed } = require('./embedder');
const { hybridRetrieve } = require('./hybrid-retriever');

class Retriever {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this._embeddingCache = new Map(); // memoryItemId → embedding vector
    this._pendingEmbeds = new Map();  // memoryItemId → Promise (去重)
  }

  /**
   * 为一条记忆生成并缓存 embedding
   */
  async ensureEmbedding(item) {
    if (!item || !item.id || !item.value) return;
    if (this._embeddingCache.has(item.id)) return;

    // 去重，避免并发重复请求
    if (this._pendingEmbeds.has(item.id)) {
      await this._pendingEmbeds.get(item.id);
      return;
    }

    const promise = (async () => {
      try {
        const vector = await embed(item.value);
        this._embeddingCache.set(item.id, vector);
        item._embedding = vector;
      } catch {
        // embedding 失败不影响主流程
      }
    })();

    this._pendingEmbeds.set(item.id, promise);
    await promise;
    this._pendingEmbeds.delete(item.id);
  }

  /**
   * 为多条记忆批量生成 embedding
   */
  async ensureEmbeddings(items) {
    const promises = items.map(item => this.ensureEmbedding(item).catch(() => {}));
    await Promise.all(promises);
  }

  /**
   * 主检索入口
   */
  async retrieve({ query, items, maxItems = 8, maxChars = 2400 }) {
    if (!this.enabled || !items || items.length === 0) {
      return { items: [], context: '' };
    }

    // 先为所有 items 生成 embedding（异步，并发）
    await this.ensureEmbeddings(items);

    // 调用混合检索
    return hybridRetrieve({ query, items, maxItems, maxChars });
  }
}

module.exports = { Retriever };
