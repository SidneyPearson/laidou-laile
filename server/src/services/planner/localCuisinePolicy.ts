interface RegionalCuisineProfile {
  landmarks: RegExp
  searchTerms: string[]
  typeTerms: string[]
  conflictingCuisine: RegExp
}

const REGIONAL_PROFILES: RegionalCuisineProfile[] = [
  {
    landmarks: /成都|四川|宽窄巷子|春熙路|锦里|武侯祠/,
    searchTerms: ['川菜', '四川菜', '成都菜', '成都小吃'],
    typeTerms: ['050102'],
    conflictingCuisine: /东北|新疆|内蒙|蒙古|粤菜|广东|潮汕|湘菜|湖南|江浙|本帮|上海菜|西北|陕西|陕菜|兰州|京菜|北京菜|鲁菜|山东菜|云南菜|贵州菜/,
  },
  {
    landmarks: /西安|陕西|回民街|钟楼|鼓楼|大雁塔/,
    searchTerms: ['陕菜', '陕西菜', '西北菜', '清真菜', '西安小吃'],
    // 050115 西北菜；050121 清真菜（回民街泡馍常归入此类）。
    typeTerms: ['050115', '050121'],
    conflictingCuisine: /东北|新疆|内蒙|蒙古|川菜|四川菜|粤菜|广东|潮汕|湘菜|湖南|江浙|本帮|上海菜|云南菜|贵州菜|鲁菜|山东菜/,
  },
  {
    landmarks: /上海|外滩|豫园|陆家嘴/,
    searchTerms: ['本帮菜', '上海菜'],
    typeTerms: ['050107'],
    conflictingCuisine: /东北|新疆|内蒙|蒙古|川菜|四川菜|粤菜|广东|潮汕|湘菜|湖南|西北|陕西|陕菜|云南菜|贵州菜|鲁菜|山东菜/,
  },
  {
    landmarks: /杭州|浙江|西湖|河坊街/,
    searchTerms: ['杭帮菜', '浙江菜'],
    typeTerms: ['050106'],
    conflictingCuisine: /东北|新疆|内蒙|蒙古|川菜|四川菜|粤菜|广东|潮汕|湘菜|湖南|西北|陕西|陕菜|云南菜|贵州菜|鲁菜|山东菜/,
  },
  {
    landmarks: /广州|广东|北京路|上下九/,
    searchTerms: ['粤菜', '广东菜'],
    typeTerms: ['050103'],
    conflictingCuisine: /东北|新疆|内蒙|蒙古|川菜|四川菜|湘菜|湖南|江浙|本帮|上海菜|西北|陕西|陕菜|云南菜|贵州菜|鲁菜|山东菜/,
  },
]

const GENERIC_SEARCH_TERMS = ['本地菜', '老字号', '特色菜', '地方风味']
// Amap: 050116 老字号，050118 特色/地方风味餐厅。
const GENERIC_TYPE_TERMS = ['050116', '050118']

function regionalProfile(localeText: string): RegionalCuisineProfile | undefined {
  return REGIONAL_PROFILES.find(profile => profile.landmarks.test(localeText))
}

/** Search vocabulary for local cuisine, enriched by the selected city/landmark. */
export function buildLocalCuisineSearchTerms(localeText = ''): string[] {
  return [...new Set([
    ...GENERIC_SEARCH_TERMS,
    ...(regionalProfile(localeText)?.searchTerms ?? []),
  ])]
}

/**
 * Final relevance vocabulary. It deliberately includes reliable Amap cuisine
 * type codes so a real 川菜/陕菜 restaurant need not spell “本地菜” in its name.
 */
export function buildLocalCuisineTerms(localeText = ''): string[] {
  return [...new Set([
    ...buildLocalCuisineSearchTerms(localeText),
    ...GENERIC_TYPE_TERMS,
    ...(regionalProfile(localeText)?.typeTerms ?? []),
  ])]
}

export function hasRegionalCuisineConflict(
  poi: { name: string; type?: string; typecode?: string },
  localeText = '',
): boolean {
  const conflict = regionalProfile(localeText)?.conflictingCuisine
  return conflict ? conflict.test(`${poi.name} ${poi.type ?? ''}`) : false
}
