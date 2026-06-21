export interface Attraction {
  name: string
  lat: number
  lng: number
}

export interface City {
  name: string
  province: string
  emoji: string
  attractions: Attraction[]
}

export const POPULAR_CITIES: City[] = [
  {
    name: '北京',
    province: '北京',
    emoji: '🏯',
    attractions: [
      { name: '故宫', lat: 39.9163, lng: 116.3972 },
      { name: '天安门广场', lat: 39.9087, lng: 116.3975 },
      { name: '颐和园', lat: 39.9999, lng: 116.2755 },
      { name: '南锣鼓巷', lat: 39.9380, lng: 116.4035 },
    ],
  },
  {
    name: '上海',
    province: '上海',
    emoji: '🏙️',
    attractions: [
      { name: '外滩', lat: 31.2400, lng: 121.4903 },
      { name: '东方明珠', lat: 31.2397, lng: 121.4998 },
      { name: '迪士尼乐园', lat: 31.1433, lng: 121.6605 },
      { name: '南京路步行街', lat: 31.2354, lng: 121.4753 },
    ],
  },
  {
    name: '成都',
    province: '四川',
    emoji: '🐼',
    attractions: [
      { name: '宽窄巷子', lat: 30.6700, lng: 104.0507 },
      { name: '锦里古街', lat: 30.6484, lng: 104.0482 },
      { name: '大熊猫繁育基地', lat: 30.7336, lng: 104.1454 },
      { name: '春熙路', lat: 30.6558, lng: 104.0803 },
    ],
  },
  {
    name: '西安',
    province: '陕西',
    emoji: '🏛️',
    attractions: [
      { name: '兵马俑', lat: 34.3852, lng: 109.2731 },
      { name: '大雁塔', lat: 34.2180, lng: 108.9625 },
      { name: '回民街', lat: 34.2631, lng: 108.9436 },
      { name: '西安城墙', lat: 34.2560, lng: 108.9480 },
    ],
  },
  {
    name: '杭州',
    province: '浙江',
    emoji: '🪷',
    attractions: [
      { name: '西湖', lat: 30.2450, lng: 120.1450 },
      { name: '灵隐寺', lat: 30.2432, lng: 120.1021 },
      { name: '河坊街', lat: 30.2413, lng: 120.1730 },
      { name: '雷峰塔', lat: 30.2338, lng: 120.1475 },
    ],
  },
  {
    name: '重庆',
    province: '重庆',
    emoji: '🌆',
    attractions: [
      { name: '洪崖洞', lat: 29.5630, lng: 106.5765 },
      { name: '解放碑', lat: 29.5590, lng: 106.5760 },
      { name: '磁器口古镇', lat: 29.5794, lng: 106.4515 },
      { name: '长江索道', lat: 29.5612, lng: 106.5830 },
    ],
  },
  {
    name: '广州',
    province: '广东',
    emoji: '🕍',
    attractions: [
      { name: '广州塔', lat: 23.1070, lng: 113.3245 },
      { name: '陈家祠', lat: 23.1290, lng: 113.2489 },
      { name: '沙面岛', lat: 23.1100, lng: 113.2423 },
      { name: '北京路步行街', lat: 23.1246, lng: 113.2712 },
    ],
  },
  {
    name: '三亚',
    province: '海南',
    emoji: '🏖️',
    attractions: [
      { name: '亚龙湾', lat: 18.2260, lng: 109.6370 },
      { name: '天涯海角', lat: 18.2910, lng: 109.3470 },
      { name: '南山文化旅游区', lat: 18.3040, lng: 109.1990 },
      { name: '蜈支洲岛', lat: 18.3150, lng: 109.7650 },
    ],
  },
  {
    name: '厦门',
    province: '福建',
    emoji: '🏝️',
    attractions: [
      { name: '鼓浪屿', lat: 24.4480, lng: 118.0695 },
      { name: '南普陀寺', lat: 24.4431, lng: 118.0920 },
      { name: '环岛路', lat: 24.4380, lng: 118.1100 },
      { name: '曾厝垵', lat: 24.4365, lng: 118.1070 },
    ],
  },
  {
    name: '大理',
    province: '云南',
    emoji: '🏔️',
    attractions: [
      { name: '大理古城', lat: 25.6830, lng: 100.1620 },
      { name: '洱海', lat: 25.6120, lng: 100.2450 },
      { name: '崇圣寺三塔', lat: 25.7060, lng: 100.1430 },
      { name: '喜洲古镇', lat: 25.8590, lng: 100.1060 },
    ],
  },
]
