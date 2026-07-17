import { CLOUD_ENV_ID } from './config/env';

App({
  onLaunch() {
    if (!wx.cloud) throw new Error('请使用支持云开发的微信基础库');
    wx.cloud.init({ env: CLOUD_ENV_ID || undefined, traceUser: true });
  },
});
