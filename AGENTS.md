# AGENTS.md

> 给 AI 编程助手的交接文档。新对话开始时先读这份，再动代码。
> 最后更新：2026-07-31（分支 `codex/route-quality-completion`，工作树有大量未提交改动）。

---

## 1. 项目一句话

**「来都来了」** — 基于用户当前位置的城市漫游 H5：选偏好 + 时长 + 距离，
LLM（DeepSeek）提名地点 → 高德地图 POI 验证补坐标 → 返回 1~3 条差异化路线。
后台是「城市内容编辑部」，编辑城市档案、地点台账，并按 7/14/30 天周期做城市内容复核。

- 前端 H5 + 后台共用一个 Vue 3 SPA（hash 路由）。
- 后端是 Hono，跑在 Cloudflare Pages 的 `_worker.js` 高级模式里，前后端同域。
- 数据库是 Cloudflare D1（SQLite 兼容），本地用 miniflare。

---

## 2. 技术栈与命令

### Workspaces
```
/client   Vue 3 + Vite + TypeScript + TailwindCSS 3 + Vue Router (hash) + axios
/server   Hono + Zod + Cloudflare Workers/Pages + D1，无 ORM（手写 SQL）
```

### 常用根命令
```bash
npm run dev:server     # wrangler dev，后端 http://localhost:3000 （wrangler 4.x 默认端口）
npm run dev:client     # vite，前端 http://localhost:9090
npm run dev            # 并行启前后台（不推荐，日志混杂）
npm run build          # client build + esbuild bundle _worker.js 到 client/dist/
npm run test           # server vitest + client vitest（全部 mock，不联网/不碰 D1）
npm run typecheck      # server tsc + client vue-tsc
```

### Server 专属
```bash
npm run db:migrate:local  -w server
npm run db:seed:local     -w server   # seeds/three-cities.sql（上海/北京/杭州 + 14 个 draft 地点）
npm run db:migrate:remote -w server
npm run db:seed:remote    -w server
npm run admin:hash        -w server   # 生成 ADMIN_PASSWORD_HASH
```

⚠️ **migrations 目录里有两个 `0002_*.sql`**（`0002_admin_login_attempts.sql` 和 `0002_weekly_city_refresh.sql`）。
Wrangler 按全文件名追踪，已在本地与历史环境应用过，不要再重命名；新的迁移用 `0004_*.sql`。

### 后台启动注意

在 Claude Code 里用 `run_in_background` 启动 dev server，turn 结束时进程会被 harness 回收。
需要长时间保留服务时，让用户在**独立终端**手动跑 `npm run dev:server` / `npm run dev:client`。
`nohup`/`disown` 在本 harness 下也不一定能存活。

---

## 3. 目录速查

### `client/src/`
```
main.ts / App.vue / router/index.ts   # hash history
pages/
  HomePage.vue            # 首页：选时长/距离/偏好/菜系等
  RoutePage.vue           # 路线结果页（核心 H5）
  CityExplorePage.vue     # 城市探索
  TodayPlanPage.vue       # 今日计划
  HistoryPage.vue         # 历史
  admin/
    AdminLoginPage.vue
    AdminDashboardPage.vue    # 今日编务
    AdminCitiesPage.vue       # 城市档案主从工作台
    AdminSpotsPage.vue        # 地点编目台账（query 同步到 URL）
    AdminSpotEditPage.vue     # 编辑稿 + 验证侧栏
    AdminCityRefreshPage.vue  # 五步城市复核
layouts/AdminLayout.vue       # 编辑部侧栏/移动端顶栏
components/admin/             # 5 个展示组件：PageHeader/Badge/MetricTile/CitySwitcher/FormSection
admin/
  api.ts        # 后台所有 fetch 封装 + ApiError
  auth.ts       # 登录/会话/redirect
  types.ts      # 共享枚举和中文 label map
assets/styles/main.css        # 含 .admin-shell 作用域的后台设计系统（纸张/墨色/品牌橙）
```

