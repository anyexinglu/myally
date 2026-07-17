type EntriesResult = {
  ok: boolean;
  data?: unknown;
  message?: string;
  code?: string;
};

type CodedError = Error & { code?: string };

export async function callEntries(action, data = {}) {
  const response = await wx.cloud.callFunction({
    name: 'entries',
    data: { action, ...data },
  });
  const result = response.result as EntriesResult;
  if (!result || !result.ok) {
    const error = new Error((result && result.message) || '请求失败') as CodedError;
    error.code = result && result.code;
    throw error;
  }
  return result.data;
}

export async function uploadInputFile(tempFilePath, type) {
  const extension = tempFilePath.includes('.') ? tempFilePath.split('.').pop() : 'dat';
  const cloudPath = `inputs/${type}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const result = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath });
  return result.fileID;
}
