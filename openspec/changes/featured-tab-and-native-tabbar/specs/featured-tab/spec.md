# featured-tab 规格增量

## ADDED Requirements

### Requirement: 精选页展示技能板块

精选页 SHALL 以卡片列表展示 AI 工具数据，每张卡片 MUST 包含名称、一句话介绍、上手难度、免费标签和「复制官网」按钮；点击「复制官网」MUST 调用 `wx.setClipboardData` 复制该工具官网 URL。

#### Scenario: 用户浏览技能板块并复制官网

- **WHEN** 用户进入精选页默认的技能板块并点击某张工具卡片的「复制官网」
- **THEN** 剪贴板内容为该工具数据中的 `url`，页面不跳转、不调用任何云函数或外部接口

### Requirement: 精选页展示信息板块

精选页 SHALL 提供「技能 / 信息」顶部 segment 切换；信息板块 MUST 以卡片列表展示场景方案，每张卡片包含标题与适用人群，点击卡片头可展开/收起分步步骤，步骤中的工具名以纯文本展示。

#### Scenario: 用户切换板块并展开方案

- **WHEN** 用户点击 segment 的「信息」并点击某个方案卡片头
- **THEN** 该卡片展开显示全部分步步骤，再次点击收起；其他卡片展开状态不受影响

### Requirement: 原生 tabBar 三 tab 导航

小程序 SHALL 配置原生 tabBar，按序包含聊天（home）、精选（featured）、我的（mine）三项；watch 与 devtest 保留为注册页面但 MUST NOT 出现在 tabBar；tab 页之间切换 MUST 使用 `wx.switchTab` 语义（由原生 tabBar 或等效 API 完成）。

#### Scenario: 用户在三个主页面间切换

- **WHEN** 用户依次点击 tabBar 的聊天、精选、我的
- **THEN** 三个页面分别正常展示，首页聊天输入框贴合 tabBar 上沿、消息滚动区高度正确，不出现自绘导航与原生 tabBar 叠加的双层底栏
