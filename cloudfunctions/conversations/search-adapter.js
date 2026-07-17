'use strict';

const https = require('node:https');

class HttpSearchAdapter {
  constructor({ endpoint, apiKey = '', timeoutMs = 8000 }) {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') throw new Error('search endpoint must use https');
    this.url = url;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async search(query) {
    if (!String(query || '').trim()) return [];
    const body = JSON.stringify({ query: String(query).trim(), maxResults: 5 });
    return new Promise((resolve, reject) => {
      const request = https.request(this.url, {
        method: 'POST', timeout: this.timeoutMs,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
      }, (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { raw += chunk; });
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error('search request failed'));
          try {
            const parsed = JSON.parse(raw);
            const results = Array.isArray(parsed) ? parsed : parsed.results;
            resolve(Array.isArray(results) ? results.slice(0, 5) : []);
          } catch (_) { reject(new Error('search response is invalid')); }
        });
      });
      request.on('timeout', () => request.destroy(new Error('search request timed out')));
      request.on('error', reject);
      request.end(body);
    });
  }
}

module.exports = { HttpSearchAdapter };
