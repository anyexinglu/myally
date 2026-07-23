'use strict';

function providerErrorCode(error) {
  return String(error?.code || error?.message || 'ASR_FAILED');
}

function safeErrorCode(error) {
  const code = providerErrorCode(error);

  if (/^(UnauthorizedOperation|OperationDenied|PermissionDenied|UnsupportedOperation)/i.test(code)) {
    return 'ASR_PERMISSION_REQUIRED';
  }
  if (/^AuthFailure\./i.test(code)) return 'ASR_CREDENTIAL_INVALID';
  if (/^FailedOperation\.UserNotRegistered$/i.test(code)) return 'ASR_NOT_ACTIVATED';
  if (/^FailedOperation\.(UserHasNoAmount|UserHasNoFreeAmount)$/i.test(code)
      || /^(LimitExceeded|RequestLimitExceeded)/i.test(code)) {
    return 'ASR_QUOTA_EXHAUSTED';
  }
  if (/^FailedOperation\.ServiceIsolate$/i.test(code)) return 'ASR_BILLING_SUSPENDED';
  if (/^(InternalError\.ErrorDownFile|InvalidParameterValue\.ErrorInvalidUrl)$/i.test(code)) {
    return 'ASR_AUDIO_UNAVAILABLE';
  }
  if (/^(FailedOperation\.ErrorRecognize|InvalidParameterValue\.ErrorInvalidVoiceFormat|InvalidParameterValue\.ErrorInvalidVoicedata)$/i.test(code)) {
    return 'ASR_AUDIO_INVALID';
  }
  if (/TIMEOUT/i.test(code)) return 'ASR_TIMEOUT';
  return 'ASR_FAILED';
}

module.exports = { providerErrorCode, safeErrorCode };
