# 来都来了 · 更新日志

## 2026-07-15（工程化重构）

### 变更
- **架构迁移**：Express → Cloudflare Pages `_worker.js` 高级模式，前后端同域 `laidou-laile.pages.dev`
- **模型统一**：`deepseek-v4-pro` 单一模型，移除了 fallback 机制和冗余配置
- **KV 轮询移除**：`POST /api/plan/generate` 改为纯同步，不再依赖 KV 轮询
- **输入校验**：三个 API 端点新增 Zod 严格校验（`planRoutes.schemas.ts`），统一错误格式 `{ error: { code, message } }`
- **代码拆分**：`aiPlannerService.ts`（1835 行）拆分为 `services/planner/` 下 12 个模块，最大文件 441 行
- **废弃代码清理**：删除 `jobStore.ts`、`AmapLocationPicker.vue`、`JobPollResponse` 类型、KV 绑定、`render.yaml`、`vercel.json`
- **配置一致化**：`wrangler.toml`、`.env.example` 统一为 `deepseek-v4-pro`，清除失效字段
- **限流策略**：请求体 64KB 上限、同 isolate 5 秒去重（输入+BODY 双重校验）
- **测试覆盖**：新增 8 个 Vitest 测试文件（103 个测试用例），LLM/Amap 全 mock、确定性
- **CI 引入**：GitHub Actions 自动化类型检查 + 测试 + 构建（Node 22，mock 密钥）
- **文档补全**：README 覆盖安装/开发/部署/安全须知；CHANGELOG 追补

### 修复
- **`tsconfig.tsbuildinfo`** 从 git 移除，加入 `.gitignore`
- **`as any` 类型弱化**：`llm/client.ts` 部分替换为 `unknown` + 类型守卫；`planRoutes.ts` 错误处理改用 `unknown` 捕获
- **`vite.config.ts` 端口**：默认 5173 → 9090（对齐实际使用）

## 2026-06-22（第 2 天）

### 新增
- **交互式 Stop 卡片**：点击展开详情（完整地址、notes、拍照建议），一键跳转高德导航
- **多站导航**：一日游路线头部 "🧭 导航全部" 按钮，高德地图途经点串联所有 stop
- **路线精调**：可删除任意 stop，输入补充需求（如"加一个咖啡店"），AI 重新优化路线
- **Refine API**：`POST /api/plan/refine` 端点，保留已有 stops + 验证新 stops
- **菜系对比卡片**：选择 food + 菜系时，生成 3 张对比卡片（评分最高 / 距离最近 / 最多打卡），每张卡片推荐每种菜系各 1 家店
- **菜系分开搜索**：每种菜系独立调用 Amap 文字搜索，避免热门菜系挤占结果
- **菜系名称交叉校验**：防止搜索结果中不属于该菜系的店铺被误分类
- **LLM 增强点评**：每家入选店铺由 DeepSeek 生成个性化推荐理由

### 优化
- **精确距离过滤**：去掉 search 半径 2000m 下限和验证半径 3000m 下限，严格按用户选择的距离过滤
- **菜系精确搜索**：指定菜系时跳过通用 around-search，只用菜系关键词搜索
- **Haversine 距离兜底**：文字搜索返回距离为 0 时，用坐标计算实际距离
- **兜底搜索防假匹配**：fallback search 加入停车场/派出所/地铁站过滤
- **面馆关键词补全**：新增"面庄"关键词
- **卡片标题/标签互换**：标题显示 slogan（口碑之选，好评如潮），标签显示维度（评分最高）
- **最多打卡永久化**：替代最具性价比作为固定第三维度
- **本地菜 → 地方菜**：涵盖台州菜、粤菜、川菜等，不限于上海本帮

---

## 2026-06-21（第 1 天）

### 新增
- **MVP 首版**：Vue 3 + Vite + Express + TypeScript + TailwindCSS，高德 POI 搜索 + DeepSeek LLM 路线规划
- **反幻觉验证**：LLM 推荐地点 → 高德文字搜索验证 → 评分过滤，规则兜底
- **食物偏好扩列**：两级选择，food 标签展开子选项（火锅/面馆/糕点/烧烤/本地菜/西餐/咖啡茶饮/自助餐）
- **天气智能化**：始终查询天气并注入 LLM prompt，前端显示带伞提醒
- **Loading 动画**：三阶段全屏 overlay（搜索中 → AI 规划中 → 即将出炉）+ 进度条
- **路线对比视图**：3 条路线纵向排列，标注差异化标签
- **拍照优化**：拍照路线 LLM 给出具体机位、构图建议
- **滑动修复**：松手平滑弹回、拖拽阻尼、pointer 事件兼容
- **半天/一天单路线**：半日游/一日游生成 1 条完整路线 + 时间线 UI
- **路线历史记录**：localStorage 持久化，支持删除确认
- **热门城市选择器**：快速选择热门城市定位
- **全城范围搜索**：距离=0 时 wideMode 均匀采样，展示城市级知名景点

### 修复
- **直辖市地址解析**：高德返回 `city: []` 空数组导致地址显示异常 → typeof 检查修复
- **LLM 输出截断**：totalDurationMinutes schema 上限 300→540，max_tokens 4096→8192，JSON 修复
- **白屏问题**：Vue error boundary + Cache-Control 头 + 防御性守卫
- **假匹配过滤**：停车场/地铁站/派出所/警务室/居委会/中介等黑名单
- **QPS 限流**：POI 验证改为顺序执行 + 400ms 延迟 + 3 次重试
- **食物推荐单一化**：每路线只推 1 家，多维度差异化（口碑/人气/特色）
- **停留时长统一化**：LLM 按类型给出不同时长（快餐 25min / 博物馆 60min 等）
- **部署修复**：Render 依赖解析、Node 22 锁定、Vercel GFW 规避

### 部署
- Render 免费层部署（512MB / 15min 休眠）
- GitHub master 分支自动部署
