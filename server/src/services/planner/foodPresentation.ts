import type { Route } from '../../types/route.js'
import { enforceEvidencePolicy } from './evidencePolicy.js'

/** Rebuild food-list copy after generic count synchronization. */
export function syncFoodListPresentation(route: Route): Route {
  if (route.kind !== 'food_list'
    && route.name !== '附近美食清单'
    && route.name !== '附近热门美食') return route
  const guarded = enforceEvidencePolicy({ ...route, kind: 'food_list' })
  const hasEvidence = guarded.stops.some(stop => stop.recommendationType === 'social_hot')
  const { direction: _direction, ...withoutDirection } = guarded
  return {
    ...withoutDirection,
    kind: 'food_list',
    name: '附近热门美食',
    tagline: hasEvidence
      ? `热门美食精选，共 ${guarded.stops.length} 家`
      : `附近热门餐厅，共 ${guarded.stops.length} 家`,
    tips: hasEvidence
      ? '平台热度来自公开网页搜索，仅供参考；门店信息以高德及商家实际营业情况为准'
      : '按高德评分与距离综合排序；请以商家实际营业情况为准',
    divergenceExempt: true,
  }
}