### `server/src/`
```
worker.ts                       # 入口：路由装配 + initLlmClient
config/env.ts                   # Zod 校验的 Bindings
routes/
  planRoutes.ts                 # POST /api/plan — H5 路线生成入口
  exploreRoutes.ts              # 探索相关
  cityRoutes.ts                 # 公开城市列表
  recommendationRoutes.ts
  adminAuthRoutes.ts            # 登录/登出/会话（限流在 admin_login_attempts 表）
  adminRoutes.ts                # 城市/地点 CRUD、dashboard、发布
  adminRefreshRoutes.ts         # 城市复核五步工作流
  *.schemas.ts / *.test.ts      # Zod schema + 同目录测试
services/
  routeGenerator.ts             # 主流程：geo+weather → generatePlan → fallback
  aiPlannerService.ts           # 旧的再导出层（薄）
  llm/
    client.ts                   # fetch 调 DeepSeek，AbortController 超时，无重试无模型 fallback
    prompt.ts                   # SYSTEM_PROMPT + buildUserPrompt + buildRefinePrompt
    schema.ts                   # LLM JSON 输出的 Zod schema
  planner/
    generatePlan.ts             # LLM-first 主编排（分流/重试/高德验证/策略/差异化）
    refinePlan.ts               # 用户改路线时 LLM 补 stop
    foodPlanner.ts              # 美食榜单/菜系对比（也调 LLM）
    themedPlanner.ts            # 景点/逛街主题路线（POI 先，LLM 策展）
    fallbackPlanner.ts          # 高德 POI 纯规则编排
    verifyRoutes.ts             # LLM 提名 → 高德 text search 验证 + 补坐标/图片
    replaceStop.ts              # 替换 stop 并重新验证
    routePolicy.ts              # 可达性/距离/时间预算/偏好硬筛
    routeMetrics.ts / distancePolicy.ts / timeBudget.ts
    preferenceCriteria.ts / preferenceCoverage.ts
    poiAllocation.ts / poiMatching.ts / poiQuality.ts
    foodRanking.ts / foodSuitability.ts / socialFoodSearch.ts
    localCuisinePolicy.ts       # 外地菜系冲突剔除
    keywordRelevance.ts / recallPolicy.ts / evidencePolicy.ts
    structural divergence 见 ../structuralDivergence.ts（≥30° 结构差异）
    countPresentation.ts / foodPresentation.ts / routeTitle.ts / transportHint.ts / suggestOrder.ts
  amap/
    client.ts                   # 高德 Web Service fetch 封装 + 超时
    geocode.ts / weather.ts / poiSearch.ts
    amapSearchScheduler.ts      # 控制高德调用节奏
    imagePolicy.ts
  explore/
  weeklyRefreshService.ts
  structuralDivergence.ts       # axes 三维向量差异 ≥30°
repositories/                   # D1 SQL 访问（curationRepository / cityRefreshRepository）
domain/                         # 领域类型
middleware/adminAuth.ts         # Cookie 会话校验
auth/adminCrypto.ts             # PBKDF2 hash、HMAC session token
```

### DB migrations
- `0001_admin_curation.sql` — cities / spots 等核心表
- `0002_admin_login_attempts.sql` — 登录限流
- `0002_weekly_city_refresh.sql` — cities 加 review_interval_days、refresh_runs/candidates 表
- `0003_shanghai_official_covers.sql` — 上海封面数据

`server/seeds/three-cities.sql` 全是 `draft + unverified`，线上跑也不会直接曝光。

---

## 4. LLM 调用方式（重点）

### 配置（2026-07-31 刚改）
```
LLM_BASE_URL = https://api.deepseek.com/v1
LLM_MODEL    = deepseek-v4-flash      # 单一模型，无 fallback 模型
LLM_TIMEOUT_MS = 35000                # 默认上限；每个调用点会单独覆盖
```
改的位置：`server/src/config/env.ts`、`server/wrangler.toml [vars]`、相关测试的字面量、README。
**不要**在 `client.ts` 里加第二模型降级——这与当前架构方向相违背。

### 请求协议
OpenAI 兼容 Chat Completions，`POST /chat/completions`：
- `response_format: { type: 'json_object' }` 强制 JSON
- `Authorization: Bearer ${LLM_API_KEY}`
- 原生 fetch + `AbortController`，无 SDK、无自动重试

### 调用点（每个都自己传超时）
```
planner/generatePlan.ts  主路径 25s，schema 失败重试 18s（temperature 0.3）
planner/refinePlan.ts    路线微调
planner/foodPlanner.ts   美食榜单/菜系对比，两处调用
planner/themedPlanner.ts 景点/逛街策展
```
函数名 `chatCompletionWithFallback` 里的 "Fallback" **不是指模型 fallback**，
而是指**业务层**在 LLM 失败/验证失败/覆盖不足时降级到高德规则路径（`source: 'fallback'`）。

