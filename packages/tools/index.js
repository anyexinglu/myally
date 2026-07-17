'use strict';

class ToolRegistry {
  constructor() { this.tools = new Map(); }
  register(tool) {
    if (!tool || typeof tool.name !== 'string' || typeof tool.execute !== 'function') throw new Error('invalid tool');
    this.tools.set(tool.name, Object.freeze({ readOnly: false, ...tool }));
  }
  get(name) { return this.tools.get(name) || null; }
  list() {
    return Array.from(this.tools.values()).map(({ name, description, inputSchema, readOnly }) => ({ name, description, inputSchema, readOnly }));
  }
  async execute(name, args, context) {
    const tool = this.get(name);
    if (!tool) throw new Error('unknown tool');
    return tool.execute(args || {}, context || {});
  }
}

class PolicyEngine {
  authorize(toolName, tool, context = {}) {
    if (!tool) return { allowed: false, code: 'UNKNOWN_TOOL' };
    if (!tool.readOnly) return { allowed: false, code: 'WRITE_TOOL_REQUIRES_CONFIRMATION' };
    if (context.temporary && toolName === 'memory_search') return { allowed: false, code: 'TEMPORARY_MEMORY_DISABLED' };
    return { allowed: true, code: null };
  }
}

function createCoreTools({ memoryService, searchAdapter, now = () => new Date(), timezone = 'Asia/Shanghai' } = {}) {
  return [
    {
      name: 'current_time', description: '读取服务端当前时间', readOnly: true,
      inputSchema: { type: 'object', additionalProperties: false },
      execute: async () => ({ iso: now().toISOString(), timezone }),
    },
    {
      name: 'memory_search', description: '检索当前用户已确认的相关长期记忆', readOnly: true,
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false },
      execute: async (args, context) => {
        if (!memoryService) return { status: 'unavailable', reason: 'memory service is not configured' };
        const result = await memoryService.retrieve(context.ownerId, String(args.query || context.inputText || ''), {
          temporary: !!context.temporary,
        });
        return { status: 'ok', items: result.items.map((item) => ({ id: item.id, type: item.type, value: item.value })) };
      },
    },
    {
      name: 'realtime_search', description: '检索需要实时核验的公开信息', readOnly: true,
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
      execute: async (args) => {
        if (!searchAdapter || typeof searchAdapter.search !== 'function') {
          return { status: 'unavailable', reason: 'realtime search is not configured' };
        }
        try {
          const result = await searchAdapter.search(String(args.query || ''));
          return { status: 'ok', results: Array.isArray(result) ? result : [] };
        } catch (_) {
          return { status: 'unavailable', reason: 'realtime search failed' };
        }
      },
    },
  ];
}

module.exports = { ToolRegistry, PolicyEngine, createCoreTools };
