# 来都来了

> 不用做攻略，到了就会玩。

一个城市灵感 H5。用户选城市/定位 → 浏览**后台策展**的城市灵感地点 → 加入「今日计划」，并按距离给出参考顺序。配套后台是「城市内容编辑部」，用于编辑城市档案、地点台账和周期性城市内容复核。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vue 3 + Vite + TypeScript + TailwindCSS |
| 后端 | Hono + Cloudflare D1 (Cloudflare Pages `_worker.js` 高级模式) |
| 地图 | 高德地图 JS API（前端）+ 高德 Web Services（后端，地理编码/天气/POI 验证） |
| 测试 | Vitest（全 mock、确定性，不连接真实第三方 API 或 D1） |
| 部署 | Cloudflare Pages（`laidou-laile.pages.dev`） |

> 历史上有一整套 DeepSeek LLM 实时路线规划栈（偏好/时长 → 提名 → 高德验证 → 多条差异化路线），
> 已于 2026-08-01 移除。当前公开端不调用任何 LLM；唯一保留的 `/api/plan/suggest-order` 是纯确定性距离排序。

## 目录结构

```
citywalk/
├── client/                      # Vue 3 前端 SPA
│   ├── src/
│   │   ├── pages/               # HomePage / CityExplorePage / TodayPlanPage + admin/*
│   │   ├── components/explore/  # 城市灵感 UI（CategoryTabs/InspirationFeed/PersonaSelector/...）
│   │   ├── components/today/    # 今日计划 UI
│   │   ├── components/admin/    # 后台设计系统组件
│   │   ├── composables/         # Geolocation、useTodayPlan
│   │   ├── services/            # api.ts（suggest-order）、exploreApi.ts
│   │   └── data/                # 热门城市、城市灵感静态 seed
│   └── index.html               # 入口页（含 Amap JS SDK 加载）
├── server/                      # Hono 后端（Cloudflare Workers）
│   ├── src/
│   │   ├── config/env.ts        # Zod 环境变量校验
│   │   ├── routes/              # explore/city/recommendation/plan(仅 suggest-order)/admin*
│   │   ├── services/
│   │   │   ├── amap/            # client/placeVerifier/geocode/weather/imagePolicy
│   │   │   ├── explore/         # 城市灵感：seed 读取 → persona 排序 → 高德校验 → 距离排序
│   │   │   ├── poiQuality.ts    # POI 质量硬筛（explore 与 admin 共用）
│   │   │   └── weeklyRefreshService.ts
│   │   ├── repositories/        # D1 访问
│   │   ├── domain/              # curation / weeklyRefresh 领域逻辑
│   │   └── worker.ts            # Pages _worker.js 入口（Hono + 静态文件分发）
│   └── vitest.config.ts
└── .env.example                 # 环境变量模板
```

## 快速开始

### 前置条件

