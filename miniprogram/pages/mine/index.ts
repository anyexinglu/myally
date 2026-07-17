import { callEntries } from '../../utils/cloud';

const audio = wx.createInnerAudioContext();

Page({
  data: { entries: [], loading: false, error: '' },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try { this.setData({ entries: await callEntries('listMine') }); }
    catch (error) { this.setData({ error: error.message || '加载失败' }); }
    finally { this.setData({ loading: false }); }
  },
  async remove(event) {
    const entryId = event.currentTarget.dataset.id;
    const answer = await wx.showModal({ title: '删除这条记录？', content: '删除后无法恢复。' });
    if (!answer.confirm) return;
    try { await callEntries('remove', { entryId }); await this.load(); }
    catch (error) { wx.showToast({ title: error.message || '删除失败', icon: 'none' }); }
  },
  async play(event) {
    const fileId = event.currentTarget.dataset.file;
    const result = await wx.cloud.getTempFileURL({ fileList: [fileId] });
    audio.src = result.fileList[0].tempFileURL;
    audio.play();
  },
  goHome() { wx.redirectTo({ url: '/pages/home/index' }); },
  goWatch() { wx.redirectTo({ url: '/pages/watch/index' }); },
});
