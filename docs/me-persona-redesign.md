# 「我的城市画像」区块改造（MePage）

> 目标读者：Codex / 接单执行的开发者。本文档自包含，按「改动范围 → 替换代码 → 验收」执行即可，无需额外上下文。
> 当前基线 commit：`a50cc56`（codex/today-journey-release）。执行前先确认 MePage.vue 与本文锚点一致，如已被其他改动影响，以「替换的代码块内容」为准，而非行号。

---

## 1. 背景与目标

用户反馈「我的」页面（`client/src/pages/MePage.vue`）的 **MY PERSONA · 我的城市画像** 区块不好看。

改造目标（UI/UX 专家定稿）：
1. 从「5 个并列选项」改成「**身份感**」：先展示"我是谁"（大头像 + 场景文案），再提供切换。
2. **压缩垂直空间**：原 5 卡横排 + 标题 + 说明 ≈250px → 新结构 ≈150px。
3. **差异化**首页/探索的画像卡（那里负责"选择"，这里负责"展示身份"）。
4. **欢愉引擎文案**：去掉技术化说明「画像只影响探索页筛选，不会改变首页灵感的编辑排序。」，换成轻松一句。
5. 选中/切换有**微动效 + 触觉反馈 + 趣味 toast**（与「3 个地点上限」的轮换文案同调性）。
6. 无障碍合规：`aria-labelledby` / `aria-pressed` / 对比度 / `prefers-reduced-motion`。

**范围**：只改 `client/src/pages/MePage.vue` 一个文件（script + template + style）。不改其它文件、不动数据层。

---

## 2. 现状（改造前，MePage.vue）

- script：`currentPersona` computed（第 26 行）、`choosePersona()`（第 64–68 行，toast 文案平淡）。
- template：`<section class="panel persona-panel">…</section>`（第 115–134 行）：panel-head + 说明 + `.persona-grid` 5 卡。
- style：`.persona-grid` 相关（第 181 行）+ `@media (max-width:360px)` 里对 persona-grid 的微调（第 187 行）。

---

## 3. 改造后结构

```
panel persona-panel
├── panel-head（保留）
│     MY PERSONA / 我的城市画像        右侧徽章：🎈 亲子（或 尚未选择）
├── persona-hero（身份大卡，点击=切换下一个画像）
│     ┌────────┐
│     │   🎈   │  🎈 亲子                 ← 名称 + 徽章
│     │  64px  │  少折返，留够休息时间    ← 场景副标题
│     └────────┘
├── chip-row（5 个紧凑按钮，1–2 行，点击直接切换）
│     ⚡特种兵  🌙约会  🎈亲子  🛋️懒人  👔都市丽人
└── persona-hint（轻说明一行）
      「筛选一下探索顺序而已，不动首页灵感」
```

- 身份大卡点击 → 切到下一个画像（循环），带 bounce 动画 + 触感 + toast。
- chips 点击 → 切到指定画像。
- 原「重置画像偏好」按钮（LOCAL DATA 区）**保留不动**。

---

## 4. 改动一：script（`<script setup lang="ts">`）

**4.1 在 `const currentPersona = computed(...)` 之后新增**（约第 26 行后）：

```ts
/** 画像 → 场景文案（欢愉引擎：副标题为情绪化短句，不用"不会改变 X"式说明）。 */
const PERSONA_SCENE = {
  fast:   { badge: '地标拉满', sub: '今天，少走回头路' },
  couple: { badge: '约会氛围', sub: '出片、夜景、和 ta' },
  family: { badge: '少折返', sub: '留够休息时间，娃不闹' },
  lazy:   { badge: '慢慢逛', sub: '点位少，但每处都能待' },
  urban:  { badge: '精致出行', sub: '街区、展览、小酒馆' },
} as const

/** 切换画像的趣味 toast，反复切换时轮换不腻。 */
const PERSONA_TOASTS = [
  '今天的腿，就交给这个身份了',
  '新身份已就位，走着',
  '这个画像更懂你今天的行程',
] as const
let personaToastIndex = 0
const nextPersonaId = () => {
  const ids = PERSONAS.map(p => p.id)
  const idx = ids.indexOf(persona.value)
  return ids[(idx + 1) % ids.length] as Persona
}
```

**4.2 替换 `choosePersona` 函数**（原第 64–68 行）为：