### 主流程（`services/routeGenerator.ts → generateRoutes`）
```
1. reverseGeocode(lng,lat) + getWeather(adcode)     高德，并行
2. generatePlan()
   ├─ 按请求形状分流：
   │    · onlyFood 无菜系       → generateFoodList（LLM 榜单）
   │    · 短时 + 菜系           → generateCuisineComparison（LLM 3 卡）
   │    · 短时 + 纯景点/逛街    → generateScenic/WanderRoutes（高德先 + LLM 策展）
   │    · 半日/一日/多偏好      → LLM-first 主路径
   ├─ buildUserPrompt → chatCompletionWithFallback (25s)
   ├─ parseAndValidate (Zod)
   │    └─ 失败：把错误塞回 prompt，同模型重试 1 次 (18s, temp 0.3)
   ├─ verifyAndEnrichRoutes：每个 stop 高德 text search 验证 → 补 lng/lat/amapPoiId/address/images
   ├─ applyRoutePolicies：距离/时间/类型/偏好硬筛
   ├─ findMissingPreferences：偏好覆盖不足 → 判失败
   └─ enforceDivergence：多路线 axes 三维向量 ≥30°，不达标丢路线
3. 任何一步抛错或覆盖不足：
   searchNearbyPOIs (高德 around-search) → buildFallbackRoutes（纯规则）
   返回 { source: 'fallback', fallbackReason }
```

**核心不变式：LLM 只负责提名（name/notes/duration），地址坐标 POI ID 图片一律由高德回填。**
LLM 编造的店名如果高德搜不到，直接丢弃，用 gapFillKeywords 补位。

---

## 5. 后台（Admin）

- 路径前缀 `/#/admin/*`，全部 hash 路由。
- 会话：HttpOnly Cookie（`ADMIN_COOKIE`），HMAC 签名 token，TTL 默认 28800s。
- 密码：PBKDF2 hash，存在 `ADMIN_PASSWORD_HASH` secret；改密跑 `npm run admin:hash -w server`。
- 登录限流：`admin_login_attempts` 表按 client_key 窗口计数。
- 乐观锁：spots / refresh candidates 都有 `version` 字段，更新必须带 `expectedVersion`。
- 城市复核五步（`adminRefreshRoutes.ts`）：
  1. 检索准备（选已发布 spots + 生成 prompt）
  2. 导入 LLM/Tavily 研究结果 JSON（≤256KB，超限 413）
  3. 校验预览（只读，不落库）
  4. 逐项审核：接受/拒绝/忽略/高德验证；**新 spot 必须 `amapVerificationStatus=verified` 且 `systemAssessment=recommended_update` 才能接受**；接受后只能作为 `draft` 进地点库
  5. 完成（所有候选必须已决策；高风险动作需 `highRiskConfirmed`）

  **后端状态保护**：所有 candidate 变更（accept/reject/verify/confirm-no-change）
  都要求 `run.status === 'reviewing'`，否则 409。UI 也要同时检查这两个条件。

### 后台设计系统（2026-07 重构）
- `.admin-shell` 作用域下的 CSS 变量：暖纸 `#f3eee5`、近白 surface、墨色文字、品牌橙 accent。
- 不要把后台的 class/变量泄漏到公开 H5（public body 背景是 `#f7f6f2`，墨色 `stone-900`）。
- 所有状态必须同时用**文字 + 颜色**表达（色盲友好）。
- 不使用 localStorage/sessionStorage；不引入地图 SDK 到后台；标签文案走 `admin/types.ts` 的 label map，禁止复制枚举。

---

## 6. 部署架构

- **Cloudflare Pages** 项目名 `laidou-laile`，高级模式：`client/dist/_worker.js` + 静态资源同域。
- D1 数据库名 `citywalk-curation`，ID `60dcd9a5-9f47-48de-9f1e-9404f2569248`。
- Pages 必须在控制台手动加 D1 binding，变量名严格 `DB`（`wrangler.toml` 的 `[[d1_databases]]` 不会自动给 Pages 绑）。
- 构建：`npm run build`（产物在 `client/dist/`）。
- 部署：`npx wrangler pages deploy client/dist --project-name laidou-laile`。
  - **不要**用 `npm run deploy -w server`（那是普通 Worker 路径，与 Pages 同域架构不符）。
- 远程 D1 首次上线需要：`db:migrate:remote` → `db:seed:remote` → 配 secrets → deploy。
- Secrets（`wrangler pages secret put <NAME> --project-name laidou-laile`）：
  ```
  LLM_API_KEY
  AMAP_WEB_API_KEY
  TAVILY_API_KEY          # 可选，开启社交美食证据
  ADMIN_PASSWORD_HASH
  ADMIN_SESSION_SECRET    # ≥32 字符
  ```
