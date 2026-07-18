# 我在 MyAlly｜个人AI助理产品与研发交接文档

> 状态：持续更新。最近整理：2026-07-18。主计划已升级为v3.2。
> 用途：保存主计划之外仍会影响后续决策的讨论结论、依据、取舍与待验证项，保证任何 Agent 不依赖聊天记录即可接手。

## 0. 2026-07-17 POC-1A 实现快照

本轮按“先UI、后能力”的顺序完成了第一条关键链路的代码POC：

```text
微信式首页输入文字或选择图片
→ 图片上传CloudBase私有存储
→ conversations云函数用OPENID确定数据所有者
→ 先写用户消息
→ ModelAdapter调用CloudBase AI
→ 保存助手回复
→ 小程序显示完整一轮对话
```

已吸收本机`hermes-twin`与`.hermes`的机制，不复制其中的真实画像、会话、凭证或私密数据：

- `ConversationService`与`ModelAdapter`解耦，后续可替换模型或接入受控的Hermes能力；
- 每条消息记录来源，只有`user_message`标为可进入后续Memory Observer，`assistant_generation`永不反向成为用户事实；
- 图片只由服务端把云存储`fileId`换成临时URL，再按OpenAI兼容的`image_url + text`多模态结构提交；
- `requestId`支持顺序幂等；模型失败时保留已记录的用户消息，使用相同请求重试不会重复落用户消息；
- 小程序失败气泡提供原位重试，沿用原`requestId`和已完成的图片上传，真正把服务端幂等能力暴露给微信用户；
- 本阶段不写Profile Item、不检索个人画像、不把“保存对话”宣传成“长期记忆”。

CloudBase官方文档确认`wx-server-sdk 4.0.2`支持在微信云函数中使用`cloud.ai().createModel(...).generateText(...)`，返回`text/usage/messages`；现有调用形态与官方接口一致。2026-07-17再次核验时，成长计划体验模型仅提供`hy3`，其他DeepSeek、GLM、Kimi、MiniMax、Qwen等模型需要当前环境的资源点套餐和模型开关。因此代码基础默认改为`cloudbase / hy3`以降低首次真实冒烟门槛，fast/reasoner/multimodal/observer仍须按控制台已启用模型显式配置，不静默启用收费模型。参考：<https://docs.cloudbase.net/ai/model/wx-server-sdk-access>、<https://docs.cloudbase.net/ai/model/overview>、<https://docs.cloudbase.net/ai/CHANGELOG>。

**验证边界：**本地12个领域测试、结构检查、TypeScript检查和官方`wcsc`样式编译检查已通过。开发者工具模拟器可加载新WXML，但本机`WeappVendor 3.16.2`校验错误与路由超时导致页面WXSS未可靠挂载，不能计为视觉验收通过；正式AppID、`messages`集合、AI+模型开关、云函数部署、真机视觉和真实模型返回也尚未完成。因此状态是“代码POC”，不是“CloudBase已集成”或“端到端已完成”。

### 0.1 2026-07-17 POC-1B已确认方向

用户已确认下一阶段不能只做“带记忆聊天”，而要参考当前微信Clawbot使用的Hermes能力，并吸收Grok Build可复用的Agent架构。POC-1B正式定义为**Hermes-lite个人智能体闭环**：

```text
小程序输入
→ Capability Router
→ 按需Skill＋相关个人记忆
→ LLM决定直接回答或调用白名单工具
→ Policy Engine校验
→ 最多3步Agent Loop
→ 带来源回复
→ LLM Memory Observer只分析用户原文
→ 记忆中心、删除与临时模式
```

首阶段只做`general / personal_advice / factual_research`三类Skill和`memory_search / current_time / 受控实时搜索`三类读取工具。任何外发、写入、付费、删除、账号操作或其他不可逆动作都不在自动执行范围。Skill由仓库版本化并只读加载，不允许模型在线自改生产Skill。

本段记录的是决策时边界；当前实现进展见0.3，未部署和未真机验证的能力仍不得称为完成。

### 0.2 2026-07-17 双层入口与隐私信任决策

微信客服虽然低摩擦，但用户天然可能把它理解为“企业员工可查看的客服工单”。这会直接抑制健康、家庭、情绪和关系等真实处境的表达，因此已确认：**微信客服只做门口和便捷通道，小程序才是深度对话与隐私控制的主要空间。**

```text
微信客服：体验、随手问、普通轻对话、提醒
→ 用户选择或系统提示
小程序私密空间：深度对话、长期记忆、敏感内容、查看/纠正/删除
```

两端可以共享同一内部身份、会话和记忆系统，但必须满足：可信身份绑定、当前渠道/隐私模式可见、临时对话属性不丢失、短期单次handoff、不在跳转链接放正文。检测到潜在私密主题只提示切换，不自动判定用户隐私偏好，也不把敏感分类写成长期记忆。

后台默认不建设原文浏览器。人工排障是独立例外机制：用户预览并授权具体片段、目的、人员范围和期限；到期自动撤销，所有查看与导出有审计。普通工单和运营指标只保存错误码、耗时、成本、版本及脱敏反馈。

删除承诺分为两层：对“我在”控制的数据库、索引、缓存、媒体和派生摘要负责删除并展示状态；对微信客服通道可能依法、依约保留的数据明确说明边界，不承诺无法验证的全通道彻底删除。

实施顺序因此调整为：先完成小程序私密空间、临时对话、记忆中心、无原文后台和删除传播，再开放微信客服Gateway与无缝续聊。当前代码尚未实现微信客服接入、隐私模式、handoff或人工授权排障。

### 0.3 2026-07-17 POC-1B代码实现快照

已按`openspec/changes/hermes-lite-agent-memory-poc/`实现首批代码：