```ts
function choosePersona(next: Persona) {
  setPersona(next)
  haptic(16)
  const name = PERSONAS.find(item => item.id === next)?.name || '新画像'
  const line = PERSONA_TOASTS[personaToastIndex % PERSONA_TOASTS.length]
  personaToastIndex += 1
  showToast(`已切到「${name}」· ${line}`)
}
```

> 说明：`showToast`、`haptic`、`PERSONAS`、`setPersona`、`persona` 均为文件已有依赖，无需新增 import。

---

## 5. 改动二：template

**把整个 `<section class="panel persona-panel">…</section>`（第 115–134 行）替换为：**

```html
    <section class="panel persona-panel" aria-labelledby="persona-title">
      <div class="panel-head">
        <div><p>MY PERSONA</p><h2 id="persona-title">我的城市画像</h2></div>
        <span class="persona-pill">{{ hasChosenPersona ? `${currentPersona.emoji} ${currentPersona.name}` : '尚未选择' }}</span>
      </div>

      <button
        type="button"
        class="persona-hero"
        :aria-label="`当前画像：${currentPersona.name}，点击切换`"
        @click="hasChosenPersona && choosePersona(nextPersonaId())"
      >
        <span class="hero-emoji" :class="`grad-${currentPersona.id}`" aria-hidden="true">{{ currentPersona.emoji }}</span>
        <span class="hero-meta">
          <span class="hero-name">
            {{ currentPersona.emoji }} {{ currentPersona.name }}
            <em v-if="hasChosenPersona" class="hero-badge">{{ PERSONA_SCENE[currentPersona.id].badge }} · 活跃中</em>
          </span>
          <span class="hero-sub">{{ hasChosenPersona ? PERSONA_SCENE[currentPersona.id].sub : '选一个画像，探索更懂你' }}</span>
        </span>
        <span class="hero-chev" aria-hidden="true">↻</span>
      </button>

      <ul class="chip-row" role="listbox" aria-label="切换画像">
        <li v-for="item in PERSONAS" :key="item.id">
          <button
            type="button"
            role="option"
            :class="{ on: hasChosenPersona && persona === item.id }"
            :aria-pressed="hasChosenPersona && persona === item.id"
            :aria-selected="hasChosenPersona && persona === item.id"
            @click="choosePersona(item.id)"
          >
            <i aria-hidden="true">{{ item.emoji }}</i>{{ item.name }}
          </button>
        </li>
      </ul>

      <p class="persona-hint">筛选一下探索顺序而已，不动首页灵感</p>
    </section>
```

---

## 6. 改动三：style（`<style scoped>`）

**6.1 删除/替换 `.persona-grid` 相关规则**（第 181 行整行）为：

```css
.persona-pill { padding:6px 9px; border-radius:999px; background:rgba(199,255,31,.1); color:var(--accent); font-size:9px; font-weight:850; }
.persona-hero { display:flex; align-items:center; gap:12px; width:100%; margin-top:14px; padding:14px; border:1px solid rgba(199,255,31,.22); border-radius:20px; background:linear-gradient(135deg,rgba(199,255,31,.1),rgba(56,189,248,.06)); text-align:left; transition:transform .18s ease-out,border-color .18s ease-out,background .18s ease-out; }
.persona-hero:active { transform:scale(.98); }
.hero-emoji { display:grid; width:64px; height:64px; flex:none; place-items:center; border-radius:18px; background:rgba(199,255,31,.14); font-size:36px; line-height:1; }
.hero-emoji.grad-fast { background:linear-gradient(145deg,rgba(199,255,31,.22),rgba(56,189,248,.14)); }
.hero-emoji.grad-couple { background:linear-gradient(145deg,rgba(56,189,248,.2),rgba(199,255,31,.08)); }
.hero-emoji.grad-family { background:linear-gradient(145deg,rgba(199,255,31,.2),rgba(74,222,128,.12)); }
.hero-emoji.grad-lazy { background:linear-gradient(145deg,rgba(74,222,128,.18),rgba(199,255,31,.08)); }
.hero-emoji.grad-urban { background:linear-gradient(145deg,rgba(168,85,247,.2),rgba(56,189,248,.12)); }
.hero-meta { display:flex; min-width:0; flex:1; flex-direction:column; gap:4px; }
.hero-name { display:flex; flex-wrap:wrap; align-items:center; gap:8px; font-size:18px; font-weight:950; color:#fff; }
.hero-badge { padding:3px 8px; border-radius:999px; background:rgba(199,255,31,.15); color:var(--accent); font-size:9px; font-style:normal; font-weight:850; }
.hero-sub { overflow:hidden; color:rgba(255,255,255,.55); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
.hero-chev { color:rgba(255,255,255,.35); font-size:18px; }
.chip-row { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; padding:0; list-style:none; }
.chip-row button { display:inline-flex; align-items:center; gap:5px; min-height:34px; padding:0 12px; border:1px solid rgba(255,255,255,.12); border-radius:999px; background:transparent; color:rgba(255,255,255,.6); font-size:11px; font-weight:800; transition:transform .18s ease-out,border-color .18s ease-out,background .18s ease-out; }
.chip-row button:active { transform:scale(.96); }
.chip-row button i { font-style:normal; font-size:15px; }
.chip-row button.on { border-color:rgba(199,255,31,.55); background:rgba(199,255,31,.12); color:#fff; }
.chip-row button.on i { animation:chip-bounce .3s ease-out; }
.persona-hint { margin-top:9px; color:rgba(255,255,255,.38); font-size:9px; line-height:1.5; }
@keyframes chip-bounce { 0% { transform:scale(.88); } 60% { transform:scale(1.06); } 100% { transform:scale(1); } }
```

