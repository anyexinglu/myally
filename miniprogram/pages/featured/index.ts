import skillsData from '../../data/skills.json';
import solutionsData from '../../data/solutions.json';

Page({
  data: {
    section: 'skills',
    skills: skillsData,
    solutions: solutionsData,
    expandedId: '',
  },
  switchSection(event) {
    const section = event.currentTarget.dataset.section;
    if (section !== this.data.section) this.setData({ section });
  },
  toggleSolution(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? '' : id });
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