- OpenSpec 1.6.0固定为项目开发依赖，proposal、design、四类规格和tasks通过严格校验；
- `packages/agent、memory、skills、tools`实现最多3步Agent Loop、三类Skill、白名单工具、Policy Engine和来源隔离；
- ConversationService接入相关记忆、Agent、回答级引用、临时模式和Observer失败隔离；
- 显式纠正使用稳定语义key关闭旧confirmed版本，保留时间线且只召回当前版本；
- CloudBase适配新增`observations/profile_items` Repository、记忆列表/删除action、Agent模型信封和Observer模型调用；
- 首页新增临时对话及记忆/工具状态；“我的空间”新增记忆中心和删除；
- Fake Model演示跑通两轮记忆改变回答、`current_time`工具、临时模式、删除和双账号隔离。

本地实测：33/33测试、26个必需文件结构/部署副本检查、TypeScript检查、两个演示流程和OpenSpec严格校验通过。其中新增测试以纯内存仿CloudBase SDK加载实际部署云函数入口，覆盖可信OPENID、用户消息先落库、模型回复、Observation/Profile Item、第二轮记忆注入和跨账号隔离；它是部署前集成证据，不冒充真实CloudBase。其他契约覆盖工具参数Schema拒绝、零相关记忆过滤、末步工具不执行、只读Skill、搜索不可用降级、推断记忆不召回、显式纠正时间线及fast/reasoner/multimodal/observer模型路由。Skill升级到v1.1，强化结论、现实约束、取舍、备选和最小下一步；专用模型未配置时继续回退单一基础模型。小程序失败气泡已支持复用原requestId和已上传图片原位重试。微信开发者工具Stable 2.01.2510290已使用正式AppID成功生成包含该改动的45.5KB预览包和二维码。`cloudbase/schema.json`与`npm run cloud:check/cloud:deploy`已固化集合、索引和无密钥部署流程。

真实部署检查发现，该AppID在开发者工具本地状态中仍为`cloudProject: false`，CloudBase环境数量为0；CLI查询环境同时返回微信侧`system error`。2026-07-18项目管理员提供了一个确实存在的腾讯云CloudBase环境，因此无需再购买19.9元套餐；但直接指定该环境执行部署时，微信CLI仍在查询函数和环境列表阶段返回`system error`，说明“腾讯云环境已存在”不等于“当前微信小程序已关联并获权访问”。同时，从当前项目的`conversations`目录执行“创建并部署”时，自动打开的是另一个名为“失物交接”的小程序云控制台。两个AppID不一致，因此本轮没有在错误环境创建函数、集合或测试数据。

因此目前只能证明**POC-1B代码、本地闭环和前端预览构建完成**。要继续真实链路，必须使用微信云开发控制台的“账号绑定/关联已有腾讯云账号”路径，把当前MYALLY正式AppID关联到现有环境，并确保开发者工具登录账号对两侧都有管理员权限；随后重新打开项目，右键云函数时应进入当前项目控制台且能看到环境列表。完成该绑定后再按`cloudbase/schema.json`创建四个集合与索引、部署函数并进行真实对话。AI+模型、数据库落库、真机真实回复和双账号端测仍未完成，不能称为“微信可真实对话已完成”。下一位Agent不得猜测环境ID、复用其他小程序环境或在AppID不一致时继续部署；之后继续OpenSpec任务7.1—7.5。

2026-07-18后续核验发现，本机忽略提交的`project.config.json`一度回退到另一个旧小程序AppID。该旧AppID的环境列表可见，且通过开发者工具GUI成功上传了`entries`与`conversations`；但这不是目标“失物交接”AppID，未创建集合、未写入测试数据，也未做删除等不可逆清理。恢复并重新打开目标AppID后，CLI环境查询仍返回微信侧`system error`；目标云开发控制台明确显示“非个人类型小程序/公众号没有通过微信认证不能开通云服务”，账号绑定区仍停在“下一步”。因此真实状态仍是：**目标AppID未完成微信认证识别或腾讯云账号绑定，任务7.1尚未开始**。后续部署前必须同时核对控制台应用名称、开发者工具运行时AppID和CLI环境列表，三者一致后才可继续。

**2026-07-18最新状态（覆盖上段的当前结论，保留上段仅作排障审计）：**用户已改用新建小程序并更新本机受Git忽略保护的AppID。完整退出并重开开发者工具后，CLI可为该AppID列出一个独立CloudBase环境，`entries`和`conversations`详情均为`Active / Nodejs16.13`，说明“认证/绑定导致环境列表为空”的旧阻塞已解除。CLI更新部署仍在微信签名接口返回`41002`；开发者工具GUI已分别发起“上传并部署：云端安装依赖”，但界面没有提供可审计的版本时间，因此不得声称部署副本已确认一致。当前剩余硬门槛是：在新环境按`cloudbase/schema.json`核验/创建四个集合及唯一索引、确认客户端直连拒绝、确认AI模型`hy3`可用，再以真实小程序消息完成落库、LLM回复、记忆召回/删除和双账号隔离。任何Agent不得把真实AppID或环境ID写入文档或Git。

部署前并发审计补充：`messages`必须按`ownerId + requestId + role`建立唯一索引，才能阻止网络并发重试产生同一轮重复消息；当前环境尚无真实数据，可直接按新版`cloudbase/schema.json`创建，无需处理旧数据冲突。`npm run cloud:check`现会列出`cloudbase / hy3`基础默认值和全部必建唯一索引。

**2026-07-18真实链路冒烟（当前最高优先级状态）：**开发者工具预览以自动触发方式向新AppID的`conversations`发出一条真实文字消息，云函数返回`collection.get:fail -502005 database collection not exists / DATABASE_COLLECTION_NOT_EXIST`，明确定位为新环境缺少`messages`集合。失败发生在`findTurnByRequest`的首个查询，因此本次消息**没有保存，也没有进入LLM调用**。本地已将此类错误映射为`SETUP_REQUIRED`并明确告知“本次消息未保存”，新增集成测试后34/34通过；移除诊断细节后已从开发者工具GUI再次上传安全版本，但GUI停留在云调用权限加载页，仍无法审计远端版本时间。任务7.1继续保持未完成：先按`cloudbase/schema.json`创建`entries/messages/observations/profile_items`，每个集合拒绝小程序客户端直接读写并建立必需索引，之后才能复测消息落库与`hy3`真实回复。独立腾讯云账号只能看到旧环境，不能用于操作这个微信侧新环境；不得跨环境部署，也不得把账号邮箱、AppID或环境ID写入仓库。

