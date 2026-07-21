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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

Page({
  data: {
    messages: [WELCOME], conversationId: '', text: '', selectedImage: '',
    sending: false, anchor: 'message-welcome', temporary: false, headerTop: 44,
    recording: false, recordingDuration: 0, swipeUp: false,
    streamingText: '', streamingMessageId: '',
    activeSkill: null as null | { id: string; name: string; emoji: string; systemPrompt: string },
    activeSkillBackground: '',
  },
  _ready: null as Promise<void> | null,
  async onLoad() {
    // 调试模式：跳过真实 profile 检查，直接弹出问卷
    const isDebug = !!wx.getStorageSync('debug_onboard');
    if (isDebug && !wx.getStorageSync('debug_profile')) {
      wx.redirectTo({ url: '/pages/onboarding/index' });
      return;
    }
    // 首次进入检查是否已填用户画像，未填则跳转到 onboarding
    // 来自技能跳转时不触发（已选技能说明已有交互）
    const isFromSkill = (() => {
      const app: any = getApp();
      return !!(app && app.globalData && app.globalData.pendingSkill);
    })();
    if (!isFromSkill) {
      try {
        const res = await wx.cloud.callFunction({ name: 'conversations', data: { action: 'listMemories' } });
        const hasProfile = (res.result as any)?.data?.some((m: any) => m.key === 'user_profile');
        if (!hasProfile) {
          wx.redirectTo({ url: '/pages/onboarding/index' });
          return;
        }
      } catch (_) { /* 网络问题等不阻塞正常使用 */ }
    }
    this.syncChromeMetrics();
    this._ready = this.loadNormalConversation();
    await this._ready;
  },
  onShow() {
    // 调试模式检查（覆盖 switchTab 回来的情况）
    try {
      const isDebug = !!wx.getStorageSync('debug_onboard');
      if (isDebug && !wx.getStorageSync('debug_profile')) {
        wx.reLaunch({ url: '/pages/onboarding/index' });
        return;
      }
    } catch (_) {}
    this.applyPendingSkill();
  },
  // 精选页技能专区：消费 pendingSkill，插入技能开场白并激活角色预设；无 pendingSkill 时行为与现状一致
  async applyPendingSkill() {
    const app: any = getApp();
    const skill = app && app.globalData ? app.globalData.pendingSkill : null;
    if (!skill || !skill.systemPrompt) return;
    app.globalData.pendingSkill = null;
    try { if (this._ready) await this._ready; } catch (_) {}
    const welcome = {
      id: `skill-welcome-${skill.id}-${Date.now()}`, role: 'assistant', type: 'text',
      text: skill.welcomeMessage, createdAt: '刚刚', fileId: '', pending: false,
      memoryCount: 0, toolCalls: [],
      };
      // 设定聊天背景（占卜师苏研专有古风背景）
      const bg = skill.id === 'fortune-teller'
      ? 'linear-gradient(180deg, #2c1810 0%, #4a3228 30%, #6b4c3b 60%, #8b6914 100%)'
      : '';
      this.setData({
      activeSkill: { id: skill.id, name: skill.name, emoji: skill.emoji, systemPrompt: skill.systemPrompt },
      activeSkillBackground: bg,
      messages: [...this.data.messages, welcome],
      anchor: `message-${welcome.id}`,
      });
  },
  onHide() {
    if (this.data.recording) this.endRecording();
  },
  onUnload() {
    this.endRecording();
    this.clearVoiceCallbacks();
  },
  syncChromeMetrics() {
    try {
      const capsule = wx.getMenuButtonBoundingClientRect();
      const windowInfo = wx.getWindowInfo();
      const fallbackTop = (windowInfo.statusBarHeight || 20) + 4;
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
      this.setData({ temporary: true, conversationId: '', messages: [TEMP_WELCOME], anchor: 'message-temp-welcome', activeSkill: null });
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
      skillPrompt: this.data.activeSkill ? this.data.activeSkill.systemPrompt : '',
      skillId: this.data.activeSkill ? this.data.activeSkill.id : '',
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
        skillPrompt: draft.skillPrompt || '',
        skillId: draft.skillId || '',
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
      console.error('[myally] conversation send failed', error);
      const failed = messages.map((item) => item.id === draft.id
        ? { ...item, uploadedFileId, pending: false, failed: true }
        : item);
      this.setData({ messages: failed, anchor: `message-${draft.id}` });
      const errorMessage = error?.message || error?.errMsg || '发送失败，请稍后再试';
      wx.showToast({ title: String(errorMessage).slice(0, 40), icon: 'none' });
    } finally {
      this.setData({ sending: false });
    }
  },
  goMine() { wx.switchTab({ url: '/pages/mine/index' }); },

  // ======== 语音输入（微信风格） ========
  _recorder: null as any,
  _recordTimer: null as any,
  _startY: 0,
  _voiceStopPromise: null as Promise<string> | null,
  _resolveVoiceStop: null as ((filePath: string) => void) | null,
  _rejectVoiceStop: null as ((error: Error) => void) | null,
  _recorderStopHandler: null as ((res: any) => void) | null,
  _recorderErrorHandler: null as ((err: any) => void) | null,

  onVoiceStart(e: any) {
    if (this.data.sending) return;

    // 先检查并请求录音权限
    wx.authorize({
      scope: 'scope.record',
      success: () => this.startRecording(e),
      fail: () => {
        // 授权失败，尝试调起设置页让用户手动开启
        wx.showModal({
          title: '需要麦克风权限',
          content: '请在设置中开启麦克风权限后使用语音输入。',
          confirmText: '去设置',
          success: (res) => { if (res.confirm) wx.openSetting(); },
        });
      },
    });
  },

  startRecording(e: any) {
    this._startY = e.touches[0].clientY;
    this.setData({ recording: true, recordingDuration: 0, swipeUp: false });

    /* 已停用：data URI 在开发者工具会触发 atob 编码异常，原生 RecorderManager 不需要预播放静音音频。
    // iOS 音频会话初始化——播放一段静音后马上停止，激活音频会话
    try {
      const ctx = wx.createInnerAudioContext();
      ctx.autoplay = true;
      ctx.src = 'data:audio/mp3,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI1LjEwNAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYlmKQsAAAAAAD/+1DEAAAHAAb/AAAAIAAAQgAAABIgAABAAAABAAAAAJCU9PTkRFUjEwMABDb21tZW50AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/tQxAAAAGAAb/AAAACAABCAAAEiAAAEAAAABAAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg';
      setTimeout(() => { ctx.destroy(); }, 100);
    } catch(_) {}
    */

    // 销毁上一次可能残留的 recorder 实例
    if (this._recorder) {
      try { this._recorder.stop(); } catch(_) {}
      try { (this._recorder as any).destroy?.(); } catch(_) {}
      this._recorder = null;
    }
    this.clearVoiceCallbacks();
    try {
      const recorder = wx.getRecorderManager();
      this._recorder = recorder;
      this._voiceStopPromise = new Promise<string>((resolve, reject) => {
        this._resolveVoiceStop = resolve;
        this._rejectVoiceStop = reject;
      });
      this._recorderStopHandler = (res: any) => {
        this._resolveVoiceStop?.(String(res?.tempFilePath || ''));
        this.clearVoiceCallbacks();
      };
      this._recorderErrorHandler = (err: any) => {
        this._rejectVoiceStop?.(new Error(err?.errMsg || '录音失败'));
        this.clearVoiceCallbacks();
      };
      recorder.onStop(this._recorderStopHandler);
      recorder.onError(this._recorderErrorHandler);
      recorder.start({ duration: 60000, format: 'aac', sampleRate: 16000, numberOfChannels: 1 });
      let duration = 0;
      this._recordTimer = setInterval(() => {
        duration += 1;
        this.setData({ recordingDuration: duration });
        if (duration >= 60) this.onVoiceEnd();
      }, 1000);
    } catch (_) {
      this.endRecording();
      wx.showModal({
        title: '录音不可用',
        content: '语音识别组件暂不可用，请重新编译后再试，或先用文字输入。',
        confirmText: '知道了',
      });
    }
  },

  onVoiceMove(e: any) {
    const y = e.touches[0].clientY;
    this.setData({ swipeUp: this._startY - y > 80 });
  },

  async onVoiceEnd() {
    if (!this.data.recording) return;
    const cancelled = this.data.swipeUp;
    const pendingStop = this._voiceStopPromise;
    this.endRecording();
    if (cancelled) {
      wx.showToast({ title: '已取消', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: '转换中…' });
      const stopTimeout = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('未获取到录音')), 5000));
      const filePath = await Promise.race([pendingStop || Promise.resolve(''), stopTimeout]);
      if (!filePath) throw new Error('未获取到录音');
      const cloudPath = `voice/${Date.now()}.aac`;
      const upload = await withTimeout(
        wx.cloud.uploadFile({ cloudPath, filePath }),
        15000,
        '录音上传超时，请改用文字输入',
      );
      const response: any = await withTimeout(
        wx.cloud.callFunction({
          name: 'asr',
          data: { fileId: upload.fileID, duration: Math.max(this.data.recordingDuration, 1) },
        }),
        30000,
        '语音识别超时，请改用文字输入',
      );
      const text = String(response?.result?.text || '').trim();
      wx.hideLoading();
      if (!text) {
        const code = String(response?.result?.code || '');
        const title = code === 'ASR_NOT_ACTIVATED' || code === 'ASR_PERMISSION_REQUIRED'
          ? '语音服务尚未开通，请先用文字输入'
          : code === 'ASR_QUOTA_EXHAUSTED'
            ? '本月语音额度已用完，请先用文字输入'
            : '未识别到内容，请再试一次';
        wx.showToast({ title, icon: 'none' });
        return;
      }
      this.setData({ text });
      await this.send();
    } catch (err: any) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '识别失败，请再试一次', icon: 'none' });
    } finally {
      this.clearVoiceCallbacks();
    }
  },

  endRecording() {
    if (this._recordTimer) { clearInterval(this._recordTimer); this._recordTimer = null; }
    try { this._recorder?.stop(); } catch (_) {}
    this.setData({ recording: false });
  },
  clearVoiceCallbacks() {
    try {
      if (this._recorderStopHandler) this._recorder?.offStop?.(this._recorderStopHandler);
      if (this._recorderErrorHandler) this._recorder?.offError?.(this._recorderErrorHandler);
    } catch (_) {}
    this._recorderStopHandler = null;
    this._recorderErrorHandler = null;
    this._resolveVoiceStop = null;
    this._rejectVoiceStop = null;
    this._voiceStopPromise = null;
    this._recorder = null;
  },
});
