/** 2026-09-11 独立生成的城市首页背景，与后台地点封面分别管理。 */
const CITY_SLUGS: Record<string, string> = {
  上海: 'shanghai', 北京: 'beijing', 杭州: 'hangzhou', 成都: 'chengdu',
  重庆: 'chongqing', 广州: 'guangzhou', 深圳: 'shenzhen', 南京: 'nanjing',
  武汉: 'wuhan', 西安: 'xian', 厦门: 'xiamen', 长沙: 'changsha', 青岛: 'qingdao',
}

export function cityHeroImage(name?: string | null): string | undefined {
  const slug = CITY_SLUGS[(name ?? '').trim().replace(/市$/, '')]
  return slug ? `/city-heroes/${slug}-20260911.webp` : undefined
}