**2026-07-18集合与真实落库续测（覆盖上一段的当前结论，保留上一段作故障审计）：**已在新小程序的免费开发环境创建`entries/messages/observations/profile_items`，四个集合均选择“所有用户不可读写”；按`cloudbase/schema.json`创建并逐集合复核11个业务索引，包括消息并发幂等唯一索引。云函数列表可见`conversations`的最新远端更新时间，安全报错版本的部署状态已可审计。再次由小程序真实发送后，`messages`出现一条`role=user`、`temporary=false`的记录，没有`role=assistant`记录，说明前端→`conversations`→数据库真实链路已打通，失败发生在用户消息落库之后、助手回复落库之前。

AI模型页给出了新的明确阻塞证据：`hy3`状态开关关闭，免费额度剩余显示`-`，价格按输入/输出/缓存Token的资源点计量；页面同时提示当前环境不是资源点计费。桌面费用页把环境简称为“免费开发环境”并显示资源点切换报价19.9元/月，按量付费和自动续费均关闭；随后移动端云开发控制台给出更具体的套餐信息：当前套餐为“个人版 / 开发期免费”。这与小程序成长计划的免费个人版环境权益相符，因此不得购买或点击“升级付费套餐”。官方文档说明成长计划会同时赠送AI资源包，但当前`hy3`额度仍为`-`，所以还需单独核验AI资源包是否已发放到本环境。开启模型前必须先找到资源包或免费额度证据；不得把“个人版开发期免费”直接推断成“模型已免费”。任务7.1已完成；任务7.2只完成到真实用户消息落库，真实模型回复、Observer/Profile写入、记忆中心和临时模式仍待模型启用后验收。参考：<https://cloud.tencent.com/document/product/876/75213>、<https://docs.cloudbase.net/ai/ai-inspire-plan>。

**2026-07-18成长计划资源领取续测（覆盖上一段“资源包待核验”的当前结论）：**小程序成长计划页面已为当前腾讯云账号和当前CloudBase环境显示“领取资源成功”，资源卡明确包含“云开发资源及混元免费Token”和10亿Token。资源领取因此已经确认，不再是待核验项。刷新微信开发者工具内的AI模型页后，页面仍提示当前环境不是资源点计费，`hy3`开关仍为关闭；实际尝试开启时弹窗返回“无法开启模型，当前环境不是资源点计费，切换后支持在套餐中抵扣”。所以当前阻塞已进一步收窄为：**免费AI资源已到账，但环境尚未激活资源点抵扣模式**。后续只允许走成长计划资源抵扣路径；不得购买19.9元套餐，不得开启按量付费或自动续费。完成模式激活并确认页面不出现新增费用/订阅后，才能开启`hy3`并重跑真实消息。

**2026-07-18资源点激活与真实LLM续测（覆盖上一段的当前结论）：**当前个人版环境已在没有购买升级套餐的情况下完成资源点模式切换，套餐仍有效至原到期日，按量付费和自动续费保持关闭。`hy3`随后可进入真实调用；首次重试在用户消息落库后返回`structuredClone is not defined`，根因是云函数远端运行时为Node.js 16.13，而本地测试使用的较新Node版本原生提供该API。`entries`与`conversations`入口均已加入Node.js 16兼容层、通过全量测试并重新部署；开发者工具再次重试后，小程序界面收到`hy3`真实助手回复，证明“前端发送→云函数→数据库→模型→助手展示”主链完成。诊断期间临时显示的原始错误已撤回，线上重新使用通用安全错误文案。任务7.2只完成到真实文字模型回复，仍需验证Observer/Profile记忆写入、记忆中心、第二轮召回、临时模式和白名单工具；任务7.3—7.4的真机、双账号、删除传播与降级测试也仍未完成。

**2026-07-18真实评测续测（覆盖上一段的任务7.2边界）：**项目内专用评测页绕开模拟器输入法后，以固定中文用例自动执行真实CloudBase链路。临时模式用例成功获得模型回复并确认`memoryStatus=skipped`；普通对话及“记忆建立→第二轮召回”在调用约3秒后统一返回`-504003 / FUNCTIONS_TIME_LIMIT_EXCEEDED`。这与CloudBase云函数默认执行超时3秒完全一致，也解释了短`ping`偶尔成功而正常提示词不稳定：`conversations`还要串行执行回答模型和记忆观察器，3秒不是可用配置。官方CloudBase文档建议Agent云函数使用60—120秒；POC部署清单现明确要求`conversations.timeoutSeconds=60`，`entries`仍保留3秒。下一步必须先在云函数配置中把`conversations`超时改为60秒（该配置不涉及按量付费或自动续费），再重跑同一评测页。参考：<https://docs.cloudbase.net/cloud-function/function-configuration/config>、<https://docs.cloudbase.net/ai/agent-development/deployment/cloud-function>。

**2026-07-18超时修复与严格评测（当前结论，覆盖上一段阻塞状态）：**用户已把远端`conversations`执行超时改为60秒。开发者工具内严格评测随后全部通过：记忆建立首轮返回“新建1条”，第二轮返回“召回2条记忆”，临时模式正常回复并跳过长期记忆，`current_time`白名单工具返回`status=ok`；“我的空间”可见真实已确认画像。因此任务7.2已完成。两条相同画像来自修复前后重复执行同一固定评测，属于既有测试数据，未在没有授权的情况下删除。代码现会在保存完全相同的显式偏好前查询当前画像：继续保留Observation作为审计记录，但不重复创建Profile Item；显式纠正仍正常生成新版本并关闭旧版本。该修复有单元测试覆盖并已重新部署`conversations`。剩余边界仅为7.3物理真机与7.4双账号、删除传播、不可用降级，不得用开发者工具模拟器结果冒充真机完成。

