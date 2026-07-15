import type { PreferenceTag } from '../../types/route.js'

/** Preference → fallback Amap keywords when the stop name yields no cuisine hint */
export const PREFERENCE_REPLACE_KEYWORDS: Record<PreferenceTag, string> = {
  food: '餐厅|美食|小吃|饭店',
  scenic: '景点|地标|博物馆|公园|名胜',
  wander: '商场|咖啡|书店|文创|步行街',
}

/** Free-text hint → Amap keyword group. Extracted from `extraRequirements` or a
 *  stop name that the LLM produced but Amap couldn't verify directly. */
export const CUISINE_FALLBACK_MAP: Record<string, string> = {
  '面馆': '面馆|面庄|拉面|米线|粉',
  '面': '面馆|面庄|拉面|米线|粉',
  '面条': '面馆|面庄|拉面|米线|粉',
  '拉面': '拉面|面馆',
  '火锅': '火锅|串串|涮肉',
  '涮肉': '火锅|涮肉',
  '烧烤': '烧烤|烤肉',
  '烤肉': '烤肉|烧烤',
  '咖啡': '咖啡馆|咖啡厅',
  '奶茶': '奶茶|茶饮',
  '茶': '茶馆|茶室|茶饮',
  '糕点': '糕点|面包|蛋糕|烘焙',
  '面包': '面包|烘焙|糕点',
  '西餐': '西餐|牛排|意面|披萨',
  '自助': '自助餐|自助',
  '串串': '串串|火锅',
  '小吃': '小吃|快餐|美食',
  '美食': '美食|餐厅',
}

/** Cuisine name patterns for POI classification. Used both in comparison-card
 *  filtering and in gap-fill routing. */
export const CUISINE_NAME_RE: Record<string, RegExp> = {
  hotpot: /火锅|涮|串串/,
  noodles: /面|粉|米线/,
  coffee_tea: /咖啡|奶茶|茶|饮/,
  bbq: /烧烤|烤肉/,
  pastries: /糕点|面包|烘焙|点/,
  western: /西餐|牛排|披萨|意面|萨莉亚/,
  local_cuisine: /本帮|老字号|本地|特色/,
  buffet: /自助/,
}

/** Cuisine short label for user-facing text. Note: keys mirror the enum in
 *  `types/route.ts` but are typed loosely because comparison output also uses
 *  raw string keys returned from Amap. */
export const CUISINE_LABEL: Record<string, string> = {
  hotpot: '火锅',
  noodles: '面馆',
  pastries: '糕点',
  bbq: '烧烤',
  local_cuisine: '地方菜',
  western: '西餐',
  coffee_tea: '奶茶咖啡',
  buffet: '自助餐',
}

/** Rule-based fallback label for a preference tag. */
export const PREF_LABELS: Record<string, string> = {
  food: '美食',
  wander: '休闲',
  scenic: '景点',
}

/** Regex used by fallback search to reject false-positive POIs whose names
 *  contain the stop name but describe an unrelated facility (parking, police,
 *  property mgmt, etc.). */
export const FALSE_MATCH_RE =
  /店|公司|派出所|警务室|居委会|街道办事处|服务站|中介|地产|房产|我爱我家|链家|贝壳|停车场|停车库|停车点|地铁站|出入口|入口|出口|厕所|卫生间|垃圾|配电|物业|管理处|收费/

/** Simpler regex used by cuisine POI picker (drops just the top offenders). */
export const CUISINE_FALSE_RE =
  /派出所|警务室|居委会|街道办事处|服务站|中介|地产|房产|停车场|停车库|停车点|地铁站|出入口|厕所|卫生间|垃圾|配电|物业|管理处|收费/
