import type { PreferenceTag } from '../../types/route.js'

const PREFERENCE_CN: Record<PreferenceTag, string> = {
  food: '吃点东西',
  wander: '随便逛逛',
  scenic: '景点打卡',
}

const CUISINE_CN: Record<string, string> = {
  hotpot: '火锅', noodles: '面馆', pastries: '糕点', bbq: '烧烤',
  local_cuisine: '地方菜', western: '西餐', coffee_tea: '奶茶咖啡',
  buffet: '自助餐',
}

const SCENIC_CN: Record<string, string> = {
  popular: '热门景点', street: '街拍打卡',
}

const WANDER_CN: Record<string, string> = {
  shopping: '逛街购物', cafe: '咖啡茶馆', entertainment: '休闲娱乐',
  hidden: '小众秘境', museum: '博物馆/文化',
}

export const SYSTEM_PROMPT = `你是一个资深本地导游和旅行规划师，名叫"阿来"。
你的风格接地气、懂行、热情，像一个熟悉这座城市的朋友。

## 核心原则
1. 每条路线必须有明确的主题和节奏——不是把地点塞进列表，而是讲一个"逛吃"的小故事。
2. 每个 stop 的 notes 必须具体、有人情味。想象你正带朋友逛：你会怎么介绍这个地方？
3. 三条路线的主题要明显不同，不能三条都是同类型。
4. 时间分配合理：步行时间按每 100 米 ≈ 1.5 分钟估算。
5. 30 分钟做 1-2 站，半天（4小时）做 3-5 站，一天（8小时）做 5-8 站，节奏张弛有度。
6. 根据当前天气调整推荐：晴天优先户外、雨天优先室内，tips 中根据天气给出建议。
7. route name 简短有记忆点（3-8 个汉字）。
8. tagline 简短说明路线特色。
9. 路线对比：三条路线要有明显的差异化，让用户能根据自身需求选择（如"最短步行""最多美食""最佳拍照"等）。

## 推荐地点的关键规则
- **只推荐你确信真实存在的店铺和景点**，用准确的店名/地名（如"老吉士酒楼"而不是"附近有家本帮菜馆"）。
- **每个 stop 的 name 必须是 Amap 高德地图上能搜到的准确名称**。不确定的店不要推荐。
- 推荐的店铺和景点应位于用户所在区域附近（参考提供的城市和区信息）。
- 如果对某家店的具体位置不确定，宁可少推荐一个 stop 也不要编造。

## 停留时长参考（必须变化，不能所有stop一样）
- 🍜 餐厅/小吃：25-40 分钟（快餐25，正餐40）
- 🏛️ 博物馆/展览馆：60-90 分钟
- 🏯 景点/地标（参观型）：30-50 分钟
- 📸 拍照打卡点：10-20 分钟
- ☕ 咖啡/茶馆：20-30 分钟
- 🛍️ 商场/逛街：40-60 分钟
- 🌿 公园/绿地：20-40 分钟
- totalDurationMinutes = 步行时间 + 所有stop的visitDurationMinutes之和

## 饮食偏好规则（重要！）
- **每条路线只包含与饮食相关的 stop**。如果用户只选了"吃点东西"，所有 stop 都必须是餐厅/咖啡馆/茶馆/小吃店等，不要塞入社区中心、公园、商场等无关地点。
- 各路线从不同维度各推荐 1 家店，比如：口碑最好的、人气最旺的、最有特色的。30 分钟只做 1 个 stop，60 分钟可做 1-2 个。
- 如果用户选了菜系，只能推荐该菜系的店铺（如选了"奶茶咖啡"就只推咖啡馆/茶馆/奶茶店）。没选菜系则 3 条路线从 3 种不同菜系各推 1 家。
- 每个 food stop 的 notes：一句话说明推荐理由 + 1-2 道招牌。

## 景点打卡规则
- "景点打卡"推荐大众熟知的著名景点、地标建筑、必去打卡地。
- 如果指定了"热门景点"，推荐大众熟知的著名景点。
- 如果指定了"街拍打卡"，推荐特色街道、网红打卡点、文创园区、胡同小巷，notes 中给出拍照建议：【拍照点】+ 机位 + 时间 + 构图。
- 每个 stop 的 notes 要包含该景点的历史或文化背景。

## 随便逛逛规则
- 如果指定了"逛街购物"，推荐商场、购物中心、步行街、特色集市。
- 如果指定了"咖啡茶馆"，推荐特色咖啡馆、茶馆、书吧等休闲场所。
- 如果指定了"休闲娱乐"，推荐电影院、KTV、桌游、密室、演出场所等。
- 如果指定了"小众秘境"，推荐故居、寺庙、园林、老街、小众打卡地、特色街区。
- 如果指定了"博物馆/文化"，推荐博物馆、美术馆、展览馆、纪念馆等文化场所。

## 天气规则
- 当前天气信息已提供在上下文中，必须在 tips 中体现天气建议。
- 雨天：提醒带伞、优先室内场所、推荐适合雨天的活动。
- 晴天：推荐户外打卡点、注意防晒。
- 雾霾：建议室内为主。
- 根据天气情况灵活调整路线节奏。`

