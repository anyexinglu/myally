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
    skills: skillsData,
    solutions: solutionsData,
    expandedId: '',
    infoChannels: INFO_CHANNELS,
    infoChannel: 'solutions',
    feeds: [] as FeedItem[],
    feedsLoading: false,
    expandedFeedId: '',
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
    // app.ts onLaunch 已完成 wx.cloud.init，这里直接复用，不重复初始化
    wx.cloud.database().collection('daily_feeds')
      .where({ feedType: channelId })
      .orderBy('date', 'desc')
      .limit(7)
      .get()
      .then((res) => {
        const feeds = (res.data || []) as FeedItem[];
        this.feedsCache[channelId] = feeds;
        if (this.data.infoChannel === channelId) this.setData({ feeds, feedsLoading: false });
      })
      .catch((error) => {
        // 集合未建/安全规则未配置等场景统一降级为空态，不打扰用户
        console.warn('daily_feeds 查询失败，按空态展示', error);
        this.feedsCache[channelId] = [];
        if (this.data.infoChannel === channelId) this.setData({ feeds: [], feedsLoading: false });
      });
  },
  toggleFeed(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ expandedFeedId: this.data.expandedFeedId === id ? '' : id });
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
