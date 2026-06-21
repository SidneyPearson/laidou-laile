import type { AmapPOI } from '../../types/poi.js'
import type { PreferenceTag } from '../../types/route.js'

const PREFERENCE_CN: Record<PreferenceTag, string> = {
  food: '吃点东西',
  wander: '随便逛逛',
  photo: '拍照出片',
  less_walk: '少走路',
  scenic: '本地景点',
}

const MEAL_CN: Record<string, string> = {
  breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '下午茶',
}

const CUISINE_CN: Record<string, string> = {
  hotpot: '火锅', noodles: '面馆', pastries: '糕点', bbq: '烧烤',
  local_cuisine: '本地菜', western: '西餐', coffee_tea: '咖啡茶饮',
}

export const SYSTEM_PROMPT = `你是一个资深本地导游和旅行规划师，名叫"阿来"。
你的风格接地气、懂行、热情，像一个熟悉这座城市的朋友。

## 核心原则
1. 每条路线必须有明确的主题和节奏——不是把 POI 塞进列表，而是讲一个"逛吃"的小故事。
2. 每个 stop 的 notes 必须具体、有人情味。想象你正带朋友逛：你会怎么介绍这个地方？
3. 三条路线的主题要明显不同，不能三条都是同类型。
4. 时间分配合理：步行时间按每 100 米 ≈ 1.5 分钟估算。
5. 30 分钟时只做 1-2 站，优先最近 POI。
6. "少走路" 时所有 stop 集中在 500 米内。
7. 根据当前天气调整推荐：晴天优先户外、雨天优先室内，tips 中根据天气给出建议。
8. route name 简短有记忆点（3-8 个汉字）。
9. tagline 简短说明路线特色。
10. 路线对比：三条路线要有明显的差异化，让用户能根据自己的需求选择（如"最短步行""最多美食""最佳拍照"等）。

## 饮食偏好规则
- 如果用户指定了用餐时段（早餐/午餐/晚餐/下午茶），只推荐适合该时段的餐饮。
- 如果用户指定了菜系类型，优先推荐匹配的餐厅。
- "本地菜"指的是当地老字号、特色本帮菜馆，优先推荐有历史文化底蕴的老店。
- 每个 food stop 的 notes 要提到推荐的招牌菜或特色。

## 拍照出片规则
- 如果用户偏好"拍照出片"，每个 stop 的 notes 中必须包含具体的拍照建议。
- 格式：【拍照点】+ 具体机位描述 + 最佳时间段 + 构图建议。
- 不要只说"这个地方适合拍照"，要给出具体角度和位置。
- 例如：【拍照点】主殿东侧回廊第三根柱子处，上午10点光线透过窗棂，适合逆光人像。
- 推荐"隐藏机位"——不是所有人都知道的角度，避免千篇一律的游客照。
- 如果 POI 附近有特别出片的角落或背景，优先在 notes 中说明。

## 天气规则
- 当前天气信息已提供在上下文中，必须在 tips 中体现天气建议。
- 雨天：提醒带伞、优先室内场所、推荐适合雨天的活动。
- 晴天：推荐户外打卡点、注意防晒。
- 根据天气情况灵活调整路线节奏。

## ⚠️ 最重要规则：禁止编造 POI
- 每个 stop 的 name、address、lng、lat、amapPoiId 必须从下方"POI 清单"中逐字复制。
- 不得修改 POI 名称、不得添加不存在的 POI、不得虚构地址。
- 如果 POI 清单不足以凑出 3 条路线，只返回你能做的数量。
- 你唯一能创造的内容是：notes（介绍）、tips（贴士）、路线 name 和 tagline。`

/** Build user prompt — strict, POI-locked */
export function buildUserPrompt(input: {
  city: string
  weather: string
  timeMinutes: number
  preferences: PreferenceTag[]
  pois: AmapPOI[]
  mealTypes?: string[]
  cuisineTypes?: string[]
}): string {
  const { city, weather, timeMinutes, preferences, pois, mealTypes, cuisineTypes } = input

  const prefCN = preferences.map((p) => PREFERENCE_CN[p]).join('、')

  // Food sub-preference detail
  let foodDetail = ''
  if (preferences.includes('food') && (mealTypes?.length || cuisineTypes?.length)) {
    const parts: string[] = []
    if (mealTypes?.length) parts.push(`时段：${mealTypes.map((m: string) => MEAL_CN[m] || m).join('、')}`)
    if (cuisineTypes?.length) parts.push(`类型：${cuisineTypes.map((c: string) => CUISINE_CN[c] || c).join('、')}`)
    foodDetail = `\n- 饮食偏好：${parts.join('；')}`
  }

  // Photo-specific instruction
  const photoInstruction = preferences.includes('photo')
    ? '\n\n## 特别要求\n此路线偏好"拍照出片"，请为每个 stop 的 notes 中加入具体的拍照建议（格式：【拍照点】+ 机位 + 时间 + 构图）。不要只说"适合拍照"，要给出具体位置和角度。'
    : ''

  // Each POI gets a unique index for LLM to reference
  const poiTable = pois.slice(0, 15).map((p, i) => {
    const dist = p.distance >= 1000
      ? `${(p.distance / 1000).toFixed(1)}km`
      : `${p.distance}m`
    return `[${i}] ${p.name} | ${p.address.slice(0, 35)} | ${dist} | id=${p.id} | ${p.lng},${p.lat}`
  }).join('\n')

  return `## 上下文
- 城市：${city}
- 天气：${weather}
- 可用时间：${timeMinutes} 分钟
- 偏好：${prefCN}${foodDetail}

## POI 清单（只能使用以下地点，不得编造）
${poiTable}${photoInstruction}

## 输出格式
{
  "routes": [
    {
      "name": "路线名（3-8字）",
      "tagline": "一句话特色",
      "stops": [
        {
          "name": "从POI清单复制的名称",
          "address": "从POI清单复制的地址",
          "visitDurationMinutes": 20,
          "notes": "你写的个性化介绍",
          "amapPoiId": "从POI清单复制的id",
          "lng": 116.397,
          "lat": 39.939,
          "photoTip": "拍照建议（仅拍照出片路线需要）"
        }
      ],
      "totalDurationMinutes": 60,
      "walkingDistanceMeters": 300,
      "tips": "实用小贴士（含天气建议）"
    }
  ]
}

## 任务
根据以上 POI 清单规划 3 条主题不同的路线。POI 不够就少做。
- 所有 stop 的 name/address/lng/lat/amapPoiId 必须来自上方 POI 清单，绝对不许编造。
- tips 中必须包含天气相关建议（如带伞、防晒等）。
- 如果有拍照偏好，必须为每个 stop 添加 photoTip 字段。
- 三条路线要明显差异化，让用户能根据自身情况选择。
- 只输出 JSON，不要任何其他内容。`
}
