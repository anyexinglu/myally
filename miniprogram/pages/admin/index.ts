import questionsData from '../../data/onboarding-questions.json';
import skillsData from '../../data/skills';

const SKILL_MAP: Record<string, string> = {
  parenting: 'parenting-advisor',
  health: 'health-qa',
  fitness: 'fitness-coach',
  career: 'writing-polish',
  food: 'home-chef',
  ai: 'writing-polish',
  companion: 'mood-listener',
  'tech-elderly': 'health-qa',
};

const AGE_LABELS: Record<string, string> = { youth: '18~25岁', 'young-adult': '26~35岁', midlife: '36~50岁', senior: '50岁以上' };
const KID_LABELS: Record<string, string> = { '0-1': '0~1岁', '2-3': '2~3岁', '4-6': '4~6岁', '7-12': '7~12岁', '13+': '13岁以上' };

Page({
  data: {
    age: 'young-adult',
    ageLabel: '26~35岁',
    ageOptions: [] as string[],
    roleOptions: [] as any[],
    selRoles: [] as string[],
    kidAge: '2-3',
    kidAgeLabel: '2~3岁',
    kidAgeOptions: [] as string[],
    interestOptions: [] as any[],
    selInterests: [] as string[],
    previewSkills: [] as any[],
    allRoles: [] as any[],
    allInterests: [] as any[],
  },
  onLoad() {
    const qs = JSON.parse(JSON.stringify(questionsData));
    const ageQ = qs[0];
    const roleQ = qs[1];
    const kidQ = qs[2];
    const interestQ = qs[3];

    this.data.ageOptions = ageQ.options.map((o: any) => o.label);
    this.data.kidAgeOptions = kidQ.options.map((o: any) => o.label);
    this.data.allRoles = roleQ.options;
    this.data.allInterests = interestQ.options;

    this.loadMyProfile();
  },
  loadMyProfile() {
    wx.cloud.callFunction({
      name: 'conversations',
      data: { action: 'listMemories' },
      success: (res: any) => {
        const profile = (res.result?.data || []).find((m: any) => m.key === 'user_profile');
        if (profile) {
          const parts = (profile.value || '').split('；');
          const ans: Record<string, any> = {};
          parts.forEach((p: string) => {
            const [k, ...vs] = p.split('：');
            const v = vs.join('：');
            if (k === 'role' || k === 'interests') ans[k] = v.split(',').filter(Boolean);
            else ans[k] = v;
          });
          this.setData({
            age: ans.age || 'young-adult',
            ageLabel: AGE_LABELS[ans.age] || '26~35岁',
            selRoles: ans.role || [],
            kidAge: ans['kid-age'] || '2-3',
            kidAgeLabel: KID_LABELS[ans['kid-age']] || '2~3岁',
            selInterests: ans.interests || [],
          });
        }
        this.refreshOptions();
        this.refreshPreview();
      },
      fail: () => this.refreshPreview(),
    });
  },
  refreshOptions() {
    const age = this.data.age;
    const selRoles = this.data.selRoles;
    // 根据 age 过滤身份选项
    const roleOpts = this.data.allRoles.filter((o: any) => {
      if (!o.showIf || Object.keys(o.showIf).length === 0) return true;
      const cond = o.showIf.age || [];
      return cond.includes(age);
    });
    // 根据 role 过滤兴趣选项
    const interestOpts = this.data.allInterests.filter((o: any) => {
      if (!o.showIf || Object.keys(o.showIf).length === 0) return true;
      return Object.entries(o.showIf).every(([key, vals]) => {
        if (key === 'age') return (vals as string[]).includes(age);
        if (key === 'role') return selRoles.some((r) => (vals as string[]).includes(r));
        return true;
      });
    });
    this.setData({ roleOptions: roleOpts, interestOptions: interestOpts });
  },
  refreshPreview() {
    const skills: any[] = JSON.parse(JSON.stringify(skillsData));
    const interests = this.data.selInterests;
    // 标记匹配项
    skills.forEach((s) => { s.matched = false; });
    interests.forEach((i) => {
      const targetId = SKILL_MAP[i];
      if (targetId) {
        const found = skills.find((s) => s.id === targetId);
        if (found) found.matched = true;
      }
    });
    // 排序：匹配的在前
    skills.sort((a, b) => {
      if (a.matched && !b.matched) return -1;
      if (!a.matched && b.matched) return 1;
      return 0;
    });
    this.setData({ previewSkills: skills });
  },
  onAgeChange(e: any) {
    const idx = e.detail.value;
    const label = this.data.ageOptions[idx];
    const id = Object.entries(AGE_LABELS).find(([, v]) => v === label)?.[0] || 'young-adult';
    // 年龄变了，清除不匹配的 role
    const validRoles = this.data.allRoles.filter((o: any) => {
      if (!o.showIf?.age) return true;
      return o.showIf.age.includes(id);
    }).map((o: any) => o.id);
    const filteredRoles = this.data.selRoles.filter((r) => validRoles.includes(r));
    this.setData({ age: id, ageLabel: label, selRoles: filteredRoles });
    this.refreshOptions();
    this.refreshPreview();
  },
  toggleRole(e: any) {
    const id = e.currentTarget.dataset.id;
    let sel = [...this.data.selRoles];
    const idx = sel.indexOf(id);
    if (idx >= 0) sel.splice(idx, 1); else sel.push(id);
    this.setData({ selRoles: sel });
    this.refreshOptions();
    this.refreshPreview();
  },
  onKidAgeChange(e: any) {
    const idx = e.detail.value;
    const label = this.data.kidAgeOptions[idx];
    const id = Object.entries(KID_LABELS).find(([, v]) => v === label)?.[0] || '2-3';
    this.setData({ kidAge: id, kidAgeLabel: label });
  },
  toggleInterest(e: any) {
    const id = e.currentTarget.dataset.id;
    let sel = [...this.data.selInterests];
    const idx = sel.indexOf(id);
    if (idx >= 0) sel.splice(idx, 1); else sel.push(id);
    this.setData({ selInterests: sel });
    this.refreshPreview();
  },
  saveProfile() {
    const ans: Record<string, any> = { age: this.data.age };
    if (this.data.selRoles.length) ans.role = this.data.selRoles;
    if (this.data.selRoles.includes('parent')) ans['kid-age'] = this.data.kidAge;
    if (this.data.selInterests.length) ans.interests = this.data.selInterests;
    wx.showLoading({ title: '保存中…' });
    // 先删旧的再写新的
    wx.cloud.callFunction({
      name: 'conversations',
      data: { action: 'listMemories' },
      success: (res: any) => {
        const old = (res.result?.data || []).find((m: any) => m.key === 'user_profile');
        const doSave = () => {
          wx.cloud.callFunction({
            name: 'conversations',
            data: { action: 'saveOnboarding', payload: ans },
            success: () => { wx.hideLoading(); wx.showToast({ title: '已保存', icon: 'success' }); },
            fail: () => { wx.hideLoading(); wx.showToast({ title: '保存失败', icon: 'none' }); },
          });
        };
        if (old && old.id) {
          wx.cloud.callFunction({
            name: 'conversations',
            data: { action: 'deleteMemory', memoryId: old.id },
            success: doSave,
            fail: doSave,
          });
        } else { doSave(); }
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '查询失败', icon: 'none' }); },
    });
  },
});
