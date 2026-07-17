## 1. OpenSpec与测试基线

- [x] 1.1 将OpenSpec 1.6.0固定为项目开发依赖并初始化仓库内Codex工作流
- [x] 1.2 完成proposal、design和四个capability delta specs并通过OpenSpec校验
- [x] 1.3 先补充Agent、Memory、临时模式、删除和账号隔离的失败测试

## 2. Hermes-lite领域层

- [ ] 2.1 实现版本化Skill Registry和Capability Router
- [ ] 2.2 实现白名单Tool Registry、Policy Engine及current_time/memory_search/realtime_search工具
- [ ] 2.3 实现最多3步Agent Orchestrator、工具结果回填和失败降级
- [ ] 2.4 扩展Conversation Service以接入Agent、记忆引用、临时模式和Observer状态

## 3. 个人记忆领域层

- [ ] 3.1 实现Observation/Profile Item类型、InMemory Repository和来源校验
- [ ] 3.2 实现LLM Observer结构解析、confirmed/candidate分层和失败隔离
- [ ] 3.3 实现相关召回、上下文预算、删除传播和owner隔离

## 4. CloudBase适配

- [ ] 4.1 实现messages/observations/profile_items CloudBase repositories和所需API actions
- [ ] 4.2 扩展CloudBase ModelAdapter以支持Agent信封、最终回复和Memory Observer
- [ ] 4.3 添加实时搜索可替换适配器、环境配置说明和结构化不可用降级
- [ ] 4.4 同步领域部署副本并扩展结构验证防止漂移

## 5. 微信小程序体验

- [ ] 5.1 扩展首页显示临时模式、记忆使用提示、工具状态和Observer失败状态
- [ ] 5.2 在“我的”页增加记忆中心列表、来源展示和删除操作
- [ ] 5.3 保证页面重载后从数据库恢复会话并保持失败重试幂等

## 6. 本地验证与文档

- [ ] 6.1 运行领域、契约、隐私、结构和TypeScript全量验证
- [ ] 6.2 用Fake Model跑通两轮记忆、一次工具调用、删除、临时模式和双账号脚本
- [ ] 6.3 更新README和交接文档，区分代码POC、部署、微信预览和真机端测状态
- [ ] 6.4 运行OpenSpec validate和verify，完成实现任务后同步生效规格

## 7. CloudBase部署与端到端验收

- [ ] 7.1 在正式AppID绑定的测试环境创建集合和索引并部署conversations云函数
- [ ] 7.2 微信开发者工具预览真实发送、数据库落库、模型回复、记忆中心和临时模式
- [ ] 7.3 真机完成两轮记忆影响回答和一次白名单工具调用
- [ ] 7.4 使用两个微信账号验证消息与记忆隔离、删除传播和模型/工具不可用降级
- [ ] 7.5 通过OpenSpec verify后同步主规格并归档change
