import type { SeedCity } from './types.js'

export const beijing: SeedCity = {
  adcode: '110000', provinceName: '北京', name: '北京', slug: 'beijing', priority: 95,
  intro: '历史遗产、城市中轴线与胡同街区共同构成的首都目的地。',
  spots: [
    { id: 'beijing-forbidden-city', cityAdcode: '110000', name: '故宫', searchName: '故宫博物院', lat: 39.9163, lng: 116.3972, category: 'museum_culture', tier: 'S', priority: 100, reason: '中国古代宫殿建筑与馆藏文化的代表性目的地。', tierReason: '全国知名，初次到北京通常值得优先安排。', personas: ['first_visit', 'culture'], tags: ['世界遗产', '博物馆'], indoorFriendly: true, reservationRequired: true, reservationNote: '预约与开放安排请以官方公告为准。' },
    { id: 'beijing-tiananmen-square', cityAdcode: '110000', name: '天安门广场', searchName: '天安门广场', lat: 39.9087, lng: 116.3975, category: 'classic_landmark', tier: 'S', priority: 95, reason: '北京中轴线上的全国性城市地标。', tierReason: '全国知名，初次到北京通常会纳入核心行程。', personas: ['first_visit', 'history'], tags: ['城市地标', '中轴线'], reservationRequired: true, reservationNote: '预约与参观要求请以官方公告为准。' },
    { id: 'beijing-summer-palace', cityAdcode: '110000', name: '颐和园', searchName: '颐和园', lat: 39.9999, lng: 116.2755, category: 'classic_landmark', tier: 'A', priority: 90, reason: '皇家园林与湖山景观结合的北京代表性景区。', tierReason: '城市代表性强，适合专程安排半天。', personas: ['culture', 'nature'], tags: ['皇家园林', '世界遗产'] },
    { id: 'beijing-nanluoguxiang', cityAdcode: '110000', name: '南锣鼓巷', searchName: '南锣鼓巷', lat: 39.938, lng: 116.4035, category: 'featured_district', tier: 'B', priority: 70, reason: '适合对胡同街区和步行体验感兴趣的游客。', tierReason: '在街区漫游画像命中时值得去，但不应挤占核心历史地标。', personas: ['city_walk', 'street'], tags: ['胡同', '街区'] },
  ],
}
