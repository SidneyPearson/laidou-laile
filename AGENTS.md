# AGENTS.md

> 给 AI 编程助手的交接文档。新对话开始时先读这份，再动代码。
> 最后更新：2026-08-01（已移除实时 LLM 规划栈；分支 `codex/route-quality-completion`）。

---

## 1. 项目一句话

**「来都来了」** — 城市灵感 H5：用户选城市/定位 → 浏览**后台策展**的城市灵感地点（静态 seed + 高德校验，逐步迁到 D1）→
加入「今日计划」并按距离给出参考顺序。
后台是「城市内容编辑部」，编辑城市档案、地点台账，并按 7/14/30 天周期做城市内容复核。

> ⚠️ **2026-08-01 已移除实时 LLM 规划栈**：旧的「选偏好/时长 → DeepSeek 提名 → 高德验证 → 1~3 条差异化路线」
> 整套（`/api/plan/generate|refine|replace-stop`、`services/llm/`、`services/planner/`、`routeGenerator`、
> 前台 `RoutePage`/`HistoryPage`）已删除。`/api/plan/suggest-order` 保留，它是**纯确定性距离排序**，不调 LLM。
> 不要按本文档旧版本里的 LLM 流程找代码。

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
  HomePage.vue            # 首页：定位/选城市 → 进入城市灵感
  CityExplorePage.vue     # 城市灵感（浏览策展地点）
  TodayPlanPage.vue       # 今日计划（已选地点 + 参考顺序）
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
  planRoutes.ts                 # POST /api/plan/suggest-order — 仅距离排序，无 LLM
  exploreRoutes.ts              # POST /api/explore/recommend — 城市灵感
  cityRoutes.ts                 # GET /api/city/context — 反查城市+天气
  recommendationRoutes.ts       # GET /api/recommendations/cities — D1 已发布城市（当前前台未接）
  adminAuthRoutes.ts            # 登录/登出/会话（限流在 admin_login_attempts 表）
  adminRoutes.ts                # 城市/地点 CRUD、dashboard、发布
  adminRefreshRoutes.ts         # 城市复核五步工作流
  *.schemas.ts / *.test.ts      # Zod schema + 同目录测试
services/
  poiQuality.ts                 # POI 质量硬筛（拒绝内部/不对外开放等），explore 与 admin 共用
  explore/
    exploreService.ts           # 城市灵感编排：静态 seed → persona 排序 → 高德校验
    hotspotRepository.ts        # 读 cities/{shanghai,beijing,hangzhou} 静态 seed
    hotspotVerifier.ts          # 调 amap/placeVerifier 校验坐标/图片
    personaRanker.ts            # 按 persona 排序（纯函数）
    suggestOrder.ts             # 「帮我顺一下」最近邻距离排序（纯确定性，不调 LLM）
  amap/
    client.ts                   # 高德 Web Service fetch 封装 + 超时
    placeVerifier.ts            # verifyPlace：text search 验单个地点 + 补坐标/图片
    geocode.ts / weather.ts
    imagePolicy.ts
  weeklyRefreshService.ts
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

## 4. 公开 H5 流程（无 LLM）

当前公开端是**策展内容浏览**，不调用任何 LLM：

```
HomePage（定位/选城市）
  └─ GET /api/city/context         reverseGeocode + 高德天气，确认城市/adcode
  └─ CityExplorePage
       └─ POST /api/explore/recommend
             exploreService：读 services/explore/cities/*.ts 静态 seed
               → personaRanker 排序 → hotspotVerifier（amap/placeVerifier.verifyPlace 补坐标/图片）
       └─ 选中地点 → useTodayPlan（localStorage，key laidou-v03-today-plan）
  └─ TodayPlanPage
       └─ POST /api/plan/suggest-order   suggestOrder.ts 最近邻距离排序，纯确定性，不调 LLM/不搜索
```

- 后端**唯一**需要的第三方 key 是 `AMAP_WEB_API_KEY`（`LLM_API_KEY` / `TAVILY_API_KEY` 已移除）。
- `verifyPlace` 在 `services/amap/placeVerifier.ts`：高德 text search + 名称相似度 + Haversine，
  内部用 `services/poiQuality.ts` 的 `filterUsablePois` 剔除内部/不对外开放地点。admin 与 explore 共用。
- D1 已发布城市数据走 `routes/recommendationRoutes.ts` → `repositories/d1CurationRepository`，
  目前前台尚未接入（预留），explore 仍读静态 seed。

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
  AMAP_WEB_API_KEY
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

- 2026-08-01：移除实时 LLM 规划栈（见第 1 节警示），保留后台策展 + 城市灵感/今日计划；改动尚未提交/部署。
- 后台视觉与交互已完成「城市内容编辑部」重构（5 个 admin 组件 + 6 个页面重写 + 后端 409 状态保护 + 测试扩展）。
- 城市灵感目前读 `services/explore/cities/*.ts` 静态 seed；后续方向是迁到 D1 已发布 spots（`recommendationRoutes` 已预留）。
- 生产 D1 远程是空的（0 表），未执行 migrate/seed；Pages `DB` binding 是否已在控制台配置也需要用户确认。
- 远程 secrets 尚未配置。

---

## 9. 常见任务速查

**"启动项目"** → 让用户在独立终端跑 `npm run dev:server` + `npm run dev:client`，
地址 http://localhost:9090/ ，后台入口 http://localhost:9090/#/admin/login 。

**"跑测试"** → `npm test`。单独跑后端 `npm test -w server`，前端 `npm test -w client`。
`npx vitest run path/to/file.test.ts` 可以跑单个文件。

**"后台登录密码忘了"** → 本地从 `.dev.vars` 的 `ADMIN_PASSWORD_HASH` 反推不出来；
直接重新生成：`npm run admin:hash -w server`，把结果写回 `.dev.vars`（本地）或
`wrangler pages secret put ADMIN_PASSWORD_HASH`（生产）。

---

## 10. 给新会话的第一建议

1. 先 `git status` 看工作树，别误动未提交改动。
2. 读本文件第 4 节（公开 H5 流程）。实时 LLM 规划栈已删除，不要再找 `routeGenerator`/`planner/`。
3. 涉及后台：看 `client/src/assets/styles/main.css` 里 `.admin-shell` 段 + `client/src/admin/types.ts` 的 label map。
4. 涉及城市灵感：从 `server/src/routes/exploreRoutes.ts` → `services/explore/exploreService.ts` 进。
5. 涉及 DB：先看 `server/migrations/` 最新的 SQL，再看 `server/src/repositories/` 对应仓库方法。
6. 不要自行 commit / push / deploy，等用户明确说"提交"。