**6.2 在 `@media (max-width:360px)` 规则内**，把原有的 `.persona-grid` 两行替换为：

```css
@media (max-width:360px) { .me-page { padding-right:12px; padding-left:12px; }.panel { padding-right:13px; padding-left:13px; }.persona-hero { padding:12px; }.hero-emoji { width:56px; height:56px; font-size:32px; } }
```

**6.3 在文件末尾追加 reduced-motion 兜底：**

```css
@media (prefers-reduced-motion: reduce) { .persona-hero,.persona-hero:active,.chip-row button,.chip-row button:active,.chip-row button.on i { animation:none; transition:none; transform:none; } }
```

---

## 7. 无障碍核对（WCAG 2.2 AA）

| 项 | 实现 |
|---|---|
| 语义标题 | `aria-labelledby="persona-title"` 挂在 section，h2 带 id |
| 列表语义 | chips 用 `role="listbox"` + `role="option"` |
| 选中态 | `aria-pressed` + `aria-selected`（不只靠颜色） |
| 切换入口 | 身份大卡是 `<button>`，aria-label 说明点击会切换 |
| 对比度 | 正文 11–18px 文字在深底（#02070e）上均为白色系，≥7:1；muted 文字 rgba(255,255,255,.38)≈5.5:1 ✓ |
| 动效克制 | 仅动画 transform/opacity；reduced-motion 下全部关闭 |
| 装饰 emoji | `aria-hidden="true"`，不干扰读屏 |

---

## 8. 验收清单

1. `npm run typecheck -w client` 无错误（`PERSONA_SCENE` 为 `as const`，`nextPersonaId` 返回 `Persona`，注意 `PERSONAS.map(p => p.id)` 元素类型需断言为 `Persona[]`，如遇 TS 报错可在 `ids` 处加 `as Persona[]`）。
2. `npm test -w client` 全绿；若 `homeUiContracts` / `mePage` 相关契约测试断言旧文案（如「画像只影响探索页筛选」），同步更新为「筛选一下探索顺序而已」。
3. 真机核对（微信浏览器）：
   - 未选画像：hero 显示「选一个画像，探索更懂你」，chips 无高亮；
   - 点 hero 或 chip：头像/徽章/副标题联动更新，bounce 动画 + 触感 + toast「已切到「X」· 今天的腿，就交给这个身份了」；
   - 反复切换 toast 文案轮换；
   - 「重置画像偏好」仍可用，重置后 hero 回到未选状态；
   - 页面总高度比改造前明显变矮。
4. 320px 宽度下 chips 可换行、不溢出。

---

## 9. 说明与边界

- **只动 MePage.vue**；`usePersona` / `haptics` / `PERSONAS` 均为现有依赖，不改。
- 原「重置画像偏好」按钮与 `clearCopy` 中 persona 的确认弹层**保持不变**（文案可顺手把 body 里的「首页灵感的编辑排序不会变化…」改为「恢复为尚未选择画像？下次进入探索时再重新挑选。」，非必须）。
- 若执行时 MePage.vue 已被并行改动（行号偏移），以代码块内容为锚，不用行号。