## 1. 当前已确认定位

### 1.1 名称状态与品牌承诺

**2026-07-17 已确认：**中文产品名改为`我在`，英文名保留`MyAlly`。“有我”因被占用停止使用，`知伴行`、`知行伴`、`懂伴`、`知我行`等候选不再作为当前对外名称。

名称决策与微信小程序注册是两个状态：当前产品命名已确认，但“我在”能否通过微信小程序实时注册仍待验证。稳定工程目录、包名和内部标识继续使用`myally-*`，不为品牌展示名批量迁移历史路径。

当前品牌承诺：**长期懂你，陪你做到。**

产品不是普通聊天机器人，也不是只保存文字、语音和图片的记录工具。核心目标是：

```text
持续了解一个人
→ 理解事实、偏好、关系、阶段变化和决策方式
→ 给出不迎合、质量更高的现实方案
→ 帮助推进执行
→ 根据后续反馈继续改进
```

### 1.2 用户分层与进入顺序

首阶段不是家庭产品，也不以婚姻、育儿或照护关系作为准入条件：

1. **首批用户是成年人个人用户，覆盖独身者与有家庭者。**他们首先把我在作为自己的长期 AI 助理，亲自验证它是否足够聪明、可靠、有记忆并值得持续使用。
2. **老人和孩子是后续重点适配对象。**当个人用户建立信任后，才可能把产品推荐或邀请给自己关心的老人和孩子。
3. **家庭协作是可选扩展，不是产品前提。**独身用户即使不邀请任何家人，也应获得完整、长期的个人价值。
4. 邀请人可能承担配置或协作角色，但不会因此自动拥有被邀请者的全部数据。

因此，市场进入顺序是：

```text
成年人个人用户先自用验证（独身与有家庭者均可）
→ 建立对能力、隐私和安全的信任
→ 可选：邀请自己关心的老人或孩子加入
→ 可选：形成经授权的家庭/亲友协作网络
```

长期体验目标是：

```text
成年人个人用户：复杂问题分析、长期理解、计划和行动推进
老人：语音优先、低学习成本、陪伴和现实协助
孩子：年龄适配、好奇心支持、表达与成长陪伴
```

### 1.3 入口原则

- 微信客服作为低摩擦门口、轻对话和提醒通道，不作为唯一深度对话空间；
- 微信原生小程序作为用户真正拥有的私密空间，承载深度对话、长期记忆、敏感内容和隐私控制；
- 两端共享身份、会话和记忆前必须完成服务端可信绑定，并清楚显示当前渠道与隐私模式；
- 私密话题可一键从客服续接到小程序，不能要求用户重新描述，也不能在跳转链接携带正文；
- 交互形态接近微信聊天，减少学习成本；
- 文字、按住说话、图片和文件使用同一个会话入口；
- 老人端优先语音、大字号、少层级、明确反馈；
- 孩子端优先语音和可理解反馈，但必须有年龄适配与监护边界；
- 成年人个人用户使用完整能力；家庭身份不是使用高级能力的前提。

## 2. 核心竞争力判断

“长期记忆”已经不是充分差异。ChatGPT、Claude、Nomi、Kindroid、Second Me 等都在不同程度上覆盖记忆或持续关系。

我在需要形成的组合能力是：

```text
低门槛微信入口
＋跨代际适配
＋可解释的长期记忆
＋保留时间线和理解演进
＋强推理与强方案
＋不迎合
＋行动与反馈闭环
＋家庭协作但不合并个人隐私
```

建议把产品壁垒定义为四层：

1. **理解层：**不只记住原话，还能区分稳定事实、临时状态、人生阶段、关系边界和决策规则；
2. **方案层：**根据个人现状给出有依据、可执行、能验证的方案，而不是情绪迎合；
3. **行动层：**把建议变成提醒、任务、家庭协作或工具调用，并追踪结果；
4. **信任层：**用户能查看“记住了什么、为什么使用、来自哪里”，并能纠正、删除和控制共享。

## 3. 目标体验闭环

```text
用户像微信一样输入文字/语音/图片/文件
→ 输入标准化与安全检查
→ 判断当前意图和适用模式
→ 检索与本轮相关的个人记忆、时间线和授权上下文
→ 主模型生成流式回复、方案或行动建议
→ 用户确认行动或继续对话
→ 后台旁路提取 Observation / Memory Candidate / Action Candidate
→ 明确陈述按规则确认，模型推断保持候选
→ 更新索引
→ 下一轮真实使用相关记忆，并展示来源与可控入口
```

首个 AI POC 必须用第二轮对话证明：被授权记忆确实改变了回答。只建表、只保存聊天或只生成摘要都不算完成。

## 4. 记忆与成长原则

沿用已验证的治理模型：

```text
Observation
→ Memory Candidate
→ Profile Item
→ Intent-scoped Retrieval
→ Context Injection
```

硬规则：

- 只从用户原始输入学习，不把 AI 回复当成用户事实；
- 用户明确陈述可按规则确认；规则或模型推断只能作为候选；
- 敏感度决定保护边界，不决定真假；
- 阶段变化不是简单覆盖，必须保留时间线；
- 外部知识、用户观点、个人事实、临时任务分开存储；
- 家庭成员各自拥有独立档案，家庭协作通过明确、可撤回的范围连接；
- 记忆必须可查看、纠正、删除，临时对话可以不读也不写记忆；
- 儿童和老人不能因为被邀请加入就默认向邀请者暴露全部原始对话。

## 5. 已核验竞品与可参考方向

### 5.1 ChatGPT Memory

已核验的官方能力：自动从聊天、文件和连接应用形成持续更新的记忆摘要；用户可查看、修改和删除；回答可显示使用了哪些记忆及原因；新系统会处理记忆陈旧和矛盾；临时聊天不使用或创建记忆。

