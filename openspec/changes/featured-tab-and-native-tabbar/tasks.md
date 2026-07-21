## 1. 规格与数据

- [x] 1.1 创建 featured tab 的 proposal、design、spec 和任务清单
- [x] 1.2 原样复制 AI 超市 `tools.json` / `solutions.json` 到 `miniprogram/data/` 并校验字节一致

## 2. 页面与 tabBar 实现

- [x] 2.1 `app.json` 注册 featured 页并新增原生 tabBar 三项（聊天/精选/我的）
- [x] 2.2 实现 `pages/featured` 四件套：segment 切换、技能卡片、信息卡片、复制官网
- [x] 2.3 tsconfig 支持 JSON import（`resolveJsonModule`/`esModuleInterop`）
- [x] 2.4 home/mine 移除自绘导航，composer-zone 适配原生 tabBar，跨 tab 跳转改 `wx.switchTab`

## 3. 验证与文档

- [x] 3.1 `scripts/validate-project.js` 增加 featured 页面与 tabBar 断言
- [x] 3.2 运行 `npm run verify`（测试、结构、TypeScript、演示）与 OpenSpec 严格校验
- [x] 3.3 更新 README 功能清单与 docs/PRODUCT-HANDOFF.md（结论→依据→影响→待验证）
