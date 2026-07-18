'use strict';

/**
 * Embedder — 调用本地 Ollama bge-m3 生成中文 Embedding
 */

const http = require('node:http');

const OLLAMA_URL = 'http://localhost:11434';
const EMBED_MODEL = 'bge-m3';

async function embed(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model: EMBED_MODEL, input: text });
    const url = new URL('/api/embed', OLLAMA_URL);
    const req = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const embedding = parsed.embeddings?.[0];
          if (embedding && Array.isArray(embedding)) resolve(embedding);
          else reject('no embedding in response');
        } catch { reject('parse failed'); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject('timeout'); });
    req.write(payload);
    req.end();
  });
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

module.exports = { embed, cosineSimilarity, OLLAMA_URL, EMBED_MODEL };
