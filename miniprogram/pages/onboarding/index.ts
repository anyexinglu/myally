import questionsData from '../../data/onboarding-questions.json';

interface Answer {
  id: string;
  selected: string | string[];
}

Page({
  data: {
    questions: [] as any[],
    currentStep: 0,
    answers: {} as Record<string, string | string[]>,
    currentQuestion: null as any,
    canProceed: false,
  },
  onLoad() {
    // 深度复制，保留原始 showIf 条件
    this.setData({ questions: JSON.parse(JSON.stringify(questionsData)) });
    this.renderStep(0);
  },
  getFilteredOptions(step: number) {
    const q = JSON.parse(JSON.stringify(questionsData))[step];
    if (!q || !q.options) return [];
    const ans = { ...this.data.answers };
    return q.options.filter((opt: any) => {
      if (!opt.showIf || Object.keys(opt.showIf).length === 0) return true;
      return Object.entries(opt.showIf).every(([key, values]) => {
        const userAns = ans[key];
        if (!userAns) return false;
        const vals = values as string[];
        return Array.isArray(userAns) ? userAns.some((v) => vals.includes(v)) : vals.includes(userAns as string);
      });
    });
  },
  renderStep(step: number) {
    const q = questionsData[step];
    if (!q) return;
    const filtered = this.getFilteredOptions(step);
    const question = { ...q, options: filtered };
    const selected = this.data.answers[q.id];
    this.setData({
      currentStep: step,
      currentQuestion: question,
      canProceed: q.type === 'multi' ? Array.isArray(selected) && selected.length > 0 : !!selected,
    });
  },
  isSelected(id: string) {
    const q = this.data.currentQuestion;
    if (!q) return false;
    const sel = this.data.answers[q.id];
    if (Array.isArray(sel)) return sel.includes(id);
    return sel === id;
  },
  toggleOption(e: any) {
    const id = e.currentTarget.dataset.id;
    const q = this.data.currentQuestion;
    if (!q) return;
    const key = q.id;
    const isMulti = q.type === 'multi';
    let current = this.data.answers[key];
    if (isMulti) {
      const arr = Array.isArray(current) ? [...current] : [];
      const idx = arr.indexOf(id);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(id);
      this.setData({ [`answers.${key}`]: arr, canProceed: arr.length > 0 });
    } else {
      this.setData({ [`answers.${key}`]: id, canProceed: true });
    }
  },
  prevStep() {
    if (this.data.currentStep > 0) this.renderStep(this.data.currentStep - 1);
  },
  nextStep() {
    if (!this.data.canProceed) return;
    if (this.data.currentStep < this.data.questions.length - 1) {
      this.renderStep(this.data.currentStep + 1);
    } else {
      this.submitAnswers();
    }
  },
  submitAnswers() {
    const isDebug = !!wx.getStorageSync('debug_onboard');
    if (isDebug) {
      // 调试模式：存本地，不影响真实数据
      wx.setStorageSync('debug_profile', this.data.answers);
      wx.showToast({ title: '预览数据已保存', icon: 'success' });
      // 跳转精选页预览效果
      wx.switchTab({ url: '/pages/featured/index' });
      return;
    }
    wx.showLoading({ title: '保存中…' });
    wx.cloud.callFunction({
      name: 'conversations',
      data: { action: 'saveOnboarding', payload: this.data.answers },
      success: () => {
        wx.hideLoading();
        wx.switchTab({ url: '/pages/home/index' });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '保存失败，稍后再试', icon: 'none' });
      },
    });
  },
});
