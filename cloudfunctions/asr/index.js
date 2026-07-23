'use strict';

/**
 * 短语音转文字。
 *
 * 使用 SCF 自动注入的临时凭证调用腾讯云“一句话识别”，不保存长期密钥。
 * 客户端上传的临时录音无论识别成功与否都会在本次调用结束前删除。
 */

const crypto = require('crypto');
const https = require('https');
const cloud = require('wx-server-sdk');
const { providerErrorCode, safeErrorCode } = require('./error-map');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const HOST = 'asr.tencentcloudapi.com';
const SERVICE = 'asr';
const ACTION = 'SentenceRecognition';
const VERSION = '2019-06-14';
const SUPPORTED_VOICE_FORMATS = new Set([
  'wav', 'pcm', 'ogg-opus', 'speex', 'silk', 'mp3', 'm4a', 'aac', 'amr',
]);

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function utcDate(timestamp) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function voiceFormat(fileId) {
  const path = String(fileId || '').split(/[?#]/, 1)[0];
  const extension = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : '';
  return SUPPORTED_VOICE_FORMATS.has(extension) ? extension : 'aac';
}

function buildSignedRequest(payload, credentials, timestamp = Math.floor(Date.now() / 1000)) {
  const body = JSON.stringify(payload);
  const date = utcDate(timestamp);
  const canonicalHeaders = [
    'content-type:application/json; charset=utf-8',
    `host:${HOST}`,
    `x-tc-action:${ACTION.toLowerCase()}`,
    '',
  ].join('\n');
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = [
    'POST', '/', '', canonicalHeaders, signedHeaders, sha256(body),
  ].join('\n');
  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256', String(timestamp), credentialScope, sha256(canonicalRequest),
  ].join('\n');
  const secretDate = hmac(`TC3${credentials.secretKey}`, date);
  const secretService = hmac(secretDate, SERVICE);
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = hmac(secretSigning, stringToSign, 'hex');
  const authorization = [
    'TC3-HMAC-SHA256',
    `Credential=${credentials.secretId}/${credentialScope},`,
    `SignedHeaders=${signedHeaders},`,
    `Signature=${signature}`,
  ].join(' ');

  const headers = {
    Authorization: authorization,
    'Content-Type': 'application/json; charset=utf-8',
    Host: HOST,
    'X-TC-Action': ACTION,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': VERSION,
    'X-TC-Region': credentials.region || 'ap-shanghai',
  };
  if (credentials.token) headers['X-TC-Token'] = credentials.token;
  return { body, headers };
}

function postJson(body, headers) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: HOST,
      path: '/',
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (_) {
          reject(new Error('ASR_INVALID_RESPONSE'));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('ASR_TIMEOUT')));
    request.on('error', reject);
    request.end(body);
  });
}

exports.main = async (event = {}) => {
  const fileId = String(event.fileId || '');
  const duration = Number(event.duration || 0);
  if (!fileId.startsWith('cloud://') || !fileId.includes('/voice/')) {
    return { ok: false, code: 'INVALID_FILE', text: '' };
  }
  if (!Number.isFinite(duration) || duration <= 0 || duration > 60) {
    return { ok: false, code: 'INVALID_DURATION', text: '' };
  }

  try {
    const secretId = process.env.TENCENTCLOUD_SECRETID;
    const secretKey = process.env.TENCENTCLOUD_SECRETKEY;
    if (!secretId || !secretKey) return { ok: false, code: 'ASR_CREDENTIAL_UNAVAILABLE', text: '' };

    const temporary = await cloud.getTempFileURL({ fileList: [fileId] });
    const url = temporary.fileList?.[0]?.tempFileURL;
    if (!url) return { ok: false, code: 'AUDIO_URL_UNAVAILABLE', text: '' };

    const payload = {
      ProjectId: 0,
      SubServiceType: 2,
      EngSerViceType: '16k_zh',
      SourceType: 0,
      VoiceFormat: voiceFormat(fileId),
      Url: url,
      FilterDirty: 1,
      FilterModal: 1,
      FilterPunc: 0,
      ConvertNumMode: 1,
    };
    const request = buildSignedRequest(payload, {
      secretId,
      secretKey,
      token: process.env.TENCENTCLOUD_SESSIONTOKEN,
      region: process.env.TENCENTCLOUD_REGION,
    });
    const result = await postJson(request.body, request.headers);
    const response = result?.Response || {};
    if (response.Error) {
      const error = new Error(response.Error.Message || response.Error.Code);
      error.code = response.Error.Code;
      error.requestId = response.RequestId;
      throw error;
    }
    const text = String(response.Result || '').trim();
    return { ok: true, code: text ? 'OK' : 'NO_SPEECH', text };
  } catch (error) {
    const code = safeErrorCode(error);
    console.error('ASR request failed', {
      code,
      providerCode: providerErrorCode(error),
      requestId: String(error?.requestId || ''),
    });
    return { ok: false, code, text: '' };
  } finally {
    try {
      await cloud.deleteFile({ fileList: [fileId] });
    } catch (_) {}
  }
};

exports.__test = { buildSignedRequest, safeErrorCode, utcDate, voiceFormat };
