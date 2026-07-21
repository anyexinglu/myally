import skillsData from '../../data/skills';
import solutionsData from '../../data/solutions';

// 信息板块频道：场景方案（静态）+ 3 个每日更新的日报频道（daily_feeds 集合）
const INFO_CHANNELS = [
  { id: 'solutions', name: '场景方案', feedType: '' },
  { id: 'ai-news', name: 'AI日报', feedType: 'ai-news' },
  { id: 'parenting', name: '育儿', feedType: 'parenting' },
  { id: 'sidehustle', name: '副业雷达', feedType: 'sidehustle' },
  { id: 'admin', name: '管理', feedType: 'admin' },
];

interface FeedItem {
  _id: string;
  feedType: string;
  date: string;
  title: string;
  content: string;
  scope: 'public' | 'personal' | 'admin';
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

    // 管理频道：静态管理入口列表
    if (channelId === 'admin') {
      const adminFeeds: FeedItem[] = [
        { _id: 're-onboard', feedType: 'admin', date: '', title: '🔄 重新填写画像', content: '清除旧画像数据，重新走一遍新人问卷流程', scope: 'admin' },
        { _id: 'feed-ai-news', feedType: 'admin', date: '', title: '📰 推送AI日报', content: '手动触发一次AI日报写入daily_feeds', scope: 'admin' },
        { _id: 'feed-parenting', feedType: 'admin', date: '', title: '🧸 推送育儿知识', content: '手动触发一次育儿知识写入daily_feeds', scope: 'admin' },
        { _id: 'feed-sidehustle', feedType: 'admin', date: '', title: '📡 推送副业雷达', content: '手动触发一次副业雷达写入daily_feeds', scope: 'admin' },
      ];
      this.feedsCache['admin'] = adminFeeds;
      if (this.data.infoChannel === 'admin') this.setData({ feeds: adminFeeds, feedsLoading: false });
      return;
    }

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
