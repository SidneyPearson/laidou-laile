import type { PreferenceTag } from '../../types/route.js'

interface TitleRoute {
  name: string
  stops: Array<{ name: string }>
}

const GENERIC_TITLE_RE = /^(?:景点|休闲|美食)?路线\s*\d*$|^(?:景点|休闲|美食)路线\d+$/
const SCENIC_SUFFIXES = ['古迹慢游线', '人文街拍线', '自然打卡线']
const WANDER_SUFFIXES = ['咖啡慢逛线', '街巷漫游线', '文化闲游线']
const FOOD_SUFFIXES = ['口碑寻味线', '近邻觅食线', '特色美食线']

function compactPlaceName(name: string): string {
  return name.replace(/[（(][^)）]*[)）]/g, '').replace(/景区|公园|博物馆/g, '').slice(0, 4)
}

export function ensureDistinctRouteTitles(
  routes: TitleRoute[],
  preferences: PreferenceTag[],
): string[] {
  const suffixes = preferences.includes('food')
    ? FOOD_SUFFIXES
    : preferences.includes('wander') ? WANDER_SUFFIXES : SCENIC_SUFFIXES
  const used = new Set<string>()

  return routes.map((route, index) => {
    let title = route.name?.trim()
    if (!title || GENERIC_TITLE_RE.test(title) || used.has(title)) {
      const place = compactPlaceName(route.stops[0]?.name ?? '')
      title = `${place || ''}${suffixes[index % suffixes.length]}`.slice(0, 10)
    }
    if (used.has(title)) title = `${suffixes[index % suffixes.length]}`
    used.add(title)
    return title
  })
}
