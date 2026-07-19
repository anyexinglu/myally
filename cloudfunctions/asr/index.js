'use strict';

/**
 * ASR 云函数 v2 — 语音转文字
 *
 * 方案：
 *   1. 上传录音到 CloudBase
 *   2. 下载音频
 *   3. 通过 CloudBase AI API 尝试转写
 *   4. 失败时返回提示
 */

const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { fileId, duration = 5 } = event;
  if (!fileId) return { ok: false, code: 'NO_FILE', text: '' };

  try {
    // 获取音频临时 URL
    const tmpUrl = await cloud.getTempFileURL({ fileList: [fileId] });
    const url = tmpUrl.fileList?.[0]?.tempFileURL;
    if (!url) return { ok: false, code: 'NO_URL', text: '' };

    // 方案 A：通过 CloudBase AI 多模态能力（将音频 URL 发给模型）
    try {
      const ai = cloud.ai();
      const model = ai.createModel('cloudbase');
      const result = await model.generateText({
        model: 'kimi-k3',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '请将这段语音内容转写为准确的中文文字。只输出转写结果，不要解释。' },
              { type: 'file_url', file_url: { url } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 500,
      });
      if (result?.text?.trim()) return { ok: true, text: result.text.trim() };
    } catch (_) {
      // fall through
    }

    // 方案 B：下载音频并尝试通过 Tencent Cloud ASR
    try {
      const audioBuf = await new Promise((resolve, reject) => {
        https.get(url, (res) => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
      });

      // 使用 cloud.openapi 调用微信内置语音识别（如果支持）
      try {
        const result = await cloud.openapi.ai.audioTranslate({
          fileId,
          duration: Math.max(duration, 1),
          source: 'voice_input',
        });
        if (result?.text?.trim()) return { ok: true, text: result.text.trim() };
      } catch (_) {}

      // ASR 不可用，返回音频信息方便调试
      return {
        ok: false,
        code: 'ASR_UNAVAILABLE',
        text: '',
        hint: '语音已录制，请在 CloudBase 控制台开通语音识别服务',
        audioUrl: url,
        audioSize: audioBuf.length,
      };
    } catch (_) {
      return { ok: false, code: 'DOWNLOAD_FAILED', text: '' };
    }
  } catch (err) {
    return { ok: false, code: 'ERROR', text: '', error: err.message };
  }
};
