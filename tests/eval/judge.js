'use strict';

/**
 * LLM-Judge — 使用 DeepSeek-chat 评估回答质量
 */

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

// 从 ~/.hermes/.env 读取 API Key
function loadApiKey() {
  try {
    const envPath = path.join(require('node:os').homedir(), '.hermes', '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [k, ...v] = trimmed.split('=');
      if (k.trim() === 'DEEPSEEK_API_KEY') {
        return v.join('=').replace(/^["']|["']$/g, '').trim();
      }
    }
  } catch {}
  return process.env.DEEPSEEK_API_KEY || '';
}

function judgeCall(messages) {
  return new Promise((resolve, reject) => {
    const apiKey = loadApiKey();
    if (!apiKey) return reject(new Error('DEEPSEEK_API_KEY 未配置'));

    const data = JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.3,
      max_tokens: 200,
    });

    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 30000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const text = parsed.choices?.[0]?.message?.content || '';
          resolve(text);
        } catch {
          reject(new Error(`Judge 响应解析失败: ${body.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Judge 请求超时')); });
    req.write(data);
    req.end();
  });
}

/**
 * 对回答进行质量评分
 * @param {string} userMessage - 用户的问题
 * @param {string} assistantReply - "我在"的回答
 * @returns {Promise<{usefulness: number, personalization: number, raw: string}>}
 */
async function rateResponse(userMessage, assistantReply) {
  const prompt = `你是一个AI对话质量评估员。请评估以下对话中助理回复的质量。

## 用户消息
${userMessage}

## 助理回复
${assistantReply}

## 评估维度（每项1-5分）
1. 实用度：回复是否提供了可执行的具体建议或清晰的分析？
2. 个性化：回复是否使用了用户提到的个人情况？

## 输出格式（只输出JSON，不要解释）
{"usefulness": <1-5>, "personalization": <1-5>}`;

  try {
    const raw = await judgeCall([
      { role: 'system', content: '你是一个严格的AI对话质量评估员。只输出JSON分数，不解释。' },
      { role: 'user', content: prompt },
    ]);

    // 解析JSON分数
    const jsonMatch = raw.match(/\{[\s\S]*"usefulness"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        usefulness: Math.min(5, Math.max(1, Math.round(parsed.usefulness || 3))),
        personalization: Math.min(5, Math.max(1, Math.round(parsed.personalization || 3))),
        raw,
      };
    }
  } catch (err) {
    return { usefulness: 0, personalization: 0, raw: `Judge错误: ${err.message}` };
  }

  return { usefulness: 3, personalization: 3, raw };
}

module.exports = { rateResponse };
