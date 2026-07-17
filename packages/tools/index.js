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
  validateArguments(name, args) {
    const tool = this.get(name);
    if (!tool) return { valid: false, code: 'UNKNOWN_TOOL' };
    return validateSchema(args || {}, tool.inputSchema || { type: 'object' })
      ? { valid: true, code: null }
      : { valid: false, code: 'INVALID_TOOL_ARGUMENTS' };
  }
  async execute(name, args, context) {
    const tool = this.get(name);
    if (!tool) throw new Error('unknown tool');
    return tool.execute(args || {}, context || {});
  }
}

function validateSchema(value, schema = {}) {
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const properties = schema.properties || {};
    if ((schema.required || []).some((key) => !Object.prototype.hasOwnProperty.call(value, key))) return false;
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !Object.prototype.hasOwnProperty.call(properties, key))) return false;
    return Object.entries(value).every(([key, item]) => !properties[key] || validateSchema(item, properties[key]));
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') return false;
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) return false;
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) return false;
    return true;
  }
  if (schema.type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (schema.type === 'integer') return Number.isInteger(value);
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'array') {
    return Array.isArray(value) && value.every((item) => validateSchema(item, schema.items || {}));
  }
  return true;
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
      inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 500 } }, additionalProperties: false },
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
      inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 500 } }, required: ['query'], additionalProperties: false },
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

module.exports = { ToolRegistry, PolicyEngine, createCoreTools, validateSchema };
