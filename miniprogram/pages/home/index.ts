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
    recording: false, recordingDuration: 0, swipeUp: false,
    streamingText: '', streamingMessageId: '',
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

      // 流式展示：逐字显示助手回复
      const fullText = turn.assistantMessage?.text || '';
      const streamId = `stream-${turn.assistantMessage?.id || Date.now()}`;
      this.setData({
        streamingMessageId: streamId,
        streamingText: '',
        sending: false,
      });

      // 先插入空白占位消息
      const placeholder = decorate({
        ...turn.assistantMessage,
        id: streamId,
        text: '▍',
        streaming: true,
      });
      const withPlaceholder = messages.flatMap((item) => item.id === draft.id
        ? [decorate(turn.userMessage), placeholder]
        : [item]);
      if (!draft.temporary) wx.setStorageSync('myallyConversationId', turn.conversationId);
      this.setData({ messages: withPlaceholder, conversationId: turn.conversationId, anchor: `message-${streamId}` });

      // 逐字打字效果
      if (fullText.length > 0) {
        let displayed = '';
        const charsPerTick = 3; // 每帧展示字数
        for (let i = 0; i < fullText.length; i += charsPerTick) {
          displayed = fullText.slice(0, i + charsPerTick);
          const suffix = i + charsPerTick < fullText.length ? '▍' : '';
          const updated = this.data.messages.map((item: any) =>
            item.id === streamId ? { ...item, text: displayed + suffix, streaming: i + charsPerTick < fullText.length } : item
          );
          this.setData({ messages: updated, anchor: `message-${streamId}` });
          await new Promise(r => setTimeout(r, 20)); // 20ms 间隔
        }
        // 最终替换为完整消息（去掉 streaming 标记）
        const final = this.data.messages.map((item: any) =>
          item.id === streamId
            ? decorate({ ...turn.assistantMessage, memoryCount: (turn.usedMemories || []).length, memoryStatus: turn.memoryStatus })
            : item
        );
        this.setData({ messages: final, streamingMessageId: '', anchor: `message-${turn.assistantMessage.id}` });
      }
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

  // ======== 语音输入（微信风格） ========
  _recorder: null as any,
  _recordTimer: null as any,
  _startY: 0,
  _voiceTempFile: '',

  onVoiceStart(e: any) {
    if (this.data.sending) return;

    // 直接尝试录音（微信会自动触发权限请求）
    // 不先调 wx.authorize，因为 iOS 上可能不生效
    this.startRecording(e);
  },

  startRecording(e: any) {
    this._startY = e.touches[0].clientY;
    this._voiceTempFile = '';
    this.setData({ recording: true, recordingDuration: 0, swipeUp: false });

    // iOS 音频会话初始化——播放一段静音后马上停止，激活音频会话
    try {
      const ctx = wx.createInnerAudioContext();
      ctx.autoplay = true;
      ctx.src = 'data:audio/mp3,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI1LjEwNAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYlmKQsAAAAAAD/+1DEAAAHAAb/AAAAIAAAQgAAABIgAABAAAABAAAAAJCU9PTkRFUjEwMABDb21tZW50AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/tQxAAAAGAAb/AAAACAABCAAAEiAAAEAAAABAAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg';
      setTimeout(() => { ctx.destroy(); }, 100);
    } catch(_) {}

    try {
      const recorder = wx.getRecorderManager();
      this._recorder = recorder;

      recorder.onStart(() => {
        let duration = 0;
        this._recordTimer = setInterval(() => {
          duration++;
          this.setData({ recordingDuration: duration });
          if (duration >= 60) this.onVoiceEnd();
        }, 1000);
      });

      recorder.onStop((res) => {
        this._voiceTempFile = res.tempFilePath || '';
      });

      recorder.onError((err) => {
        this.endRecording();
        const errMsg = (err as any)?.errMsg || String(err);
        // 用 toast 显示前 80 字符的错误详情
        wx.showModal({
          title: '录音失败',
          content: `错误：${errMsg.slice(0, 80)}`,
          confirmText: '知道了',
        });
      });

      // 尝试不同参数兼容 iOS
      recorder.start({ format: 'aac', sampleRate: 44100, numberOfChannels: 1 });
    } catch (ex: any) {
      this.endRecording();
      wx.showModal({
        title: '录音不可用',
        content: '您的设备暂不支持录音，建议直接用文字输入。',
        confirmText: '知道了',
      });
    }
  },

  onVoiceMove(e: any) {
    const y = e.touches[0].clientY;
    this.setData({ swipeUp: this._startY - y > 80 });
  },

  async onVoiceEnd() {
    this.endRecording();

    if (this.data.swipeUp) {
      wx.showToast({ title: '已取消', icon: 'none' });
      return;
    }

    // 等待 onStop 回调写入 tempFilePath
    await new Promise(r => setTimeout(r, 200));

    if (!this._voiceTempFile) {
      wx.showToast({ title: '未获取到录音', icon: 'none' });
      return;
    }

    // 上传 + ASR 转写
    try {
      wx.showLoading({ title: '转换中…' });
      const cloudPath = `voice/${Date.now()}.aac`;
      const upRes = await wx.cloud.uploadFile({ cloudPath, filePath: this._voiceTempFile });
      const asrRes: any = await wx.cloud.callFunction({
        name: 'asr',
        data: { fileId: upRes.fileID, duration: Math.max(this.data.recordingDuration, 1) },
      });
      wx.hideLoading();

      const text = (asrRes?.result?.text || '').trim();
      if (text) {
        this.setData({ text });
        await this.send();
      } else {
        const code = asrRes?.result?.code || '';
        if (code === 'ASR_UNAVAILABLE') {
          wx.showToast({ title: '语音已录制，AI识别暂不可用', icon: 'none' });
        } else {
          wx.showToast({ title: '未识别到内容，请再试一次', icon: 'none' });
        }
      }
    } catch (err: any) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '转换失败', icon: 'none' });
    }
  },

  endRecording() {
    if (this._recordTimer) { clearInterval(this._recordTimer); this._recordTimer = null; }
    try { this._recorder?.stop(); } catch (_) {}
    this.setData({ recording: false });
  },
});
