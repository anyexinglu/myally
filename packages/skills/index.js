'use strict';

const SKILLS = Object.freeze({
  general: Object.freeze({
    name: 'general', version: '1.0.0',
    instructions: '直接回应当前问题，先给结论，再给必要依据和下一步。不编造实时事实。',
  }),
  personal_advice: Object.freeze({
    name: 'personal_advice', version: '1.0.0',
    instructions: '只使用本轮提供的已确认个人记忆，区分事实、推断和假设，给出贴合现实且可验证的建议。',
  }),
  factual_research: Object.freeze({
    name: 'factual_research', version: '1.0.0',
    instructions: '遇到今天、最新、当前、价格、版本或需要核验的事实时优先调用实时搜索；不可用时明确说明未实时核验。',
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
