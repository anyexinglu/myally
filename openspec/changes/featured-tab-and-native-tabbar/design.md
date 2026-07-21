## Context

小程序上线三个主 tab 前，首页和“我的空间”使用 `app.wxss` 中 `.bottom-nav` 自绘胶囊导航（fixed 定位，高 104rpx，bottom 22rpx + safe-area），首页输入框 `composer-zone` 以 `bottom: calc(144rpx + env(safe-area-inset-bottom))` 避开该导航，跨页用 `wx.redirectTo` 切换。新增原生 `tabBar` 后，微信客户端会把 tab 页可视区域收缩到 tabBar 上沿，fixed 定位与 `100vh` 均以该区域为基准，因此自绘导航必须删除，否则与原生 tabBar 叠成双层底栏。

## Decisions

### 1. 原生 tabBar 三项，纯文字

`app.json` 增加 `tabBar.list`：`pages/home/index`（聊天）、`pages/featured/index`（精选）、`pages/mine/index`（我的）。不配置 `iconPath/selectedIconPath`，避免引入图片资源；颜色沿用设计语言：未选 `#6f7a76`、选中 `#2aaa80`、白底。`watch` 与 `devtest` 保留在 `pages`，作为非 tab 页存在。

### 2. 精选页数据与结构

- 数据：从 AI 超市项目原样复制 `tools.json`（14 条）与 `solutions.json`（7 条）至 `miniprogram/data/`，字节级一致，不改写。
- 引用：`miniprogram/tsconfig.json` 增加 `resolveJsonModule` 与 `esModuleInterop`，页面用 `import toolsData from '../../data/tools.json'` 加载；小程序运行时 CommonJS `require` 原生支持 JSON。
- 页面：`pages/featured/index.{ts,wxml,wxss,json}`，导航栏标题「精选」。顶部 segment 控件切换 `skills / info` 两板块；技能卡片含名称、一句话介绍、难度、免费标签与「复制官网」按钮（`wx.setClipboardData` 复制 URL，使用默认 toast）；信息卡片含标题、适用人群，点击卡片头展开/收起分步步骤，步骤内工具名保持纯文本。
- 样式：复用 `app.wxss` 的 `.container/.card/.tag/.hint` 体系，白底＋薄荷绿，大字号，中老年可读。

### 3. 既有页面适配

- home：wxml 删除自绘 `.bottom-nav` 节点；wxss 把 `.composer-zone` 的 `bottom` 改为 `0`（原生 tabBar 之上即视口底部）；`.message-list` 的 `calc(100vh - 212rpx)` 在 tab 页自动排除 tabBar 高度，无需改动；未再被引用的 `goMine/goWatch` 从 ts 移除。
- mine：wxml 删除自绘 `.bottom-nav`；`goHome` 改为 `wx.switchTab`。
- watch：非 tab 页，保留自绘导航作为返回入口，但 `goHome/goMine` 改为 `wx.switchTab`（`redirectTo` 不能跳转 tab 页）。
- devtest：仍由 mine 页 `wx.navigateTo` 进入，不改动。

### 4. 校验与回滚

`scripts/validate-project.js` 增加 featured 四件套为必需文件，并断言 `app.json` 注册了 featured 页且 tabBar 恰好包含 home/featured/mine 三项。回滚方式为还原 Git 提交，不涉及云端或计费状态。

## Risks / Trade-offs

- [原生 tabBar 视口收缩与预期不符，输入框被遮挡] → 以 `bottom: 0` 依赖客户端标准行为，开发者工具与真机视觉复查确认；未发现时先回滚本 change。
- [与活跃 change `release-review-hardening` 的“正式包移除 watch/devtest”规划存在方向差异] → 本 change 按用户当前指令保留 watch/devtest，两个 change 归档时在文档中显式对齐，不静默选择。
- [devtools 对 TS import JSON 的编译差异] → 本地 `tsc --noEmit` 已覆盖类型；若 devtools 编译异常，降级为在 `data/` 下生成同名 `.ts` 导出模块，JSON 保持只读源。