- Node.js 22（见 `.node-version`）
- 两个高德 API Key：
  - **Web Services key**（服务端）：用于 POI 验证、天气、地理编码
  - **JS API key**（前端）：用于地图显示，需要在[高德控制台](https://lbs.amap.com/dev/key/app)绑定域名白名单

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置服务端密钥
cp .env.example server/.dev.vars
# 编辑 server/.dev.vars，填入：
#   AMAP_WEB_API_KEY=your_amap_web_key
#   ADMIN_PASSWORD_HASH=...      # npm run admin:hash -w server
#   ADMIN_SESSION_SECRET=...     # ≥32 字符

# 3. 启动后端（wrangler dev，端口 3000）
npm run dev -w server

# 4. 新终端，启动前端（vite，端口 9090，自动代理 /api → 3000）
npm run dev -w client

# 浏览器打开 http://localhost:9090，后台入口 /#/admin/login
```

### 密钥配置说明

| 密钥 | 位置 | 用途 | 是否暴露 |
|------|------|------|---------|
| `AMAP_WEB_API_KEY` | `server/.dev.vars` + Pages 密钥 | 服务端 POI 验证、天气、地理编码 | 否 |
| `ADMIN_PASSWORD_HASH` | `server/.dev.vars` + Pages 密钥 | 后台登录密码 PBKDF2 hash | 否 |
| `ADMIN_SESSION_SECRET` | `server/.dev.vars` + Pages 密钥 | 后台会话 HMAC 签名（≥32 字符） | 否 |
| Amap JS API key | `client/index.html` | 前端地图加载 | 需在[高德控制台](https://lbs.amap.com/dev/key/app)配置域名白名单 |
| Amap `securityJsCode` | `client/index.html` | 前端地图安全验证 | 需在控制台绑定域名 |

**重要**：前端的 Amap JS API key 和 `securityJsCode` 在 `client/index.html` 中硬编码，是因为浏览器端必须拿到它们才能加载地图。**必须在高德控制台 → 应用管理 → 添加域名白名单**，限制只有 `laidou-laile.pages.dev` 和 `localhost` 等可信域名可以使用。

### 运行测试 / 类型检查 / 构建

```bash
npm test          # 全 mock，不消耗第三方 API
npm run typecheck # 服务端 tsc + 前端 vue-tsc
npm run build     # 前端 vite build + esbuild 打包 _worker.js
```

## API 端点

公开端点：

| 端点 | 说明 |
|------|------|
| `POST /api/explore/recommend` | 按城市 + persona 返回策展灵感地点（静态 seed + 高德校验） |
| `GET /api/city/context` | 反查坐标对应城市/adcode + 天气 |
| `POST /api/plan/suggest-order` | 对已选地点做最近邻距离排序（纯确定性，不调 LLM/不搜索） |
| `GET /api/recommendations/cities` | 读取 D1 已发布城市地点；D1 故障时显式标记静态降级（前台预留） |
| `GET /api/health` | 健康检查 |

后台端点（需登录会话）：`/api/admin/auth/*`、`/api/admin/cities`、`/api/admin/spots`、`/api/admin/city-refresh/*`、`/api/admin/refresh-runs/*`、`/api/admin/refresh-candidates/*`。

`/api/plan/suggest-order` 请求体最大 64 KB（超限返回 413）。

## 公开端流程

```
HomePage（定位/选城市）
  └─ GET /api/city/context           reverseGeocode + 天气
  └─ CityExplorePage
       └─ POST /api/explore/recommend
             exploreService：读 services/explore/cities/*.ts 静态 seed
               → personaRanker 排序 → hotspotVerifier（amap/placeVerifier 补坐标/图片）
       └─ 选中地点 → useTodayPlan（localStorage）
  └─ TodayPlanPage
       └─ POST /api/plan/suggest-order   最近邻距离排序
```

`verifyPlace`（`services/amap/placeVerifier.ts`）用高德 text search + 名称相似度 + Haversine 选最佳 POI，内部经 `services/poiQuality.ts` 的 `filterUsablePois` 剔除内部/不对外开放地点；explore 与 admin 共用。

## 部署

### 首次部署

```bash
# 1. 构建
npm run build

# 2. 部署到 Cloudflare Pages
npx wrangler pages deploy client/dist --project-name laidou-laile

# 3. 设置生产密钥
npx wrangler pages secret put AMAP_WEB_API_KEY --project-name laidou-laile
npx wrangler pages secret put ADMIN_PASSWORD_HASH --project-name laidou-laile
npx wrangler pages secret put ADMIN_SESSION_SECRET --project-name laidou-laile
```

> Pages 还需要在控制台手动绑定 D1 数据库，变量名严格为 `DB`。
> 远程 D1 首次上线需 `db:migrate:remote` → `db:seed:remote`。详见 `AGENTS.md`。

### 更新部署

```bash
npm run build && npx wrangler pages deploy client/dist --project-name laidou-laile
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AMAP_TIMEOUT_MS` | `10000` | 高德 API 超时 |
| `NODE_ENV` | `production` | 运行环境 |
| `ADMIN_ALLOWED_ORIGINS` | `http://localhost:9090` | 后台写请求允许的精确 Origin，逗号分隔 |
| `ADMIN_SESSION_TTL_SECONDS` | `28800` | HttpOnly 后台会话有效期（秒） |

完整后台 D1 初始化、安全配置、三城种子和回滚说明见 [`docs/admin-curation-v0.1.md`](docs/admin-curation-v0.1.md)。

## 已知限制

- **城市灵感当前读静态 seed**：`services/explore/cities/*.ts`；D1 已发布数据的读取通路（`recommendationRoutes`）已预留但前台尚未接入。
- **Amap JS SDK 必须配置域名白名单**：否则地图无法加载（见密钥配置说明）。
- **后台 V0.1 为单管理员**：无 RBAC、图片上传、自动抓取或自动发布。
- **城市复核 V0.2 完全人工触发**：不运行 Cron、不自动联网，也不调用 LLM；见 [`docs/weekly-city-refresh-v0.2.md`](docs/weekly-city-refresh-v0.2.md)。

## 许可

项目许可证以仓库中的许可证文件为准。
