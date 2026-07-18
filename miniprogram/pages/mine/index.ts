import { callConversation, callEntries } from '../../utils/cloud';

const audio = wx.createInnerAudioContext();

Page({
  data: { entries: [], memories: [], tasks: [], loading: false, error: '' },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const [entries, memories, tasks] = await Promise.all([
        callEntries('listMine'), callConversation('listMemories'),
        callConversation('listPendingTasks').catch(() => []),
      ]);
      this.setData({ entries, memories, tasks });
    }
    catch (error) { this.setData({ error: error.message || '加载失败' }); }
    finally { this.setData({ loading: false }); }
  },
  async completeTask(event) {
    const taskId = event.currentTarget.dataset.id;
    try {
      await callConversation('completeTask', { taskId });
      wx.showToast({ title: '任务已标记完成', icon: 'success' });
      await this.load();
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    }
  },
  async remove(event) {
    const entryId = event.currentTarget.dataset.id;
    const answer = await wx.showModal({ title: '删除这条记录？', content: '删除后无法恢复。' });
    if (!answer.confirm) return;
    try { await callEntries('remove', { entryId }); await this.load(); }
    catch (error) { wx.showToast({ title: error.message || '删除失败', icon: 'none' }); }
  },
  async removeMemory(event) {
    const memoryId = event.currentTarget.dataset.id;
    const answer = await wx.showModal({ title: '删除这条记忆？', content: '删除后，后续回答将不再使用它。' });
    if (!answer.confirm) return;
    try { await callConversation('deleteMemory', { memoryId }); await this.load(); }
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
  goDevTest() { wx.navigateTo({ url: '/pages/devtest/index' }); },
});
