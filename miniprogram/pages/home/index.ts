import { callConversation, uploadInputFile } from '../../utils/cloud';

const WELCOME = {
  id: 'welcome', role: 'assistant', type: 'text',
  text: '早上好，我在听。想从哪里开始？', createdAt: '刚刚', fileId: '', pending: false,
  memoryCount: 0, toolCalls: [],
};
const TEMP_WELCOME = {
  ...WELCOME, id: 'temp-welcome', text: '临时对话已开启：这次不会读取或形成长期记忆。',
};

function decorate(message) {
  const refs = message && message.agent && Array.isArray(message.agent.memoryRefs) ? message.agent.memoryRefs : [];
  const tools = message && message.agent && Array.isArray(message.agent.toolCalls) ? message.agent.toolCalls : [];
  return { ...message, memoryCount: refs.length, toolCalls: tools };
}

function requestId() {
  return `wx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

Page({
  data: {
    messages: [WELCOME], conversationId: '', text: '', selectedImage: '',
    sending: false, anchor: 'message-welcome', temporary: false, headerTop: 44,
  },
  async onLoad() {
    this.syncChromeMetrics();
    await this.loadNormalConversation();
  },
  syncChromeMetrics() {
    try {
      const capsule = wx.getMenuButtonBoundingClientRect();
      const system = wx.getSystemInfoSync();
      const fallbackTop = (system.statusBarHeight || 20) + 4;
      this.setData({ headerTop: Math.max(capsule.top || 0, fallbackTop) });
    } catch (_) {
      this.setData({ headerTop: 44 });
    }
  },
  async loadNormalConversation() {
    const conversationId = wx.getStorageSync('myallyConversationId') || '';
    if (!conversationId) {
      this.setData({ messages: [WELCOME], conversationId: '', anchor: 'message-welcome' });
      return;
    }
    try {
      const messages = await callConversation('list', { conversationId }) as any[];
      if (messages.length) {
        const decorated = messages.map(decorate);
        this.setData({ messages: decorated, conversationId, anchor: `message-${decorated[decorated.length - 1].id}` });
      }
    } catch (_) {}
  },
  async toggleTemporary() {
    if (this.data.sending) return;
    const temporary = !this.data.temporary;
    if (temporary) {
      this.setData({ temporary: true, conversationId: '', messages: [TEMP_WELCOME], anchor: 'message-temp-welcome' });
    } else {
      this.setData({ temporary: false });
      await this.loadNormalConversation();
    }
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
    const draft = {
      id: `local-${id}`, role: 'user', type: localImage ? 'image' : 'text',
      text, fileId: localImage, localImage, uploadedFileId: '', requestId: id,
      conversationId: this.data.conversationId, temporary: this.data.temporary,
      createdAt: '刚刚', pending: true, failed: false,
    };
    const messages = [...this.data.messages, draft];
    this.setData({ messages, text: '', selectedImage: '', sending: true, anchor: `message-${draft.id}` });
    await this.deliverDraft(draft, messages);
  },
  async retrySend(event) {
    if (this.data.sending) return;
    const id = event.currentTarget.dataset.id;
    const draft = this.data.messages.find((item) => item.id === id && item.failed);
    if (!draft) return;
    if (!!draft.temporary !== !!this.data.temporary) {
      wx.showToast({ title: '请先切回原对话模式再重试', icon: 'none' });
      return;
    }
    const messages = this.data.messages.map((item) => item.id === id ? { ...item, pending: true, failed: false } : item);
    const pendingDraft = messages.find((item) => item.id === id);
    this.setData({ messages, sending: true, anchor: `message-${id}` });
    await this.deliverDraft(pendingDraft, messages);
  },
  async deliverDraft(draft, messages) {
    let uploadedFileId = draft.uploadedFileId || '';
    try {
      if (!uploadedFileId && draft.localImage) uploadedFileId = await uploadInputFile(draft.localImage, 'image');
      const turn = await callConversation('send', { payload: {
        requestId: draft.requestId, conversationId: draft.conversationId,
        type: draft.type, text: draft.text, fileId: uploadedFileId, temporary: draft.temporary,
      } }) as any;
      const assistant = decorate({
        ...turn.assistantMessage,
        memoryCount: (turn.usedMemories || []).length,
        memoryStatus: turn.memoryStatus,
      });
      const next = messages.flatMap((item) => item.id === draft.id
        ? [decorate(turn.userMessage), assistant]
        : [item]);
      if (!draft.temporary) wx.setStorageSync('myallyConversationId', turn.conversationId);
      this.setData({ messages: next, conversationId: turn.conversationId, anchor: `message-${turn.assistantMessage.id}` });
    } catch (error) {
      const failed = messages.map((item) => item.id === draft.id
        ? { ...item, uploadedFileId, pending: false, failed: true }
        : item);
      this.setData({ messages: failed, anchor: `message-${draft.id}` });
      wx.showToast({ title: error.message || '发送失败，请稍后再试', icon: 'none' });
    } finally {
      this.setData({ sending: false });
    }
  },
  goMine() { wx.redirectTo({ url: '/pages/mine/index' }); },
  goWatch() { wx.redirectTo({ url: '/pages/watch/index' }); },
});
