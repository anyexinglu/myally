import { callEntries } from '../../utils/cloud';

Page({
  data: { entries: [], loading: false, denied: false, error: '' },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, denied: false, error: '' });
    try { this.setData({ entries: await callEntries('listShared') }); }
    catch (error) {
      this.setData({ denied: error.code === 'FORBIDDEN', error: error.code === 'FORBIDDEN' ? '' : (error.message || '加载失败') });
    } finally { this.setData({ loading: false }); }
  },
  goHome() { wx.switchTab({ url: '/pages/home/index' }); },
  goMine() { wx.switchTab({ url: '/pages/mine/index' }); },
});
