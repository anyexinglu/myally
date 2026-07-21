Page({
  data: { debugOn: false },
  onLoad() {
    this.setData({ debugOn: !!wx.getStorageSync('debug_onboard') });
  },
  toggleDebug(e: any) {
    const on = e.detail.value;
    if (!on) {
      // 关闭调试 → 清除所有本地调试数据
      wx.removeStorageSync('debug_onboard');
      wx.removeStorageSync('debug_profile');
      wx.showToast({ title: '已退出调试', icon: 'success' });
    }
    this.setData({ debugOn: on });
  },
  startOnboarding() {
    wx.setStorageSync('debug_onboard', true);
    wx.removeStorageSync('debug_profile');
    wx.showToast({ title: '已重置，下次进入弹出问卷' });
  },
});
