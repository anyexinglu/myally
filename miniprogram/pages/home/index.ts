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
    sending: false, anchor: 'message-welcome', temporary: false,
  },
  async onLoad() {
    await this.loadNormalConversation();
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
  async toggleTemporary(event) {
    const temporary = !!event.detail.value;
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
        type: localImage ? 'image' : 'text', text, fileId, temporary: this.data.temporary,
      } }) as any;
      const assistant = decorate({
        ...turn.assistantMessage,
        memoryCount: (turn.usedMemories || []).length,
        memoryStatus: turn.memoryStatus,
      });
      const next = [...messages.slice(0, -1), decorate(turn.userMessage), assistant];
      if (!this.data.temporary) wx.setStorageSync('myallyConversationId', turn.conversationId);
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
