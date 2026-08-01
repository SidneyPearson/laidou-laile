import type { SeedCity } from './types.js'

export const shanghai: SeedCity = {
  adcode: '310000', provinceName: '上海', name: '上海', slug: 'shanghai', priority: 100,
  intro: '江河入海处的现代都市，城市地标、街区与文化场馆并存。',
  spots: [
    { id: 'shanghai-the-bund', cityAdcode: '310000', name: '外滩', searchName: '外滩', lat: 31.24, lng: 121.4903, category: 'classic_landmark', tier: 'S', priority: 100, reason: '上海城市天际线和近代建筑群的代表性观景区域。', tierReason: '全国知名，初次到上海通常值得优先安排。', personas: ['first_visit', 'photography'], tags: ['城市地标', '江景'] },
    { id: 'shanghai-oriental-pearl', cityAdcode: '310000', name: '东方明珠', searchName: '东方明珠广播电视塔', lat: 31.2397, lng: 121.4998, category: 'classic_landmark', tier: 'A', priority: 90, reason: '陆家嘴天际线中的代表性城市地标。', tierReason: '上海代表性强，适合希望登高或打卡城市地标的游客。', personas: ['first_visit', 'family'], tags: ['城市地标', '观景'] },
    { id: 'shanghai-disneyland', cityAdcode: '310000', name: '上海迪士尼乐园', searchName: '上海迪士尼乐园', lat: 31.1433, lng: 121.6605, category: 'theme_park', tier: 'S', priority: 95, reason: '面向亲子和主题乐园爱好者的全国性目的地。', tierReason: '全国知名且通常需要专门安排一天。', personas: ['family', 'theme_park'], tags: ['亲子', '主题乐园'], reservationRequired: true, reservationNote: '预约与入园要求请以官方公告为准。' },
    { id: 'shanghai-nanjing-road', cityAdcode: '310000', name: '南京路步行街', searchName: '南京路步行街', lat: 31.2354, lng: 121.4753, category: 'walk_street', tier: 'A', priority: 85, reason: '连接人民广场与外滩的代表性商业步行街。', tierReason: '城市辨识度高，适合与外滩组合安排。', personas: ['first_visit', 'shopping'], tags: ['步行街', '商业街'] },
    { id: 'shanghai-huanghe-road', cityAdcode: '310000', name: '黄河路', searchName: '黄河路美食街', lat: 31.2349, lng: 121.4668, category: 'walk_street', tier: 'C', priority: 40, reason: '适合在人民广场附近顺路感受老牌餐饮街区。', tierReason: '更适合顺路或用餐补充，不进入城市主推荐。', personas: ['food'], tags: ['美食街', '顺路'] },
    { id: 'shanghai-museum-east', cityAdcode: '310000', name: '上海博物馆东馆', searchName: '上海博物馆东馆', lat: 31.2287, lng: 121.5496, category: 'museum_culture', tier: 'B', priority: 75, reason: '适合对中国古代艺术与博物馆参观感兴趣的游客。', tierReason: '在文化场馆、室内或雨天偏好命中时值得专程安排。', personas: ['culture', 'museum'], tags: ['博物馆', '室内'], indoorFriendly: true, reservationRequired: true, reservationNote: '预约与开放安排请以官方公告为准。' },
  ],
}
