# 对比报告：citywalk（当前） vs laidou-laile-v03

> 生成时间：2026-07-27
> 对比范围：`/Users/chentao/Desktop/citywalk` 与 `/Users/chentao/Desktop/laidou-laile-v03`
> 排除项：`node_modules`、`.git`、`.wrangler`、`.env`、`.env.local`、`.claude`、`package-lock.json`、`.DS_Store`、构建产物 `client/dist`

## 一、总体结论

两个项目**同源**：都始于 2026-06-21 的 MVP，经历过 2026-06-22（第 2 天功能）与 **2026-07-15（工程化重构）** 两个完全相同的阶段（架构迁移到 Cloudflare Pages、模型统一、代码拆分、测试覆盖、CI 引入）。

在 2026-07-15 之后两者**分叉为两条产品方向**：

| 维度 | citywalk（当前工作区） | laidou-laile-v03 |
|------|------------------------|------------------|
| 产品定位 | 运营 / 后台内容管理方向 | 终端用户探索 / 自主安排方向 |
| 最新变更日期 | 2026-07-15（admin 体系为独立另一条线，未在本文件记录） | **2026-07-26**（更新） |
| 数据层 | D1 数据库 + 后台鉴权 | 浏览器 `localStorage` 用户清单 |
| 受众 | 编辑 / 运营人员 | 普通游客 / 用户 |

**核心判断**：两者是**互补关系**——citywalk 强在“内容生产”（后台录入/复核城市与地点），v03 强在“内容消费”（用户端探索与自主安排）。合并可得到一个完整产品，但数据层设计不同，存在整合工作量。

## 二、citywalk 独有（后台 / 运营侧）

**前端**
- `client/src/admin/` 全套后台页面：`AdminDashboardPage`、`AdminCitiesPage`、`AdminSpotsPage`、`AdminCityRefreshPage`、`AdminLoginPage`、`AdminLayout`、`AdminPageHeader`、`AdminSpotEditPage`
- `client/src/layouts/`、`client/src/repositories/`、`client/src/router/`
- `client/src/utils/routeOutcome.ts`
- `client/public/`

**后端**
- `server/src/auth/`、`server/src/domain/`、`server/src/repositories/`（领域与数据访问层）
- `server/src/routes/admin*` 全套：`adminAuthRoutes`、`adminRoutes`、`adminRefreshRoutes` + 对应 `schemas` 与 `*.test.ts`
- `server/src/middleware/adminAuth.ts`
- `server/migrations/`、`server/seeds/`、`server/scripts/`（D1 数据库迁移 / 种子 / 工具）
- `server/client/`、`server/dist/`

**文档**
- `docs/admin-curation-v0.1.md`
- `docs/weekly-city-refresh-v0.2.md`
- `docs/qa/`、`docs/superpowers/`

## 三、laidou-laile-v03 独有（用户探索侧）

**前端**
- `client/src/components/explore/`、`client/src/components/today/`
- `client/src/pages/CityExplorePage.vue`、`client/src/pages/TodayPlanPage.vue`
- `client/src/composables/useTodayPlan.ts`（+ `useTodayPlan.test.ts`、`useHistory.test.ts`）
- `client/src/data/mockExploreSpots.ts`（+ `mockExploreSpots.test.ts`）
- `client/src/services/exploreApi.ts`
- `client/src/types/explore.ts`、`todayPlan.ts`、`todayPlanApi.ts`
- `client/src/utils/amapNavigation.ts`、`exploreDetails.ts`（+ `exploreDetails.test.ts`）

**后端**
- `server/src/routes/exploreRoutes.ts` 全套（`schemas` + `test`）
- `server/src/routes/cityRoutes.ts`（+ `cityRoutes.test.ts`）
- 新增端点：`POST /api/plan/suggest-order`

**文档**
- `docs/plans/`

## 四、共有但内容已分叉的核心文件

分叉后两边各自演进，以下文件两边都存在但内容不同（已确认存在差异）：

- **路线核心**：`server/src/routes/planRoutes.ts`、`.schemas.ts`、`.test.ts`
- **城市数据**：`server/src/data/cities/{beijing,shanghai,hangzhou}.ts`
- **前端 API 与类型**：`client/src/services/api.ts`、`client/src/types/api.ts`、`client/src/types/route.ts`
- **组件**：`CityPicker`、`DayTripStop`、`DayTripView`、`NavButton`、`RouteCompare`、`StopCard`
- **组合式**：`useHistory.ts`、`useRouteRequest.ts`（两个测试文件也不同）
- **页面**：`HomePage.vue`、`RoutePage.vue`、`HistoryPage.vue`
- **配置与文档**：`.env.example`、`package.json`、`tailwind.config.js`、`README.md`、`server/package.json`、`server/.dev.vars`、`server/src/config/env.ts`、`client/env.d.ts`、`client/src/main.ts`、`client/src/assets/styles/main.css`、`client/tsconfig.tsbuildinfo`

## 五、构建产物差异（仅供参考）

- `client/dist/_worker.js`：仅 citywalk 有（部署产物）。
- `client/dist/assets/`：两目录哈希不同（不同时期构建），citywalk 含 `Admin*Page` chunk，v03 含 `index-*.css/js`（不同哈希）；均属旧产物，不具对比意义。

## 六、合并建议（若需统一产品）

1. **先对齐基础**：先把两边共有的 `planRoutes`、`cities/*`、`api.ts`、`types/*` 合并成统一基线（这些是分叉点，冲突最多）。
2. **移植独有模块**：把 v03 的 `explore/today` 用户功能移植到 citywalk；把 citywalk 的 `admin/curation` 作为运营后台保留。
3. **数据层对齐**：最大难点。citywalk 用 D1 + 后台鉴权（服务端持久化），v03 用 `localStorage`（客户端）。用户“今天想去”清单若要跨端同步需接 D1；若仅本地则保持 localStorage，互不影响。
4. **官方图片来源**：v03 的上海 12 个策展地点官方图片可沉淀进 citywalk 的 D1 数据，复用其回退策略（官方图 → 高德图 → 渐变封面）。

---
*注：以上基于递归目录对比（排除依赖与构建产物）与两份 CHANGELOG 的时间线推断。如需逐文件 diff 某个具体模块，可进一步指定。*
