import { CLOUD_ENV_ID } from './config/env';

App({
  globalData: {
    // 精选页技能专区点击后暂存的技能对象，由聊天页 onShow 消费并清空
    pendingSkill: null as null | {
      id: string; name: string; emoji: string;
      welcomeMessage: string; systemPrompt: string;
    },
  },
  onLaunch() {
    if (!wx.cloud) throw new Error('请使用支持云开发的微信基础库');
    wx.cloud.init({ env: CLOUD_ENV_ID || undefined, traceUser: true });
  },
});
