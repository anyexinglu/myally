'use strict';

class WechatContentModerator {
  constructor({ openapi }) {
    this.openapi = openapi;
  }

  async checkText(text, { ownerId } = {}) {
    if (!String(text || '').trim()) return { allowed: true, suggest: 'pass' };
    if (!this.openapi || !this.openapi.security || typeof this.openapi.security.msgSecCheck !== 'function') {
      throw new Error('content safety service is unavailable');
    }
    const response = await this.openapi.security.msgSecCheck({
      content: String(text).trim(),
      version: 2,
      scene: 2,
      openid: ownerId,
    });
    const suggest = response && response.result && response.result.suggest;
    return { allowed: suggest === 'pass', suggest: suggest || 'unknown' };
  }
}

module.exports = { WechatContentModerator };
