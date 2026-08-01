# 全国城市热门地点后台 V0.1

## 范围与发布规则

后台位于 `/#/admin`，服务中国城市的地点策展。V0.1 只迁移上海、北京和杭州；高德只确认 POI 存在，分类、S/A/B/C 级别和发布状态必须由管理员决定。DeepSeek 不参与自动发布。

固定分类：`classic_landmark`、`featured_district`、`theme_park`、`nature`、`walk_street`、`mall`、`food`、`museum_culture`。

- S/A 可进入城市主推荐；同级按 `priority` 降序。
- B 仅在分类、画像或雨天/室内条件命中时出现，并始终排在 S/A 后。
- C 不进入城市主推荐。
- 只有 `verified + published` 且具备高德 POI ID、坐标、推荐理由和级别理由的地点可发布。

## D1 表

迁移 `server/migrations/0001_admin_curation.sql` 创建：

- `cities`：城市、状态、排序和封面。
- `spots`：POI 事实字段、人工分类/级别、画像标签、验证/发布状态和乐观锁 `version`。
- `spot_sources`：内容来源；来源不明的种子明确写“来源待补”，不伪造 URL。
- `admin_audit_logs`：后台验证、发布、下架和批量操作；写入前过滤 password/hash/secret/cookie/header 等字段。

地点按城市、发布状态、分类、级别、优先级和高德 POI ID 建索引。所有停用操作使用 `disabled`，API 不提供物理删除。

## 本地初始化

```bash
# 1. 创建数据库（首次）
npx wrangler d1 create citywalk-curation
# 将返回的 database_id 写入 server/wrangler.toml，binding 必须为 DB

# 2. 迁移和幂等种子
npm run db:migrate:local -w server
npm run db:seed:local -w server

# 3. 生成管理员密码哈希（交互输入不回显）
npm run admin:hash -w server

# 4. 复制配置并填写真实 key/hash/secret
cp .env.example server/.dev.vars
# ADMIN_SESSION_SECRET 至少 32 个随机字符
# ADMIN_ALLOWED_ORIGINS=http://localhost:9090

# 5. 分别启动后端和前端
npm run dev:server
npm run dev:client
# 前台 http://localhost:9090，后台 http://localhost:9090/#/admin
```

密码明文不保存，前端也不使用 localStorage/sessionStorage 保存密码或 session。会话是 HMAC-SHA-256 签名的有限期 HttpOnly Cookie，`SameSite=Strict`；生产环境自动添加 `Secure`。后台写请求还必须精确匹配 `ADMIN_ALLOWED_ORIGINS`。

## 三城种子结果

种子来自仓库现存的 `client/src/data/popularCities.ts` 三城 12 条锚点，并加入需求明确指定的黄河路、上海博物馆东馆，共 14 条：

| 城市 | 数量 |
|---|---:|
| 上海 | 6 |
| 北京 | 4 |
| 杭州 | 4 |

| 级别 | 数量 |
|---|---:|
| S | 5 |
| A | 4 |
| B | 4 |
| C | 1 |

黄河路为 `walk_street/C`；上海博物馆东馆为 `museum_culture/B`。所有种子初始均为 `draft + unverified`，没有伪造高德 POI ID、营业时间、票价或客流信息。

## 生产 D1 与 Secrets

```bash
# 创建并绑定 Pages 项目的 D1（首次）
npx wrangler d1 create citywalk-curation
# 在 Cloudflare Pages laidou-laile 的 Settings > Bindings 添加 D1 binding：DB

# 使用真实 database_id 后执行远程迁移、种子
npm run db:migrate:remote -w server
npm run db:seed:remote -w server

# 生产 secrets
npx wrangler pages secret put ADMIN_PASSWORD_HASH --project-name laidou-laile
npx wrangler pages secret put ADMIN_SESSION_SECRET --project-name laidou-laile
npx wrangler pages secret put LLM_API_KEY --project-name laidou-laile
npx wrangler pages secret put AMAP_WEB_API_KEY --project-name laidou-laile
```

生产变量 `ADMIN_ALLOWED_ORIGINS` 必须包含精确的 Pages/custom domain origin，例如 `https://laidou-laile.pages.dev`。可在 Cloudflare Access 再加一层后台路径保护，但不能替代应用内鉴权。

部署顺序：先创建/绑定 D1 → 迁移 → 种子 → 配置 Secrets/Origins → 构建部署。管理 API 在 D1 异常时返回通用错误，不假装写入成功。

## API

- Auth：`POST /api/admin/auth/login`、`POST /logout`、`GET /me`
- Dashboard：`GET /api/admin/dashboard`
- Cities：`GET/POST /api/admin/cities`、`PATCH /api/admin/cities/:adcode`
- Spots：`GET/POST /api/admin/spots`、`GET/PATCH /api/admin/spots/:id`
- Workflow：`POST /api/admin/spots/:id/verify|publish|unpublish`、`POST /api/admin/spots/batch-publish`
- Public：`GET /api/recommendations/cities`（支持 `category`、`personas`、`rainy` 推荐条件）

城市和地点列表支持分页；地点支持城市、分类、级别、验证状态、发布状态和关键词筛选。地点更新必须传 `expectedVersion`，过期版本返回 409。批量发布最多 50 条。

## 静态降级与移除条件

D1 正常时，三城只读取后台已发布地点；某城市没有已发布地点时返回空集，不用旧数据填充。只有 D1 不可用/未迁移时才返回 `source: static_fallback` 和 `fallbackReason`，前端显示降级提示。未迁移的其他城市继续使用静态入口，因此正常过渡期可能标记 `mixed`。

H5 城市选择器每次打开都会重新读取接口，推荐接口使用 `Cache-Control: no-store`。管理员将城市设为“已开放”，并将已通过高德验证的地点发布后，H5 下一次打开或点击“刷新”即可读取最新数据；草稿、待审核、停用、验证失败和 C 级地点不会进入 H5 城市主推荐。

只有在所有目标城市完成高德验证和人工发布、D1 生产运行稳定且回滚窗口结束后，才能移除静态热点代码。

## V0.1 限制

单管理员、无 RBAC；无图片上传/R2；只允许高德/Autonavi HTTPS 白名单图片；无自动抓取或自动发布；无用户账号、行为统计、云端收藏或画像上传。“自由加入今天”留待下一批。
