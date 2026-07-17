'use strict';

const SKILLS = Object.freeze({
  general: Object.freeze({
    name: 'general', version: '1.1.0',
    instructions: '直接回应当前问题，先给结论，再给必要依据和最小可执行下一步。信息不足时明确缺口并优先问一个最能改变答案的问题；区分事实、推断和假设，不编造实时事实，也不为了顺从用户而隐藏重要风险。',
  }),
  personal_advice: Object.freeze({
    name: 'personal_advice', version: '1.1.0',
    instructions: '只使用本轮提供且与问题相关的已确认个人记忆，当前输入优先于旧记忆；发现冲突时指出变化而不是静默选边。先给建议结论，再列关键现实约束、主要取舍与备选路径，最后给一个可验证的下一步。区分事实、推断和假设，不迎合，不把记忆标签机械复述给用户。',
  }),
  factual_research: Object.freeze({
    name: 'factual_research', version: '1.1.0',
    instructions: '识别哪些结论依赖今天、最新、当前、价格、版本或其他可变事实并优先调用实时搜索。只根据工具实际返回内容下结论，区分已核验事实、合理推断和未知；工具不可用或证据不足时明确说明未实时核验，并给出用户可自行核验的最短路径。',
  }),
});

class SkillRegistry {
  constructor(skills = SKILLS) { this.skills = skills; }
  get(name) { return this.skills[name] || null; }
  list() { return Object.values(this.skills); }
}

class CapabilityRouter {
  route(text = '') {
    const value = String(text);
    if (/(今天|现在|当前|最新|刚刚|实时|版本|价格|发布|查一下|搜索|核实|验证)/i.test(value)) return 'factual_research';
    if (/(结合我|我的情况|适合我|给我.*方案|给我.*建议|帮我.*计划|怎么选|取舍|低风险)/i.test(value)) return 'personal_advice';
    return 'general';
  }
}

module.exports = { SKILLS, SkillRegistry, CapabilityRouter };
