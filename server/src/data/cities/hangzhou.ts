import type { SeedCity } from './types.js'

export const hangzhou: SeedCity = {
  adcode: '330100', provinceName: '浙江', name: '杭州', slug: 'hangzhou', priority: 90,
  intro: '以西湖山水、人文寺院和老城街区为代表的江南城市。',
  spots: [
    { id: 'hangzhou-west-lake', cityAdcode: '330100', name: '西湖', searchName: '西湖风景名胜区', lat: 30.245, lng: 120.145, category: 'nature', tier: 'S', priority: 100, reason: '杭州最具代表性的湖山景观与城市名片。', tierReason: '全国知名，初次到杭州通常值得优先安排。', personas: ['first_visit', 'nature'], tags: ['世界遗产', '湖景'] },
    { id: 'hangzhou-lingyin-temple', cityAdcode: '330100', name: '灵隐寺', searchName: '灵隐寺', lat: 30.2432, lng: 120.1021, category: 'museum_culture', tier: 'A', priority: 90, reason: '杭州具有代表性的历史寺院与人文景观。', tierReason: '城市代表性强，适合文化和寺院兴趣游客专程前往。', personas: ['culture', 'history'], tags: ['寺院', '人文'] },
    { id: 'hangzhou-hefang-street', cityAdcode: '330100', name: '河坊街', searchName: '河坊街', lat: 30.2413, lng: 120.173, category: 'walk_street', tier: 'B', priority: 70, reason: '适合体验老城商业街区和步行游览。', tierReason: '在街区、购物或地方体验偏好命中时值得安排。', personas: ['city_walk', 'shopping'], tags: ['老街', '步行街'] },
    { id: 'hangzhou-leifeng-pagoda', cityAdcode: '330100', name: '雷峰塔', searchName: '雷峰塔景区', lat: 30.2338, lng: 120.1475, category: 'classic_landmark', tier: 'B', priority: 65, reason: '位于西湖南岸，可作为环湖游览中的文化景观。', tierReason: '更适合与西湖动线、历史兴趣或观景需求组合安排。', personas: ['history', 'photography'], tags: ['西湖', '历史景观'] },
  ],
}
