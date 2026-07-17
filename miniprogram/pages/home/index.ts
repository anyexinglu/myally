import { callConversation, uploadInputFile } from '../../utils/cloud';

const WELCOME = {
  id: 'welcome', role: 'assistant', type: 'text',
  text: '早上好，我在听。想从哪里开始？', createdAt: '刚刚', fileId: '', pending: false,
};

function requestId() {
  return `wx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

Page({
  data: {
    messages: [WELCOME], conversationId: '', text: '', selectedImage: '',
    sending: false, anchor: 'message-welcome',
  },
  async onLoad() {
    const conversationId = wx.getStorageSync('myallyConversationId') || '';
    if (!conversationId) return;
    try {
      const messages = await callConversation('list', { conversationId }) as any[];
      if (messages.length) this.setData({ messages, conversationId, anchor: `message-${messages[messages.length - 1].id}` });
    } catch (_) {}
  },
  onText(event) { this.setData({ text: event.detail.value }); },
  async chooseImage() {
    try {
      const result = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] });
      this.setData({ selectedImage: result.tempFiles[0].tempFilePath });
    } catch (_) {}
  },
  clearImage() { this.setData({ selectedImage: '' }); },
  async send() {
    if (this.data.sending) return;
    const text = this.data.text.trim();
    const localImage = this.data.selectedImage;
    if (!text && !localImage) return;
    const id = requestId();
    const optimistic = {
      id: `local-${id}`, role: 'user', type: localImage ? 'image' : 'text',
      text, fileId: localImage, createdAt: '刚刚', pending: true,
    };
    const messages = [...this.data.messages, optimistic];
    this.setData({ messages, text: '', selectedImage: '', sending: true, anchor: `message-${optimistic.id}` });
    try {
      const fileId = localImage ? await uploadInputFile(localImage, 'image') : '';
      const turn = await callConversation('send', { payload: {
        requestId: id, conversationId: this.data.conversationId,
        type: localImage ? 'image' : 'text', text, fileId,
      } }) as any;
      const next = [...messages.slice(0, -1), turn.userMessage, turn.assistantMessage];
      wx.setStorageSync('myallyConversationId', turn.conversationId);
      this.setData({ messages: next, conversationId: turn.conversationId, anchor: `message-${turn.assistantMessage.id}` });
    } catch (error) {
      this.setData({ messages: [...messages.slice(0, -1), { ...optimistic, pending: false, failed: true }] });
      wx.showToast({ title: error.message || '发送失败，请稍后再试', icon: 'none' });
    } finally {
      this.setData({ sending: false });
    }
  },
  goMine() { wx.redirectTo({ url: '/pages/mine/index' }); },
  goWatch() { wx.redirectTo({ url: '/pages/watch/index' }); },
});