- `ADMIN_ALLOWED_ORIGINS` 是逗号分隔的**精确 origin**（带自定义域名时要加上）。

---

## 7. 工作流约定（用户明确偏好）

- **改代码不提交**。只有用户明确说"提交"时才 `git add/commit/push` 并部署。
- 当前在分支 `codex/route-quality-completion`，工作树有大量跨路线质量与后台的未提交改动，
  切分支/reset/checkout 前先和用户确认，避免覆盖无关工作。
- 不要用 `git stash -u` 之类的破坏性操作清理工作树。
- 代码风格：
  - 匹配周围代码的注释密度和命名（中文业务注释常见，不要强行全改英文）。
  - 测试和源码同目录，命名 `*.test.ts`；全部 mock，不能联网、不能依赖真实 D1。
  - Tailwind 类用完整静态字符串，不要运行时拼接（生产会被 purge）。
  - Vue 使用 `<script setup lang="ts">`。
  - 后端 import 路径用 `.js` 后缀（ESM + NodeNext）。
- 提交信息末尾加 `Co-Authored-By: Claude <noreply@anthropic.com>`。

---

## 8. 当前在飞/未完成的工作

- 后台视觉与交互已完成「城市内容编辑部」重构（5 个 admin 组件 + 6 个页面重写 + 后端 409 状态保护 + 测试扩展）。
- LLM 模型刚从 `deepseek-v4-pro` 切到 `deepseek-v4-flash`（2026-07-31），代码与测试均已同步，但尚未提交/部署。
- 路线质量相关改动（routePolicy、poiQuality、timeBudget、transportHint、food 系列、social evidence 等）仍在同一分支未提交，近期 commit 见：
  ```
  7915681 fix: reject non-visitor route candidates
  47f27b9 docs: plan route quality and social evidence work
  c5075c3 docs: design route quality and social evidence optimization
  3f5e541 docs: design social food ranking
  ec75d2f docs: design route quality completion
  ```
- 生产 D1 远程是空的（0 表），未执行 migrate/seed；Pages `DB` binding 是否已在控制台配置也需要用户确认。
- 远程 secrets 尚未配置。

---

## 9. 常见任务速查

**"启动项目"** → 让用户在独立终端跑 `npm run dev:server` + `npm run dev:client`，
地址 http://localhost:9090/ ，后台入口 http://localhost:9090/#/admin/login 。

**"改 LLM 模型"** → 同时改 `server/src/config/env.ts` 默认值、`server/wrangler.toml [vars].LLM_MODEL`、
测试里硬编码的字面量（`adminAuthRoutes.test.ts` / `adminRoutes.test.ts` / `adminRefreshRoutes.test.ts`）、README。
不要加模型级 fallback。

**"跑测试"** → `npm test`。单独跑后端 `npm test -w server`，前端 `npm test -w client`。
`npx vitest run path/to/file.test.ts` 可以跑单个文件。

**"看 LLM 走了 AI 还是 fallback"** → 后端控制台日志关键字：
- `📐 Divergence drop` — AI 成功但被差异化策略精简
- `🔄 Day trip mode` — 半日/一日裁成 1 条
- `AI planning failed:` — LLM 抛错
- `🔄 LLM failed or returned no routes, falling back to Amap around-search...` — 进入高德兜底
- 响应体里的 `source: 'ai' | 'fallback'` 和 `fallbackReason` 直接给前端显示。

**"后台登录密码忘了"** → 本地从 `.dev.vars` 的 `ADMIN_PASSWORD_HASH` 反推不出来；
直接重新生成：`npm run admin:hash -w server`，把结果写回 `.dev.vars`（本地）或
`wrangler pages secret put ADMIN_PASSWORD_HASH`（生产）。

---

## 10. 给新会话的第一建议

1. 先 `git status` 看工作树，别误动未提交改动。
2. 读 `README.md` 第 1~3 节了解产品上下文，再读本文件第 4 节（LLM 流程）。
3. 涉及后台：看 `client/src/assets/styles/main.css` 里 `.admin-shell` 段 + `client/src/admin/types.ts` 的 label map。
4. 涉及路线生成：从 `server/src/services/routeGenerator.ts` 进，再下钻到 `planner/generatePlan.ts`。
5. 涉及 DB：先看 `server/migrations/` 最新的 SQL，再看 `server/src/repositories/` 对应仓库方法。
6. 不要自行 commit / push / deploy，等用户明确说"提交"。