参考价值：

- 记忆摘要的持续综合；
- 回答级记忆来源说明；
- 纠正和删除入口；
- 临时对话；
- 冲突与陈旧记忆处理。

官方来源：<https://help.openai.com/en/articles/8590148-memory-faq>

### 5.2 Claude Memory

已核验的官方能力：项目级独立记忆、可查看和编辑的记忆摘要、Incognito 对话、从既有聊天初始化记忆，重点服务持续工作和复杂项目。

参考价值：

- 项目/场景隔离；
- 工作持续性；
- 敏感对话不沉淀；
- 记忆安全测试和防过度迎合意识。

官方来源：<https://claude.com/blog/memory>

### 5.3 Nomi / Kindroid

两者都把“记住并持续成长”作为核心关系体验。Nomi公开强调短、中、长期记忆以及对偏好、习惯和倾向的自然理解；Kindroid强调会倾听、记住并每天共同成长。

参考价值：

- 怎样让用户感受到被持续理解；
- 关系连续性和自然提及旧信息；
- 人格一致性。

警惕：陪伴型产品容易追求亲密和迎合，不能直接迁移为我在的判断原则。

官方来源：<https://nomi.ai/>、<https://kindroid.ai/>

### 5.4 Second Me / Me.bot

目前概念上与“数字分身”最接近的已核验开源项目：

- 仓库：<https://github.com/mindverse/Second-Me>
- 许可证：Apache-2.0；
- 官方定位：训练自己的 AI Self；
- 核心思想：AI-Native Memory、Hierarchical Memory Modeling、Me-Alignment、本地训练和托管；
- 公开实现使用 GraphRAG、llama.cpp 和 Qwen 系列等组件。

可参考：

- 分层记忆建模；
- 身份对齐；
- 本地隐私设计；
- 导入笔记、语音和经历形成个人模型；
- 记忆/身份版本化思想。

不能直接下结论整套采用。其本地模型能力、持续训练管线、移动端适配、儿童/老人安全、商业产品与开源版差异都需要源码和真实运行审计。

### 5.5 Personal AI

官方将 Memory、Context、Identity 分开：经历和互动形成 Memory；文档与知识形成 Context；Identity 随记忆积累而演进。目前更偏 B2B 记忆基础设施。

参考价值：不要把 RAG 文档检索误认为个人记忆；身份应随长期经历演进，而不是一次写死。

官方来源：<https://www.personal.ai/>

### 5.6 国内通用 AI 助理

2026-07-17 先通过中国区 Apple App Store 产品说明核验公开能力，随后补充核验厂商官方网页和帮助文档。产品说明与帮助文档只能证明功能范围，不能单独证明真实效果；仍需登录后做统一黑盒测试。

#### 豆包

当前公开能力包括：文本问答、联网搜索、语音输入和语音通话、拍照识图、图片/视频生成、文档/PPT/代码、办公任务自动执行与定时任务。其核心优势是入口简单、语音自然、功能面广以及字节模型/内容生态。

来源：<https://apps.apple.com/cn/app/id6459478672>

#### 腾讯元宝

当前公开能力包括：深度思考、语音输入与通话、公众号/视频号信源、识图、拍题、录音转写、文档精读、腾讯文档/微信读书/QQ音乐等生态联动。其核心优势是腾讯内容与微信生态。

来源：<https://apps.apple.com/cn/app/id6480446430>

#### Kimi

当前公开能力包括：长上下文、长程推理、视觉理解、复杂文档、深度搜索、插件、Agent 集群和多端同步，定位更偏专业工作与复杂项目交付。

来源：<https://apps.apple.com/cn/app/id6474233312>

#### 千问

当前公开能力包括：专业问答、生活办事、点外卖、订酒店、路线/餐厅、部分政务办理、办公文档、实时记录、学习辅导和多模态生成。其核心优势是阿里生活服务和办事闭环。

来源：<https://apps.apple.com/cn/app/id6466733523>

#### 对我在的影响

不能把以下能力当作独有卖点：

- 语音聊天、拍照识图、文件总结；
- 联网搜索、PPT、写作、代码；
- 简单提醒、定时任务；
- “回答聪明”或“帮你办事”的泛化口号。

**2026-07-17 新核验：豆包已经公开提供长期记忆。**官方《记忆功能 FAQ》说明它会从文本和语音转写中自动总结兴趣、偏好等内容，也支持用户明确要求“记住/忘记”、设置页逐条或全部删除。自动记忆按周期刷新，显式指令实时更新；删除后停止引用并非实时生效。来源：<https://www.doubao.com/legal/memory_faq>。

因此，“有长期记忆”“能让用户查看/删除记忆”已经是国内头部产品可公开验证的能力，不能再作为独有卖点。当前公开材料仍未证明豆包提供了回答级记忆来源、事实有效期、冲突时间线、行动结果回流和删除传播状态；这些必须通过真实 App 黑盒测试，不能用“未公开”推导“产品没有”。

Kimi Claw 的官方帮助文档也已公开强调长期记忆、后台定时任务和跨平台协作，但它更偏桌面/Agent形态，不等于普通消费者在微信内的低门槛个人助理。来源：<https://www.kimi.com/zh-tw/help/agent/use-skills-in-claw>。

我在只应在以下条件被用户感知为“比豆包更好用”：

```text
同一位用户连续使用后
→ 能准确记住与当前问题真正相关的信息
→ 能识别旧信息已变化而不是机械复述
→ 给出的方案明显结合其约束、偏好和历史结果
→ 能把建议变成行动并在之后继续跟进
→ 用户知道用了哪些记忆并能纠正/删除
```

基础模型的一次性问答能力不应承诺超过大厂。差异必须来自产品系统，而不是宣传“自研模型更聪明”。

### 5.7 市场分层与直接竞争判断（2026-07-17）