/** Build user prompt — LLM-first: no POI table, LLM recommends from knowledge */
export function buildUserPrompt(input: {
  city: string
  weather: string
  timeMinutes: number
  distance: number
  preferences: PreferenceTag[]
  cuisineTypes?: string[]
  scenicTypes?: string[]
  wanderTypes?: string[]
  /** When true, generate 1 day-trip route instead of 3 competing routes */
  singleRoute?: boolean
}): string {
  const { city, weather, timeMinutes, distance, preferences, cuisineTypes, scenicTypes, wanderTypes, singleRoute } = input

  const prefCN = preferences.map((p) => PREFERENCE_CN[p]).join('、')

  // Build sub-preference details
  const subDetails: string[] = []

  if (preferences.includes('food') && cuisineTypes?.length) {
    subDetails.push(`饮食偏好：${cuisineTypes.map((c: string) => CUISINE_CN[c] || c).join('、')}`)
  }

  if (preferences.includes('scenic') && scenicTypes?.length) {
    subDetails.push(`景点偏好：${scenicTypes.map((s) => SCENIC_CN[s] || s).join('、')}`)
  }

  if (preferences.includes('wander') && wanderTypes?.length) {
    subDetails.push(`休闲偏好：${wanderTypes.map((w) => WANDER_CN[w] || w).join('、')}`)
  }

  const subDetailText = subDetails.length > 0
    ? `\n- ${subDetails.join('\n- ')}`
    : ''

  const distHint = distance > 0
    ? `推荐地点应尽量在用户附近 ${distance}m 范围内。`
    : `不限距离，推荐${city}最值得去的热门景点、知名餐厅、经典地标。优先推荐全城公认的好去处。`

  const isDayMode = timeMinutes >= 240
  const dayLabel = timeMinutes >= 480 ? '一日游' : '半日游'

  const fullTaskInstruction = singleRoute ? [
    `根据你对${city}的了解，规划 1 条完整的${city}${dayLabel}路线。你不能查地图，只依靠你的训练数据中关于这个区域的知识。`,
    distHint,
    '只生成 1 条路线，包含 5-8 个 stops。',
    '每个 stop 的 name 必须是高德地图上能搜到的准确名称。如果对某家店是否存在不确定，不要推荐它。',
    '按地理位置合理安排顺序，形成一条顺畅的线路（不要东奔西跑）。',
    preferences.includes('scenic') ? '涵盖不同类型的地标：历史建筑、现代地标、文化街区、自然景观等，让路线丰富多彩。' : '',
    preferences.includes('food') ? '涵盖不同菜系和价位，notes 写简短推荐理由 + 1-2道招牌。' : '',
    preferences.includes('wander') ? '涵盖购物、文化、休闲等不同类型的场所，让半天张弛有度。' : '',
    `每个 stop 的 notes 写简短介绍（15-40字）。`,
    'tips 中必须包含天气相关建议（如带伞、防晒等），以及实用建议。',
    '只输出 JSON，不要任何其他内容。',
  ].filter(Boolean) : [
    `根据你对${city}的了解，规划 3 条主题不同的路线。你不能查地图，只依靠你的训练数据中关于这个区域的知识。`,
    distHint,
    '每个 stop 的 name 必须是高德地图上能搜到的准确名称。如果对某家店是否存在不确定，不要推荐它。',
    '如果某个偏好方向你了解不够多，可以减少路线数或每条路线的 stop 数。',
    'tips 中必须包含天气相关建议（如带伞、防晒等）。',
    preferences.includes('food') ? '🍜 饮食路线：所有 stop 都必须是餐饮相关的店铺，不要加入社区中心、公园、商场等无关地点。' : '',
    preferences.includes('food') ? '从不同维度各推荐1家（如：口碑最好、人气最旺、最有特色），notes 写简短推荐理由+1-2道招牌。' : '',
    cuisineTypes?.length === 1 ? `⚠️ 用户指定了想吃${cuisineTypes.map((c: string) => CUISINE_CN[c] || c).join('、')}，每条路线的就餐 stop 必须严格推荐该类型的店铺，不要推荐其他菜系。` : '',
    cuisineTypes && cuisineTypes.length >= 2 ? `⚠️ 用户选了多种菜系：${cuisineTypes.map((c: string) => CUISINE_CN[c] || c).join('、')}。3 条路线应分别覆盖不同菜系（如路线1推${CUISINE_CN[cuisineTypes[0]] || cuisineTypes[0]}，路线2推${CUISINE_CN[cuisineTypes[1]] || cuisineTypes[1]}，路线3选其中一类从新角度推荐），每条 stop 只属于一种菜系即可。` : '',
    preferences.includes('scenic') && !scenicTypes?.length ? `🏯 ${city}最值得去的景点：推荐${city}公认的著名景点、地标建筑、必去打卡地。3 条路线的主题要覆盖不同类型（如经典地标线、文艺打卡线、自然风光线）。` : '',
    preferences.includes('wander') && !wanderTypes?.length ? `🚶 ${city}休闲去处：推荐${city}值得逛的商场、特色街区、文化场馆、咖啡馆、娱乐场所。3 条路线各选一个方向（购物、文化、悠闲）。` : '',
    '三条路线要明显差异化。',
    '只输出 JSON，不要任何其他内容。',
  ].filter(Boolean).map((s, i) => `- ${s}`).join('\n')

  return `## 上下文
- 城市区域：${city}
- 天气：${weather}
- 可用时间：${timeMinutes >= 480 ? '一天（约8小时）' : timeMinutes >= 240 ? '半天（约4小时）' : `${timeMinutes} 分钟`}
- 探索距离：${distance > 0 ? `${distance}m 以内` : '当前城市范围'}
- 偏好：${prefCN}${subDetailText}

## 输出格式
{
  "routes": [
    {
      "name": "路线名（3-8字）",
      "tagline": "一句话特色",
      "stops": [
        {
          "name": "准确的店名/地名（如'老吉士酒楼'，高德可搜到）",
          "visitDurationMinutes": 35,
          "notes": "你写的个性化介绍",
          "photoTip": "拍照建议（仅拍照出片路线需要）"
        },
        {
          "name": "另一个地点",
          "visitDurationMinutes": 15,
          "notes": "不同类型的stop时长必须不同，参考时长表"
        }
      ],
      "totalDurationMinutes": 60,
      "walkingDistanceMeters": 300,
      "tips": "实用小贴士（含天气建议，可提1家备选餐厅）"
    }
  ]
}
注意：
- stops 中不需要填 address/lng/lat/amapPoiId，我们会通过高德地图自动查询。
- 但 name 必须是高德地图上能搜到的准确名称！
- 每个 stop 的 visitDurationMinutes 要按"停留时长参考"给出不同类型的时长，不要全一样。

## 任务
${fullTaskInstruction}`
}
