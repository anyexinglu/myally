# 新人冷启动画像问卷

> 所有修改题库、分支逻辑、精选推荐映射必须同步更新本文件。

## 问卷结构（决策树）

```
第1步: 年龄段(单选)
  │
  ├─ 18~25岁 → 身份可选: 上班族 / 学生
  ├─ 26~35岁 → 身份可选: 宝爸宝妈 / 上班族 / 自由职业/个体 / 全职带娃
  ├─ 36~50岁 → 身份可选: 宝爸宝妈 / 上班族 / 自由职业/个体 / 全职带娃
  └─ 50+     → 身份可选: 退休长辈
       │
       └─ 选了宝爸宝妈 → 第3步: 孩子多大(单选)
              │
              └─ 第4步: 感兴趣方向(多选, 动态)
```

## 题库定义

数据源：`miniprogram/data/onboarding-questions.json`

### 第1题：年龄段

| 选项ID | 标签 | 影响技能推荐 |
|--------|------|-------------|
| `youth` | 18~25岁 | 话术润色、情绪树洞 |
| `young-adult` | 26~35岁 | 育儿顾问、话术润色、健身教练 |
| `midlife` | 36~50岁 | 健康问答、育儿顾问、情绪树洞 |
| `senior` | 50岁以上 | 健康问答 |

### 第2题：身份（多选，动态）

| 选项ID | 标签 | 显示条件 | 影响技能推荐 |
|--------|------|---------|-------------|
| `parent` | 宝爸宝妈 | age=young-adult,midlife | 育儿顾问 |
| `office` | 上班族 | age=youth,young-adult,midlife | 话术润色 |
| `elderly` | 退休长辈 | age=senior | 健康问答 |
| `student` | 学生 | age=youth | 话术润色、情绪树洞 |
| `freelancer` | 自由职业/个体 | age=young-adult,midlife | 话术润色 |
| `homemaker` | 全职带娃/顾家 | age=young-adult,midlife | 育儿顾问、情绪树洞 |

### 第3题：孩子多大（单选，仅 role 含 parent 时显示）

| 选项ID | 标签 |
|--------|------|
| `0-1` | 0~1岁（婴儿期） |
| `2-3` | 2~3岁（幼儿期） |
| `4-6` | 4~6岁（学龄前） |
| `7-12` | 7~12岁（小学） |
| `13+` | 13岁以上 |

### 第4题：感兴趣方向（多选，动态）

| 选项ID | 标签 | 显示条件 | 影响技能推荐 |
|--------|------|---------|-------------|
| `parenting` | 🧸 育儿成长 | role=parent,homemaker | 育儿顾问置顶 |
| `health` | 🩺 健康养生 | 所有人 | 健康问答置顶 |
| `fitness` | 🏃 运动健身 | age=youth,young-adult,midlife | 健身教练置顶 |
| `career` | 💼 职场效率 | role=office,freelancer | 话术润色置顶 |
| `food` | 👨‍🍳 美食生活 | 所有人 | 家常菜厨子置顶 |
| `ai` | 🤖 AI工具 | role=office,freelancer,student | 话术润色置顶 |
| `companion` | 🌳 情感陪伴 | 所有人 | 情绪树洞置顶 |
| `tech-elderly` | 📱 手机电脑技巧 | role=elderly | 健康问答 |

## 存储格式

存入 `profile_items` 集合：
```json
{
  "key": "user_profile",
  "type": "current_state",
  "value": "用户画像：age: young-adult；role: parent,office；kid-age: 2-3；interests: parenting,health,ai",
  "sourceType": "explicit_user_statement",
  "confidence": "confirmed",
  "sensitivity": "general"
}
```

## 精选页推荐映射

实现位置：`miniprogram/pages/featured/index.ts` 中的 `getSortedSkills(profile)` 函数。

映射规则：
1. 读取当前用户的 `user_profile` 中的 interests 列表
2. 按 interests 调整 skills 排序：匹配的兴趣技能放在前 4 位，其余保持原序
3. 无画像数据时不调整顺序（现有 8 个技能默认排序）
4. 每日/每周自动根据画像变化重新排序

## 管理员查看

入口：「我的」页面 → 「用户画像统计」按钮（仅管理员 openid 显示）。
实现：调 conversations 云函数 `action: 'listAllProfiles'`，返回所有用户的 user_profile 记录。