| 类型 | 代表产品 | 已公开的强项 | 对本项目的威胁/启发 |
|---|---|---|---|
| 通用个人助理 | ChatGPT、Claude、Gemini、豆包 | 跨会话记忆、临时/隐身对话、连接应用、强模型 | 记忆本身已商品化；要学习来源说明、项目隔离和连接生态 |
| 行动型个人 Agent | Gemini Spark、Kimi Claw | 后台任务、计划、跨应用执行、定时运行 | “建议转行动”很快会成为标配，首版必须先做可确认、可回滚的站内行动闭环 |
| AI 陪伴 | Nomi、Kindroid | 关系连续性、人格一致性、长期记忆、主动互动 | 学习自然地使用旧信息，但避免情绪迎合、依赖设计和虚假亲密 |
| 个人记忆/数字分身 | Me.bot / Second Me | 多源导入、分层记忆、个人身份建模、本地化、导出 | 产品概念最接近，但更偏“记录/代表我”；本项目应聚焦“帮我判断并做到” |
| 国内超级入口 | 豆包、元宝、千问、Kimi | 语音、多模态、搜索、生态服务、生活办事 | 功能广度和获客成本无法正面竞争；微信内轻入口和垂直闭环是可行切口 |

官方参考：ChatGPT Memory <https://help.openai.com/en/articles/8590148-memory-faq>；Claude Memory <https://claude.com/blog/memory>；Gemini Personal Intelligence <https://gemini.google/overview/personal-intelligence/>；Gemini Spark <https://gemini.google/overview/agent/spark/>；Nomi Memory <https://nomi.ai/updates/major-memory-update-expanded-capacity-enhanced-retention/>；Me.bot 数据导入/导出 <https://docs.me.bot/using-second-me/data-and-integrations>。

**直接竞品判断：**短期最值得跟踪的不是单一产品，而是“豆包记忆＋Kimi Claw行动＋Me.bot个人模型”三条能力线的汇合。我在 MyAlly 的市场空位不是“第一个记住你的 AI”，而是：在微信里以更低摩擦提供**可追溯的个人理解、带现实约束的方案、用户确认后的行动、结果继续影响下一次建议**。

### 5.8 “有记忆”与“越用越聪明”必须分开（2026-07-17）

主流助手并非只有静态记忆：

- ChatGPT 的新版记忆会自动综合和更新重要上下文，减少陈旧或矛盾条目，并向用户展示记忆摘要和本次回答使用的来源；这是持续更新的**个人上下文层**，不是为每位用户持续训练基础模型权重。来源：<https://help.openai.com/en/articles/6825453-chatgpt-memory-a-guide>。
- Claude 消费端有项目级记忆和 Incognito；Claude Code 的 Auto Memory 会根据用户纠正、构建命令和项目模式自动写笔记；Claude Managed Agents 还提供跨会话文件记忆、版本、审计、回滚和多 Agent 共享。它已经覆盖相当一部分“从经验中避免重复犯错”的能力。来源：<https://code.claude.com/docs/en/memory>、<https://claude.com/blog/claude-managed-agents-memory>。
- Gemini Personal Intelligence 会结合历史对话和 Google 应用上下文；Gemini Spark 进一步提供 Tasks、Skills 和 Schedules，代表“个人上下文＋程序性技能＋后台行动”的融合。来源：<https://gemini.google/overview/personal-intelligence/>、<https://gemini.google/overview/agent/spark/>。

Hermes Agent 所称的 closed learning loop 由几种外部状态共同实现：有限长度的 `MEMORY.md`/`USER.md`、跨会话历史搜索与摘要、可由 Agent 创建和更新的 `SKILL.md` 程序性记忆，以及可选的 Honcho 用户建模。成功流程、踩坑和用户纠正可以沉淀为技能，后续按需加载，因此更准确的描述是**越用越了解用户、越会复用做事方法**。其默认公开机制不是持续更新基础模型参数，也不能直接推导为通用推理能力随使用不断提高。来源：<https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/>、<https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/>、<https://hermes-agent.nousresearch.com/docs/user-guide/features/honcho/>。

对本项目的影响：产品应把“变聪明”拆成可验收的四层，而不使用不可验证的泛化口号：

1. **事实层：**更准确地记住用户事实、偏好、目标和阶段变化；
2. **理解层：**根据反馈修正对用户的推断和决策规则；
3. **程序层：**把成功方案、失败原因和操作流程沉淀成可复用 playbook/skill；
4. **模型层：**只有经过独立训练、评测和版本发布的参数更新才称为模型学习，首版不做每用户持续训练。

POC-1先验证事实层，POC-2强化理解层，POC-3在行动结果闭环上验证程序层。用户可查看、纠正、删除事实记忆；程序性技能必须有来源、版本、适用范围和回滚，不能从一次偶然成功自动升级为全局规则。

## 6. 开源复用策略

原则是“复用能力，不复制产品”：

1. 先读取许可证、源码、数据流和维护状态；
2. 只抽象可替换接口，不把产品绑定到某个项目；
3. 用虚构数据做评测，不把真实用户资料导入审计仓库；
4. 必须实测写入、更新、冲突、召回、删除和数据外传；
5. 思想可借鉴，代码复用必须保留许可证和 NOTICE 要求。

### 6.1 技术候选核验（2026-07-17）

