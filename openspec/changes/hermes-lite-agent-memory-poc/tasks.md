## 1. OpenSpec与测试基线

- [x] 1.1 将OpenSpec 1.6.0固定为项目开发依赖并初始化仓库内Codex工作流
- [x] 1.2 完成proposal、design和四个capability delta specs并通过OpenSpec校验
- [x] 1.3 先补充Agent、Memory、临时模式、删除和账号隔离的失败测试

## 2. Hermes-lite领域层

- [x] 2.1 实现版本化Skill Registry和Capability Router
- [x] 2.2 实现白名单Tool Registry、Policy Engine及current_time/memory_search/realtime_search工具
- [x] 2.3 实现最多3步Agent Orchestrator、工具结果回填和失败降级
- [x] 2.4 扩展Conversation Service以接入Agent、记忆引用、临时模式和Observer状态

## 3. 个人记忆领域层

- [x] 3.1 实现Observation/Profile Item类型、InMemory Repository和来源校验
- [x] 3.2 实现LLM Observer结构解析、confirmed/candidate分层和失败隔离
- [x] 3.3 实现相关召回、上下文预算、删除传播和owner隔离
- [x] 3.4 实现显式纠正的语义key、旧版本关闭和当前版本召回

## 4. CloudBase适配

- [x] 4.1 实现messages/observations/profile_items CloudBase repositories和所需API actions
- [x] 4.2 扩展CloudBase ModelAdapter以支持Agent信封、最终回复和Memory Observer
- [x] 4.3 添加实时搜索可替换适配器、环境配置说明和结构化不可用降级
- [x] 4.4 同步领域部署副本并扩展结构验证防止漂移
- [x] 4.5 增加fast/reasoner/multimodal/observer可选模型路由并保持单模型回退

## 5. 微信小程序体验

- [x] 5.1 扩展首页显示临时模式、记忆使用提示、工具状态和Observer失败状态
- [x] 5.2 在“我的”页增加记忆中心列表、来源展示和删除操作
- [x] 5.3 保证页面重载后从数据库恢复会话并保持失败重试幂等

## 6. 本地验证与文档

- [x] 6.1 运行领域、契约、隐私、结构和TypeScript全量验证
- [x] 6.2 用Fake Model跑通两轮记忆、一次工具调用、删除、临时模式和双账号脚本
- [x] 6.3 更新README和交接文档，区分代码POC、部署、微信预览和真机端测状态
- [x] 6.4 补齐工具参数Schema校验、零相关记忆过滤、末步工具拒绝及OpenSpec关键契约测试
- [ ] 6.5 运行OpenSpec validate和verify，完成实现任务后同步生效规格

## 7. CloudBase部署与端到端验收

现场状态（2026-07-17）：正式AppID预览包已成功生成，开发者工具编译为0个问题；但该AppID当前为`cloudProject: false`、环境数为0，CLI环境查询返回微信侧`system error`。项目管理员已尝试开通，当前仍因扫码失败未完成。不得猜测环境ID；扫码/平台状态恢复后先开通或绑定CloudBase测试环境，再继续以下任务，其余本地任务可以独立推进。

部署准备：`cloudbase/schema.json`已固化四个集合、索引、拒绝客户端直连策略和两个云函数清单；`npm run cloud:check`可做无凭证检查，环境就绪后通过仅存在于本机进程的`MYALLY_CLOUDBASE_ENV_ID`运行`npm run cloud:deploy`。CLI不支持创建集合，需先在控制台按schema创建，且不得把长期云API密钥写入项目。

- [ ] 7.1 在正式AppID绑定的测试环境创建集合和索引并部署conversations云函数
- [ ] 7.2 微信开发者工具预览真实发送、数据库落库、模型回复、记忆中心和临时模式
- [ ] 7.3 真机完成两轮记忆影响回答和一次白名单工具调用
- [ ] 7.4 使用两个微信账号验证消息与记忆隔离、删除传播和模型/工具不可用降级
- [ ] 7.5 通过OpenSpec verify后同步主规格并归档change
