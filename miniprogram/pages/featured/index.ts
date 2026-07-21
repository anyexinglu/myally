import skillsData from '../../data/skills';
import solutionsData from '../../data/solutions';

// 信息板块频道：场景方案（静态）+ 3 个每日更新的日报频道（daily_feeds 集合）
const INFO_CHANNELS = [
  { id: 'solutions', name: '场景方案', feedType: '' },
  { id: 'ai-news', name: 'AI日报', feedType: 'ai-news' },
  { id: 'parenting', name: '育儿', feedType: 'parenting' },
  { id: 'sidehustle', name: '副业雷达', feedType: 'sidehustle' },
];

interface FeedItem {
  _id: string;
  feedType: string;
  date: string;
  title: string;
  content: string;
  scope: 'public' | 'personal';
}

Page({
  data: {
    section: 'skills',
    skills: [] as any[],
    solutions: solutionsData,
    expandedId: '',
    infoChannels: INFO_CHANNELS,
    infoChannel: 'solutions',
    feeds: [] as FeedItem[],
    feedsLoading: false,
    expandedFeedId: '',
  },
  onLoad() {
    // 根据调试画像或真实画像排序技能
    this.loadSortedSkills();
  },
  loadSortedSkills() {
    const debugProfile = wx.getStorageSync('debug_profile');
    let profile = debugProfile;
    if (!profile) {
      // 没有调试画像时尝试从云端加载
      // 异步加载不影响首次渲染，排好序后 setData
      this.tryLoadCloudProfile();
    }
    this.applySkillSort(profile);
  },
  tryLoadCloudProfile() {
    // 从云端加载真实画像（异步，不影响首次渲染）
    wx.cloud.callFunction({
      name: 'conversations',
      data: { action: 'listMemories' },
      success: (res: any) => {
        const p = (res.result?.data || []).find((m: any) => m.key === 'user_profile');
        if (p) this.applySkillSortFromValue(p.value);
      },
      fail: () => {},
    });
  },
  applySkillSortFromValue(value: string) {
    // 解析 "age: young-adult；role: parent,office；kid-age: 2-3；interests: parenting,health,ai" 格式
    const parts = (value || '').split('；');
    const ans: Record<string, any> = {};
    parts.forEach((part: string) => {
      const [k, ...vs] = part.split('：');
      const v = vs.join('：');
      if (k === 'role' || k === 'interests') ans[k] = v.split(',').filter(Boolean);
      else ans[k] = v;
    });
    this.applySkillSort(ans);
  },
  applySkillSort(profile: any) {
    if (!profile || !profile.interests) return;
    const interests: string[] = profile.interests;
    const SKILL_MAP: Record<string, string> = {
      parenting: 'parenting-advisor', health: 'health-qa', fitness: 'fitness-coach',
      career: 'writing-polish', food: 'home-chef', ai: 'writing-polish',
      companion: 'mood-listener', 'tech-elderly': 'health-qa',
    };
    const sorted = JSON.parse(JSON.stringify(skillsData));
    sorted.forEach((s: any) => { s.matched = false; });
    interests.forEach((i: string) => {
      const id = SKILL_MAP[i];
      if (id) { const f = sorted.find((s: any) => s.id === id); if (f) f.matched = true; }
    });
    sorted.sort((a: any, b: any) => {
      if (a.matched && !b.matched) return -1;
      if (!a.matched && b.matched) return 1;
      return 0;
    });
    this.setData({ skills: sorted });
  },
  // 按频道缓存已拉取的日报，切回不重复请求
  feedsCache: {} as Record<string, FeedItem[]>,
  switchSection(event) {
    const section = event.currentTarget.dataset.section;
    if (section !== this.data.section) this.setData({ section });
  },
  toggleSolution(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? '' : id });
  },
  switchInfoChannel(event) {
    const id = event.currentTarget.dataset.id;
    if (id === this.data.infoChannel) return;
    this.setData({ infoChannel: id, expandedFeedId: '' });
    if (id === 'solutions') return;
    const cached = this.feedsCache[id];
    if (cached) {
      this.setData({ feeds: cached });
      return;
    }
    this.loadFeeds(id);
  },
  loadFeeds(channelId: string) {
    this.setData({ feedsLoading: true, feeds: [] });
    wx.cloud.callFunction({
      name: 'ingest-feed',
      data: { action: 'query', feedType: channelId },
      success: (res: any) => {
        const feeds = (res.result?.data || []) as FeedItem[];
        this.feedsCache[channelId] = feeds;
        if (this.data.infoChannel === channelId) this.setData({ feeds, feedsLoading: false });
      },
      fail: () => {
        this.setData({ feedsLoading: false });
      },
    });
  },
  toggleFeed(event) {
    const id = event.currentTarget.dataset.id;
    // 管理频道：点击执行动作
    if (this.data.infoChannel === 'admin') {
      this.execAdminAction(id);
      return;
    }
    this.setData({ expandedFeedId: this.data.expandedFeedId === id ? '' : id });
  },
  execAdminAction(actionId: string) {
    switch (actionId) {
      case 're-onboard':
        wx.navigateTo({ url: '/pages/admin/index' });
        break;
      default:
        wx.showToast({ title: '功能开发中', icon: 'none' });
    }
  },
  useSkill(event) {
    const id = event.currentTarget.dataset.id;
    const skill = (this.data.skills as any[]).find((item) => item.id === id);
    if (!skill) return;
    const app: any = getApp();
    app.globalData.pendingSkill = skill;
    wx.switchTab({ url: '/pages/home/index' });
  },
});