| 候选 | 适合点 | 主要风险 | 当前建议 |
|---|---|---|---|
| 自研 typed memory domain | 精确实现确认、来源、版本、删除和共享边界；TypeScript/CloudBase最顺 | 需要自己做提取与检索评测 | **POC-1 主路径** |
| Mem0 | Apache-2.0；成熟的通用记忆层，支持自托管与混合检索 | 新版开源 SDK 已移除 graph store，且 ADD-only 提取不等于本项目的更新/失效/删除语义 | 作为离线对照和提取/召回基线，不直接成为事实源 |
| Graphiti | Apache-2.0；双时态事实、来源 episode、增量更新、语义＋关键词＋图检索最贴合阶段变化 | Python＋图数据库增加运维和删除复杂度，小数据 POC 成本过高 | **POC-2 首选实验支线**，先适配接口再压测 |
| Letta | 持久 memory blocks、archival memory、stateful agent 能力完整 | 以“Agent状态管理”为中心，可能接管过多产品边界；常驻块易把不相关画像塞入上下文 | 借鉴上下文层级，不把整套 runtime 引入 POC-1 |
| MemOS | Apache-2.0；覆盖多形态记忆、混合检索和技能复用 | 范围大、演进快，产品治理语义仍需自建 | 研究候选，不进入首版关键路径 |
| Second Me | Apache-2.0；分层个人模型、本地隐私、数据导入与身份演进 | 本地训练/个人模型重，不适合云端多租户小程序首版 | 借鉴数据分层与导入导出，不采用“每用户训练模型”路线 |
| Hermes Agent | MIT；事实记忆、历史搜索、用户建模和 Agent 自建/自改技能形成完整学习闭环 | 面向个人常驻 Agent/本机或服务器运行，权限面和运行时过重；“自改技能”还带错误固化与供应链风险 | 借鉴程序性记忆、写入审批和技能回滚，不把整套 runtime 用作多租户小程序后端 |
| Grok Build | Apache-2.0；官方开源Agent Loop、上下文组装、工具调度、Skills、Plugins、Hooks、MCP、Subagents、沙箱和审批 | Rust编码Agent，权限面和交互形态不适合直接成为微信个人助理后端 | 审计Agent状态机、Tool Call、Skill加载、上下文预算和审批；在TypeScript领域层实现最小子集 |
| Grok-1开放权重 | Apache-2.0；可研究314B MoE架构和权重加载 | 预训练基础模型、非对话微调、8K上下文、部署极重且能力代际落后 | 不进入POC；不因名称是Grok就替代当前强模型 |
| Grok Prompts | 可参考公开的搜索、记忆和工具描述方式 | AGPL-3.0；Prompt也不能替代Agent Runtime和评测 | 只研究原则，不直接复制到产品Prompt |

一手来源：Mem0 <https://github.com/mem0ai/mem0> 与迁移说明 <https://docs.mem0.ai/platform/features/graph-memory>；Graphiti <https://github.com/getzep/graphiti>；Letta Memory Blocks <https://docs.letta.com/guides/core-concepts/memory/memory-blocks>；MemOS <https://github.com/MemTensor/MemOS>；Second Me <https://github.com/mindverse/Second-Me>；Hermes Agent <https://github.com/NousResearch/hermes-agent>；Grok Build公告 <https://x.ai/news/grok-build-open-source> 与源码 <https://github.com/xai-org/grok-build>；Grok-1 <https://github.com/xai-org/grok-1>；Grok Prompts <https://github.com/xai-org/grok-prompts>。

**当前优先级调整：**

1. POC-1 先实现自有 `Observation → MemoryCandidate → ProfileItem` 领域模型和 InMemory/CloudBase repository；不要先部署图数据库，也不要每用户训练模型。
2. 用同一组虚构中文连续对话，把自研实现、Mem0 和 Graphiti 做离线 A/B；只有 Graphiti 在冲突、阶段变化和删除传播上显著更好时，才进入 POC-2 服务化。
3. 完整通用Agent Runtime仍后置，但POC-1必须实现自有Hermes-lite：三类Skill、三个读取工具、最多3步Agent Loop和统一Policy Engine。它不等于引入Hermes个人本机Runtime，也不允许模型自改生产Skill。

### 6.2 OpenSpec迭代决策（2026-07-17已确认）

后续结构性改动使用OpenSpec管理单次变更，但不替代产品主计划和研发交接：

- `PRODUCT-PLAN.md`继续保存长期目标、架构边界和阶段退出条件；
- `PRODUCT-HANDOFF.md`继续保存决策依据、外部证据、真实状态和未决问题；
- `openspec/specs/`在初始化后保存当前已生效的系统行为契约；
- `openspec/changes/`保存活跃变更的proposal、design、tasks和spec delta；
- 完成验证后同步规格并归档，保留完整决策与实施轨迹。

采用OpenSpec 1.x动作式OPSX工作流，不依赖旧版`/openspec:proposal`命令。当前只完成采用决策和项目规则文档，尚未安装CLI或运行`openspec init`。初始化必须先检查Node版本和生成diff，不能覆盖现有`AGENTS.md`、隐私规则或产品文档职责。详细规则见`docs/OPENSPEC-WORKFLOW.md`。

官方来源：<https://github.com/Fission-AI/OpenSpec>、<https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md>、<https://github.com/Fission-AI/OpenSpec/releases>。

## 7. CloudBase 与模型底座决策

### 7.1 当前结论

**首版优先使用 CloudBase 作为微信应用底座和模型网关，但不把记忆系统、Prompt、模型路由和产品智能绑定给 CloudBase。**

CloudBase 当前官方能力已核验：

- 小程序 OpenID、云函数、文档数据库、对象存储和日志；
- 小程序/Web/Node/cURL/OpenAI/Anthropic 等调用方式；
- 多轮对话、流式输出、深度思考、多模态理解、上下文缓存/管理和工具调用；
- 内置支持 DeepSeek、混元、MiniMax、Kimi、GLM 等模型；
- 标准版及以上可配置任意兼容 OpenAI Chat Completions、Responses 或 Anthropic Messages 的第三方模型；
- 体验模型当前只提供混元；自定义模型的并发取决于第三方提供商。

官方来源：

- <https://docs.cloudbase.net/ai/model/overview>
- <https://docs.cloudbase.net/ai/introduce>
- <https://cloud.tencent.com/document/product/876/75213>

### 7.2 为什么首版选 CloudBase

