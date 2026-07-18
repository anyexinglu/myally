'use strict';

/**
 * RealModelAdapter — 通过真实模型 API 驱动「我在」对话流水线
 *
 * 当前后端：DeepSeek API（混元上线后可替换为 CloudBase AI）
 * 接口兼容：AgentOrchestrator.model.next() + MemoryObserver.model.extractMemories()
 */

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

// ======== API 调用 ========

function loadApiConfig() {
  // 优先从 HERMES .env 读取
  try {
    const envPath = path.join(require('node:os').homedir(), '.hermes', '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (k === 'DEEPSEEK_API_KEY') return { key: v, baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' };
      if (k === 'KIMI_CN_API_KEY') return { key: v, baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.5' };
    }
  } catch {}
  return { key: process.env.MYALLY_API_KEY || '', baseUrl: process.env.MYALLY_API_BASE || 'https://api.deepseek.com/v1', model: process.env.MYALLY_MODEL || 'deepseek-chat' };
}

function apiCall(messages, systemPrompt, temperature = 0.7) {
  return new Promise((resolve, reject) => {
    const config = loadApiConfig();
    if (!config.key) return reject(new Error('API Key 未配置。请设置 DEEPSEEK_API_KEY 或 KIMI_CN_API_KEY'));

    const payload = JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      temperature,
      max_tokens: 4096,
    });

    const url = new URL('/v1/chat/completions', config.baseUrl);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.key}`,
      },
      timeout: 60000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const text = parsed.choices?.[0]?.message?.content || '';
          resolve(text);
        } catch {
          reject(new Error(`API 响应解析失败: ${body.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('API 请求超时')); });
    req.write(payload);
    req.end();
  });
}

// ======== System Prompt ========

const SYSTEM_PROMPT = `你是「我在」AI 助理，用户的长期 AI 伙伴。

## 行为准则
1. 先理解，再回答。用户可能没有把问题说清楚，先确认理解再给建议。
2. 给出可执行的具体建议，而不是空泛的道理。
3. 不迎合。如果用户的想法有风险或不合理，坦诚指出。
4. 使用用户提到的个人情况，让回答有针对性。
5. 用中文回答，简洁直接。

## 输出格式
你的回答直接是对话文本，不要用 JSON 包裹。`;

const MEMORY_EXTRACT_PROMPT = `从用户的这段话中提取可作为长期记忆的事实、偏好、目标和决策规则。

输出 JSON 数组，每项包含：
- type: "stable_fact" | "preference" | "goal" | "decision_rule"
- value: 简洁的中文描述（20字以内）
- keywords: 2-4个相关关键词（用于后续检索）
- confidence: "high" | "medium" | "low"
- sourceType: "explicit_user_statement"（只提取用户明确陈述的内容）

只输出 JSON 数组，不要解释。如果没有可提取的内容，输出 [].`;

// ======== ModelAdapter 类 ========

class RealModelAdapter {
  constructor() {
    this.config = loadApiConfig();
    this.modelName = this.config.model;
  }

  // AgentOrchestrator 调用的 next() 方法
  async next(input) {
    const { input: userInput, history = [], memoryContext = [] } = input;

    // 构建对话历史
    const messages = [];
    for (const msg of history.slice(-20)) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.text || '' });
      } else if (msg.role === 'assistant') {
        messages.push({ role: 'assistant', content: msg.text || '' });
      }
    }

    // 注入记忆上下文
    let systemExtras = '';
    if (memoryContext && memoryContext.length > 0) {
      const memos = memoryContext.map(m => `[${m.type}] ${m.value}`).join('\n');
      systemExtras = `\n\n## 关于这个用户，你已经知道的信息：\n${memos}\n\n在回答时结合这些信息，但不要直接引用"根据你之前的记忆"这类话。`;
    }

    // 添加当前用户输入
    messages.push({ role: 'user', content: userInput.text || '' });

    try {
      const reply = await apiCall(messages, SYSTEM_PROMPT + systemExtras, 0.7);
      this._lastReply = reply;
      return { type: 'final', text: reply };
    } catch (err) {
      return { type: 'final', text: `抱歉，我现在暂时无法回复（${err.message}）。请稍后再试。` };
    }
  }

  // MemoryObserver 调用的 extractMemories() 方法
  async extractMemories({ text }) {
    if (!text || text.length < 5) return { candidates: [] };

    try {
      const raw = await apiCall(
        [{ role: 'user', content: text }],
        MEMORY_EXTRACT_PROMPT,
        0.3,
      );
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const candidates = JSON.parse(jsonMatch[0]);
        return { candidates: Array.isArray(candidates) ? candidates : [] };
      }
    } catch {}
    return { candidates: [] };
  }

  get provider() { return 'real-api'; }
  get model() { return this.modelName; }
}

module.exports = { RealModelAdapter };
