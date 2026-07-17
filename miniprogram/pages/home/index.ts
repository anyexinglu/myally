import { callEntries, uploadInputFile } from '../../utils/cloud';

const recorder = wx.getRecorderManager();

Page({
  data: {
    type: 'text', text: '', tempFilePath: '', recording: false,
    shared: false, summary: '', saving: false,
  },
  onLoad() {
    recorder.onStop((result) => this.setData({ tempFilePath: result.tempFilePath, recording: false }));
    recorder.onError(() => {
      this.setData({ recording: false });
      wx.showToast({ title: '录音失败', icon: 'none' });
    });
  },
  selectType(event) {
    this.setData({ type: event.currentTarget.dataset.type, tempFilePath: '' });
  },
  onText(event) { this.setData({ text: event.detail.value }); },
  onSummary(event) { this.setData({ summary: event.detail.value }); },
  onShared(event) { this.setData({ shared: event.detail.value }); },
  toggleRecording() {
    if (this.data.recording) {
      recorder.stop();
    } else {
      this.setData({ tempFilePath: '', recording: true });
      recorder.start({ format: 'mp3', duration: 60000 });
    }
  },
  async chooseImage() {
    const result = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'] });
    this.setData({ tempFilePath: result.tempFiles[0].tempFilePath });
  },
  async save() {
    if (this.data.saving) return;
    if (this.data.shared && !this.data.summary.trim()) {
      wx.showToast({ title: '请填写给照护者看的摘要', icon: 'none' }); return;
    }
    if (this.data.type === 'text' && !this.data.text.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' }); return;
    }
    if (this.data.type !== 'text' && !this.data.tempFilePath) {
      wx.showToast({ title: this.data.type === 'voice' ? '请先录音' : '请先选择图片', icon: 'none' }); return;
    }
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中' });
    try {
      let fileId = '';
      if (this.data.type !== 'text') fileId = await uploadInputFile(this.data.tempFilePath, this.data.type);
      await callEntries('create', {
        payload: {
          type: this.data.type,
          text: this.data.type === 'text' ? this.data.text : '',
          fileId,
          visibility: this.data.shared ? 'shared' : 'private',
          summary: this.data.shared ? this.data.summary : '',
        },
      });
      this.setData({ text: '', tempFilePath: '', summary: '', shared: false });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading(); this.setData({ saving: false });
    }
  },
  goMine() { wx.navigateTo({ url: '/pages/mine/index' }); },
  goWatch() { wx.navigateTo({ url: '/pages/watch/index' }); },
});
