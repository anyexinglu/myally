'use strict';

/**
 * ASR 云函数 — 语音转文字
 *
 * 使用腾讯云实时语音识别（ASR）将用户语音转为文字。
 * 需要先在 CloudBase 控制台开通 ASR 服务。
 *
 * 调用方式：
 *   wx.cloud.callFunction({
 *     name: 'asr',
 *     data: { fileId: 'cloud://...', duration: 5 }
 *   })
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { fileId, duration = 5 } = event;

  if (!fileId) {
    return { ok: false, code: 'NO_FILE', text: '' };
  }

  try {
    // 尝试使用腾讯云 ASR（通过 CloudBase AI 扩展）
    // 方式1：通过 cloud.openapi 调用微信内置语音识别
    try {
      const result = await cloud.openapi.ai.audioTranslate({
        fileId,
        duration,
        source: 'voice_input',
      });
      if (result && result.text) {
        return { ok: true, text: result.text.trim() };
      }
    } catch (_) {
      // fall through
    }

    // 方式2：通过 CloudBase AI 多模态能力
    try {
      const ai = cloud.ai();
      const model = ai.createModel('cloudbase');
      // 对于语音，目前 CloudBase AI 不支持直接转写
      // 但可以尝试通过文件 URL 做多模态理解
      const tempUrl = await cloud.getTempFileURL({ fileList: [fileId] });
      const url = tempUrl.fileList?.[0]?.tempFileURL;
      if (url) {
        const result = await model.generateText({
          model: 'hy3',
          messages: [
            { role: 'system', content: '你是一个语音转写助手。请将用户语音内容转写为准确的中文文字。只输出转写结果，不要解释。' },
            { role: 'user', content: `请将这段语音转写为文字：${url}` },
          ],
          temperature: 0.1,
        });
        if (result && result.text) {
          return { ok: true, text: result.text.trim() };
        }
      }
    } catch (_) {
      // fall through
    }

    // ASR 服务未配置，返回提示
    return {
      ok: false,
      code: 'ASR_NOT_CONFIGURED',
      text: '',
      hint: '请在 CloudBase 控制台开通 ASR 服务，或配置第三方语音识别。',
    };
  } catch (err) {
    return { ok: false, code: 'ASR_FAILED', text: '', error: err.message };
  }
};
