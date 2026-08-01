import type { PreferenceTag } from '../../types/route.js'
import { buildLocalCuisineSearchTerms, buildLocalCuisineTerms } from './localCuisinePolicy.js'

const CUISINE_TERMS: Record<string, string[]> = {
  hotpot: ['火锅', '串串', '涮肉'],
  noodles: ['面馆', '面庄', '拉面', '米线', '粉面', '拌面', '本帮面', '蟹黄面', '焖肉面', '大排面'],
  pastries: ['糕点', '点心', '面包', '烘焙'],
  bbq: ['烧烤', '烤肉'],
  local_cuisine: ['本地菜', '老字号', '本帮菜', '特色菜'],
  western: ['西餐', '牛排', '披萨', '意面'],
  coffee_tea: ['奶茶', '咖啡', '茶馆', '茶饮'],
  buffet: ['自助餐', '自助', '海鲜自助', '烤肉自助', '日料自助'],
}

const WANDER_TERMS: Record<string, string[]> = {
  shopping: ['商场', '购物中心', '步行街', '集市'],
  cafe: ['咖啡', '咖啡馆', '咖啡厅', '茶馆', '茶室', '茶饮', '书吧'],
  entertainment: ['电影院', 'KTV', '桌游', '密室', '演出'],
  hidden: ['故居', '寺庙', '园林', '胡同', '老街', '古巷', '秘境'],
  museum: ['博物馆', '美术馆', '展览馆', '纪念馆'],
}

const SCENIC_TERMS: Record<string, string[]> = {
  popular: ['著名景点', '名胜古迹', '地标', '博物馆', '纪念馆'],
  // Deliberately avoid the single character "街": an ordinary shop whose
  // name happens to contain an address/area must not become a scenic stop.
  street: [
    '特色街', '街区', '步行街', '历史街区', '历史文化街区', '文化街区', '文创街区',
    '御街', '古街', '老街', '胡同', '古巷',
    '博物馆', '美术馆', '展览馆', '纪念馆', '文化馆', '艺术馆',
  ],
}

const WANDER_TYPECODE_PREFIXES: Record<string, string[]> = {
  shopping: ['06'],
  cafe: ['0505'],
  entertainment: ['08'],
  hidden: ['11'],
  museum: ['1401'],
}

const SCENIC_TYPECODE_PREFIXES: Record<string, string[]> = {
  popular: ['11', '1401'],
  // 0604xx also contains ordinary supermarkets/retail in real Amap data, so
  // it is not sufficient evidence by itself. Museums remain valid anchors.
  street: ['1401'],
}

export function buildCategoryKeywords(input: {
  cuisineTypes?: string[]
  scenicTypes?: string[]
  wanderTypes?: string[]
  city?: string
  areaName?: string
}): Partial<Record<PreferenceTag, string[]>> {
  const localeText = [input.city, input.areaName].filter(Boolean).join(' ')
  return {
    food: [...new Set((input.cuisineTypes ?? []).flatMap(type =>
      type === 'local_cuisine'
        ? buildLocalCuisineSearchTerms(localeText)
        : CUISINE_TERMS[type] ?? [],
    ))],
    scenic: [...new Set((input.scenicTypes ?? []).flatMap(type => SCENIC_TERMS[type] ?? []))],
    wander: [...new Set((input.wanderTypes ?? []).flatMap(type => WANDER_TERMS[type] ?? []))],
  }
}

/**
 * Provider category evidence for enum-backed subtypes. Multiple selected
 * subtypes are flattened intentionally: a candidate may match any selected
 * subtype, rather than having to satisfy an impossible type intersection.
 */
export function buildCategoryTypecodePrefixes(input: {
  cuisineTypes?: string[]
  scenicTypes?: string[]
  wanderTypes?: string[]
  city?: string
  areaName?: string
}): Partial<Record<PreferenceTag, string[]>> {
  const localeText = [input.city, input.areaName].filter(Boolean).join(' ')
  const food = [...new Set((input.cuisineTypes ?? []).flatMap(type =>
    type === 'local_cuisine'
      ? buildLocalCuisineTerms(localeText).filter(term => /^\d+$/.test(term))
      : [],
  ))]
  const scenic = [...new Set((input.scenicTypes ?? [])
    .flatMap(type => SCENIC_TYPECODE_PREFIXES[type] ?? []))]
  const wander = [...new Set((input.wanderTypes ?? [])
    .flatMap(type => WANDER_TYPECODE_PREFIXES[type] ?? []))]
  return {
    ...(food.length > 0 ? { food } : {}),
    ...(scenic.length > 0 ? { scenic } : {}),
    ...(wander.length > 0 ? { wander } : {}),
  }
}
