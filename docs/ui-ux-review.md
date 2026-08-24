# 「来都来了」公开端 · UI/UX 评审报告

> 评审人：界面交互设计专家
> 评审范围：公开端 HomePage / ExplorePage / CityExplorePage / TodayPlanPage / CityTicketSheet
> 基线：移动优先 H5，max-width 480px，深色玻璃 + 酸橙 (#c7ff1f) 品牌色
> 标准：WCAG 2.2 AA、移动端 44px 最小 tap target、仅动画 transform / opacity

---

## 0. 执行摘要

走查 5 个核心页面（含票根弹层）后，发现 **11 项问题**，按严重程度分：

| 级别 | 数量 | 主要风险 |
|---|---|---|
| 🔴 P0 | 3 | 无障碍红线（键盘可达、缩放、字号） |
| 🟡 P1 | 5 | 桌面体验、小屏适配、焦点反馈、对比度边界 |
| 🟢 P2 | 3 | 跳过导航、字号 token 化、可读性细节 |

**建议先动 P0 三条**，属于「合规 + 可用性」硬指标，单点改动即可解锁。

---

## 1. 设计基础现状

| 维度 | 现状 | 评估 |
|---|---|---|
| 主色 | #c7ff1f（品牌酸橙）+ #02070e（深玻璃）| ✓ 调性统一，对比度 ≥14:1 |
| 文本 | #f7f9fb / rgba(255,255,255,.62) | ⚠ 主文本 OK，rgba(.62) 在玻璃上接近 4.5:1 边界 |
| 字号 | 8/9/10/11/12/13/14/15/17/18/20/22/24/27/30/31 px | ⚠ **8/9px 在移动端属于"几乎不可读"**（WCAG 推荐 ≥12px 或支持缩放） |
| 间距 | 8px 基线 | ✓ 整体符合 |
| 组件 | Tailwind 原子类 + 部分任意 px | ⚠ 8/9/10/11 这种 px 应抽离为 token |
| 移动断点 | max-width 480px | ⚠ 桌面浏览器打开只有居中 480，两侧黑边 |
| 小屏适配 | 仅 CityExplorePage / HomeHero / PersonaSelector 有 ≤370/360 适配 | ⚠ CityTicketSheet 等无 |

---

## 2. 逐页评审

### 2.1 HomePage · /

**做得好的**
- hero + persona 面板 + 灵感轮播 + 今日计划的层次清晰
- 「先确认今天想去的地方」（已在 CityExplorePage 修复换行）
- 时段问候、页脚彩蛋已加
- 雨天雨季条、空态提示、demo 提示、人格卡渐变兜底都到位

**仍存在的问题**
- InspirationCarousel 卡片 clickable `<button>` 缺 `aria-label="查看{地点}详情"`
- 灵感卡 `.rec-card` 缺焦点态（键盘 tab 时无视觉反馈）
- hero 区在某些 4G/弱网下，天气请求未到时显得空荡（**建议加骨架或 hero 占位**）

### 2.2 ExplorePage · /explore

**做得好的**
- 列表 + 分类筛选 + 搜索 + 地图视图功能完整
- 距离/雨天信息传递一致
- 大页拉取（limit 60）已提速

**仍存在的问题**
- 加载陪伴小话已加，但**骨架屏本身没有 aria-live**（屏幕阅读器不知道「正在加载」）
- 搜索框无清除按钮聚焦状态（`focus-visible` 缺）
- 搜索结果为空 + 分类为空两条空态文案仍可进一步差异化（"这个分类还在筹备中" vs "没找到匹配"）

### 2.3 CityExplorePage · /#/city

**做得好的**
- swipe 确认流 + 卡叠视觉有「特种兵」个性
- 已修：换行 / 卡片首屏可见
- 救星揭晓爆彩、集章的承接位置合理

**仍存在的问题**
- swipe 操作在触屏有 92px 阈值，但**键盘用户完全无法操作**（`touch-action: none` + 拖拽逻辑）。建议给核心按钮（左右两个圆形 action）已可点击触发，但需要把 action 按钮扩到 72×72px（当前 62×62px 略小）
- 卡片 body 中的 "为什么适合{画像}" 理由列表 `<li>` 没有语义标题层级（其实是 `<ul>`+`<li>`，可接受）
- `.mode-kicker` 的"⚡ {画像}模式已开启"emoji 是装饰，应 `aria-hidden`（当前缺）

### 2.4 TodayPlanPage · /#/today-plan

**做得好的**
- 6 站管理 + 集章进度格 + 节奏条 + 票根入口都很完整
- 票根保存成功闭环（sheet 关闭 + 顶部横幅）顺畅
- POI 变更一键刷新、清空确认弹层（浅色弹层）等都到位

**仍存在的问题**
- 顶部 summary 卡的 "本机保存" 标签对用户无意义，建议改为更友好的"今日保存于本机"
- 节奏条右侧的 "松弛 ··· 特种兵" 数字边界（16–100%）对小屏可能显示不全
- "纠结救星" 抽签的随机算法基于 `Math.random`，不是密码学随机但不影响 UX

### 2.5 CityTicketSheet · 今日票根

**做得好的**
- 已实现入场动画（卡片从地图冒出）
- 分享系统面板 + 入相册（移动端 share files）
- 分享成功后爆彩

**仍存在的问题**
- `max-w-md` 容器在桌面浏览器下只占 448px 居中，看起来很空（**属于 P1 桌面布局**）
- 票根 PNG 始终 1080×1600 横屏大，桌面打开时预览区视觉占比小
- 底部按钮文字 "保存图片 / 分享票根" 在桌面端应考虑并排 + 加副文案（移动端可只显示图标）

---

## 3. 无障碍合规检查（WCAG 2.2 AA）

| 准则 | 条款 | 现状 | 等级 |
|---|---|---|---|
| 缩放可达 200% | 1.4.4 | ❌ `viewport` 禁用了缩放（`maximum-scale=1.0, user-scalable=no`） | **P0** |
| 对比度（文本） | 1.4.3 | 主文本 ≥ 14:1 ✓；rgba(.62) 玻璃副文本接近 4.5:1 边界 | P1 |
| 对比度（非文本/UI） | 1.4.11 | 缺 focus ring | **P0** |
| 键盘可访问 | 2.1.1 | swipe 操作仅触屏可达；缺全局 `:focus-visible` | **P0** |
| 焦点可见 | 2.4.7 | 完全没有 `outline` / focus 样式 | **P0** |
| 标题层级 | 2.4.6 | 各页 h1/h2 基本合理 | ✓ |
| 标签 / 名称 | 2.5.3 | 大部分按钮有 `aria-label`；部分缺（见问题清单） | P2 |
| 触摸目标 | 2.5.5 | 大部分 ≥44px ✓；swipe 操作按钮 62px 略大但可接受 | ✓ |

---

## 4. 响应式与移动优先

| 检查项 | 现状 | 等级 |
|---|---|---|
| 移动端 320px 起点 | ✓ 整体 OK | ✓ |
| ≤370px 小屏 | 仅 3 个页面有适配 | **P1** |
| 平板 / 桌面 | H5 在桌面浏览器只有居中 480px，两侧黑边 | **P1** |
| 横屏 | 未特殊处理（H5 锁竖屏可接受） | — |
| viewport 配置 | `maximum-scale=1.0, user-scalable=no` | **P0**（见上） |

---

## 5. 微交互与动效

| 检查项 | 现状 | 评估 |
|---|---|---|
| 时长 | 200–1100ms（含入场动画），单步交互 0.2–0.4s | ✓ |
| 性能 | 仅 transform / opacity | ✓ |
| 成功反馈 | 彩带/盖章/横幅/票根动画 | ✓ |
| 触感 | Android 触觉触发，iOS 自动 no-op | ✓ |
| 错误反馈 | toast 文案到位 | ✓ |
| 状态 | 缺统一的 hover/press/focus 视觉规范 | P1 |

---

## 6. 问题清单（按优先级）

### 🔴 P0（必改）

1. **viewport 禁用缩放**（WCAG 1.4.4）
   - 文件：`client/index.html` line 5
   - 影响：低视力/老年用户无法放大内容

2. **全局无 focus 样式**（WCAG 2.4.7 / 2.1.1）
   - 文件：`client/src/assets/styles/main.css`
   - 影响：键盘用户不知道当前焦点位置，Tab 几乎不可用

3. **8/9px 字号过小**
   - 文件：`text-[8px]`、`text-[9px]` 出现在 TodaySpotCard / CityTicketSheet 等多个文件
   - 影响：低视力用户难辨，移动端 WCAG 实际建议 ≥12px

### 🟡 P1（应改）

4. **桌面浏览器布局空白**（H5 在桌面无合理体验）
5. **≤370px 小屏适配不全**（CityTicketSheet 等可能溢出）
6. **swipe 操作键盘可达性**（核心操作无键盘入口）
7. **`rgba(.62)` 副文本对比度边界**
8. **InspirationCarousel 卡片缺 `aria-label`**

### 🟢 P2（打磨）

9. **缺 skip-to-content 跳转**
10. **混合任意 px 字号，应抽离 token**
11. **emoji 装饰元素缺 `aria-hidden`**

---

## 7. 修复建议（含代码示例）

### P0-1 修复 viewport

```html
<!-- client/index.html -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```
去掉 `maximum-scale=1.0, user-scalable=no`。

### P0-2 全局 focus 样式

```css
/* assets/styles/main.css 追加 */
*:focus-visible {
  outline: 2px solid #c7ff1f;
  outline-offset: 2px;
  border-radius: 8px;
}
/* 公开 body 上给文本元素清晰的轮廓 */
body.public :focus-visible {
  outline-color: #4ade80; /* 深底场景用亮绿，浅底用酸橙 */
}
```

### P0-3 字号下限

最低提到 `text-[11px]`（允许缩放下实际可达 12px+）。文案"8/9px"的视觉密度用 `letter-spacing` 增强可读性，或整体上调到 `text-xs` (12px) + `font-weight: 700`。

### P1-4 桌面布局

```css
/* assets/styles/main.css */
@media (min-width: 768px) {
  body {
    background: #0a1018 radial-gradient(circle at top, #131c2c 0%, #05080d 70%);
  }
  .home-page,
  .explore-page,
  .today-plan-page {
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.5);
    border-radius: 32px;
    margin: 32px auto;
    overflow: hidden;
  }
}
```

### P1-5 小屏适配

CityTicketSheet 等加：
```css
@media (max-width: 360px) {
  .ticket-preview { padding: 16px; }
  .fan-stage { height: 150px; }
  .fan-card { height: 134px; width: 96px; }
}
```

### P1-6 键盘可达性

在 swipe 卡片下方增加键盘可达按钮组：
```vue
<div role="group" aria-label="选择当前地点">
  <button @click="swipe('skip')" aria-label="跳过">×</button>
  <button @click="swipe('add')" aria-label="加入今天">✓</button>
</div>
```
（已有，但需给 swipe 卡片本身加 `tabindex="0"` + `aria-label` + 键盘左右键支持）

### P1-8 InspirationCarousel aria-label

```vue
<button
  :aria-label="`查看${card.title}的详情`"
  @click="emit('select', card)"
>
```

---

## 8. 建议先做的（性价比最高）

按"小改动 + 大影响"排序：

1. **P0-1 viewport 缩放** —— 1 行改动，符合 WCAG
2. **P0-2 focus-visible** —— 1 个 CSS 块，键盘用户立刻受益
3. **P1-8 aria-label** —— 1 行改动，屏幕阅读器受益
4. **P0-3 字号下限** —— 批量替换，集中在两三个文件

预计 **< 100 行代码改动**即可解锁 P0 + 大部分 P1。

---

## 9. 长期建议（不在本轮范围）

- **设计 token 化**：把 `text-[10px]` 类的任意 px 收敛到 `text-2xs / xs / sm / md / lg` 体系
- **Storybook / 设计系统**：随着项目成长，把核心组件（票根、卡片、按钮、确认弹层）抽出文档化
- **暗色 + 亮色双主题**：当前只有深色玻璃 + 公开浅色 body；统一 token 后可扩展
- **数据可视化**：今日计划、票根的"个人数据"沉淀（足迹册）需要数据可视化能力