1. 最终入口就是微信小程序，身份、云函数、存储和流式模型调用链最短；
2. 能用一个后端接入多家国内模型，减少首版接入和合规摩擦；
3. 支持自定义 OpenAI/Anthropic 兼容模型，不必永久绑定混元；
4. 适合验证“最终平台＋最小业务”，比先自建 Kubernetes/多云后端更可逆。

### 7.3 不能交给 CloudBase 的部分

- 用户长期记忆的事实模型、时间线、冲突和删除规则；
- Observation → Memory Candidate → Profile Item 的治理；
- Prompt、ContextBuilder、Policy Engine 和安全边界；
- 模型质量评测、路由、降级和供应商切换；
- 家庭/亲友授权关系和最小共享范围；
- 产品级行动跟进与效果反馈。

这些必须放在自有领域层，并通过 `ModelAdapter`、`MemoryStore`、`Retriever`、`PolicyEngine` 接口与 CloudBase 隔离。

### 7.4 正确调用边界

```text
小程序
→ 自有 Conversation API / 云函数
→ 身份与策略校验
→ 记忆检索和 ContextBuilder
→ Model Router
→ CloudBase 内置模型或自定义模型
→ Schema 校验
→ 流式回复
→ 异步记忆候选与行动候选
```

小程序不能为了省事直接调用模型并绕过服务端。否则无法可靠执行记忆治理、权限、审计、限流、模型切换和成本控制。

### 7.5 首版模型策略

不提前指定唯一“最好模型”。首版通过 CloudBase 接入至少三类候选：

1. **快速/低成本模型：**普通聊天、分类、记忆候选提取；
2. **强推理模型：**复杂方案、重要决策和长上下文；
3. **多模态模型：**图片和文件理解。

候选从 CloudBase 当前可用的 DeepSeek、Kimi、GLM、MiniMax、混元中选取，并允许未来接入通义千问或火山方舟模型。选型依据必须是我在自建评测集，而不是厂商榜单。

### 7.6 “是否比豆包更聪明”的验收方法

采用同一组纯虚构 persona 和连续对话脚本，对豆包、元宝、Kimi、千问和我在做黑盒对比：

1. 首轮通用问题质量；
2. 30轮后的相关记忆召回；
3. 新旧信息冲突和阶段演进；
4. 方案是否使用真实个人约束；
5. 建议是否可执行、是否跟进结果；
6. 记忆来源、纠正、删除和临时对话；
7. 语音入口摩擦、首字延迟和完整回复延迟；
8. 幻觉、迎合、敏感场景和越权共享。

必须区分：

- **基础模型更强：**同样上下文下答案更好；
- **产品更懂用户：**因为记忆、检索和时间线而更贴合；
- **产品更好用：**入口、延迟、行动和控制更顺滑。

我在首版主要争取后两项，不承诺基础模型全面超过大厂。

## 8. v3.1执行交接（入口策略已由v3.2补充）

`PRODUCT-PLAN.md`已于2026-07-17正式升级为v3.1，以下变化已经进入主计划，不再是待讨论事项：

1. 首阶段面向成年人个人用户，覆盖独身与有家庭者；
2. 首版必须接入真实LLM并验证两轮记忆影响回答；
3. 首页由“记录工具”改成微信式对话入口；
4. 记忆中心、临时对话、删除传播和A/B隔离进入POC-1；
5. 完整React后台、守望、家庭关系和分享后置；
6. CloudBase负责微信应用底座和模型网关，自有领域层掌握记忆、路由、策略和行动；
7. 先完成成年人AI闭环，再依次进入行动、语音多模态、老人、儿童和亲友协作。
8. POC-1包含Hermes-lite Agent Loop、Skill路由和一次真实白名单工具调用，而不只是记忆注入；
9. 结构性迭代使用OpenSpec提案、验证、同步和归档，但产品计划、交接与README继续各司其职。

当前旧POC代码仍有复用价值：文字/语音/图片输入壳、CloudBase云函数结构、领域测试和Git隐私隔离。旧首页、`entries`记录模型、`private/shared`分享和“守望”不能继续决定产品主链路，应在实现Conversation领域时逐步迁移或后置。

立即执行顺序：

```text
名称注册
→ Second Me与记忆框架源码审计
→ Conversation契约和Model/Memory接口
→ OpenSpec初始化与首个Hermes-lite change确认
→ 正式AppID＋CloudBase真实模型
→ Skill路由、白名单工具、两轮记忆、记忆中心、临时对话、删除和A/B隔离
→ 国内竞品黑盒评测
→ 行动闭环
```

## 9. 仍待验证的关键问题

1. `我在`能否通过微信小程序名称实时注册；
2. Second Me、Mem0、Letta、Graphiti、MemOS中哪些代码可复用，哪些仅借鉴思想；
3. CloudBase当前候选模型中，fast/reasoner/multimodal各自默认模型、延迟和成本；
4. POC小数据量的混合检索是否先在云函数内重排，何时引入独立向量服务；
5. 按住说话的ASR供应商、噪声表现和端到端延迟；
6. 国内竞品真实登录后是否已有长期记忆、来源、冲突、修改和删除入口；
7. 小程序订阅消息能否支撑首版行动跟进；
8. 老人模式和儿童模式最终是同一会话壳的策略切换，还是独立体验。

## 10. 文档维护协议

2026-07-17 本轮竞品/技术候选更新及主计划迁入项目 `docs/` 后，重新运行 `npm run verify`：7/7 领域测试、项目结构检查、TypeScript 检查和演示流程均通过；这些结果仍只覆盖 POC-0，不代表 AI 记忆闭环已实现。

每次讨论或实施结束前，Agent 必须判断是否产生了可复用价值。有则更新本文件或主计划，不得只留在聊天历史。

记录格式：

```text
日期 / 状态（候选、已确认、已否决）
结论
依据或来源
对产品/架构/计划的影响
下一步验证
```

主计划与交接文档发生冲突时，先标明冲突，不静默覆盖。v3.2已成为当前执行基线；结构性变更先形成OpenSpec change并确认，再实施、验证、同步生效规格和归档。
