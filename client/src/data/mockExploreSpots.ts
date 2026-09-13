import type {
  CategoryOption,
  ExploreCategory,
  InspirationSpot,
  Persona,
  PersonaOption,
  SpotTheme,
} from '../types/explore'

export const PERSONAS: PersonaOption[] = [
  { id: 'fast', name: '特种兵', emoji: '⚡', tagline: '地标拉满，少走回头路' },
  // Keep `couple` as the stable internal id; the user-facing name is 约会.
  { id: 'couple', name: '约会', emoji: '🌙', tagline: '氛围、拍照和夜景' },
  { id: 'family', name: '亲子', emoji: '🎈', tagline: '少折返，留够休息时间' },
  { id: 'lazy', name: '自由', emoji: '🛋️', tagline: '点位少，但每处都能待' },
  { id: 'urban', name: '精致', emoji: '🥂', tagline: '街区、展览与精致体验' },
]

export const EXPLORE_CATEGORIES: CategoryOption[] = [
  { id: 'all', name: '都看看', emoji: '✨' },
  { id: 'landmark', name: '经典必去', emoji: '🏛️' },
  { id: 'district', name: '特色区域', emoji: '🏘️' },
  { id: 'theme_park', name: '主题乐园', emoji: '🎡' },
  { id: 'nature', name: '山水自然', emoji: '🌿' },
  { id: 'street', name: '步行街', emoji: '🚶' },
  { id: 'mall', name: '购物商场', emoji: '🛍️' },
  { id: 'food', name: '美食探店', emoji: '🥢' },
  { id: 'museum', name: '博物馆人文', emoji: '🏛️' },
]

const ALL_PERSONAS: Persona[] = ['fast', 'couple', 'family', 'lazy', 'urban']

const SHANGHAI_SPOTS: InspirationSpot[] = [
  {
    id: 'shanghai-bund',
    city: '上海',
    name: '外滩',
    district: '黄浦区',
    category: 'landmark',
    reason: '第一次来上海，很难绕开的城市天际线；适合从黄昏一路走到亮灯。',
    tags: ['城市地标', '夜景', '沿江'],
    suitablePersonas: ['fast', 'couple', 'family'],
    suggestedDuration: '建议 1.5 小时',
    bestTime: '黄昏至亮灯',
    theme: 'river',
    mock: true,
  },
  {
    id: 'shanghai-wukang',
    city: '上海',
    name: '武康路—安福路街区',
    district: '徐汇区',
    category: 'district',
    reason: '梧桐、老建筑和小店集中，适合不赶路地感受上海街区气质。',
    tags: ['梧桐街区', '建筑', '散步'],
    suitablePersonas: ['couple', 'lazy', 'urban'],
    suggestedDuration: '建议 2–3 小时',
    bestTime: '午后',
    theme: 'lane',
    mock: true,
  },
  {
    id: 'shanghai-museum-east',
    city: '上海',
    name: '上海博物馆东馆',
    district: '浦东新区',
    category: 'museum',
    reason: '室内内容密度高，适合作为炎热或下雨天的一站式文化体验。',
    tags: ['博物馆', '室内', '亲子'],
    suitablePersonas: ['family', 'lazy', 'urban'],
    suggestedDuration: '建议 2–3 小时',
    bestTime: '上午',
    theme: 'museum',
    mock: true,
  },
  {
    id: 'shanghai-disney',
    city: '上海',
    name: '上海迪士尼度假区',
    district: '浦东新区',
    category: 'theme_park',
    reason: '适合直接占满一天的目的地，不建议再硬塞跨城区点位。',
    tags: ['主题乐园', '一日游', '亲子'],
    suitablePersonas: ['fast', 'couple', 'family'],
    suggestedDuration: '建议一整天',
    bestTime: '开园前抵达',
    theme: 'wonderland',
    mock: true,
  },
  {
    id: 'shanghai-west-bund',
    city: '上海',
    name: '西岸滨江',
    district: '徐汇区',
    category: 'nature',
    reason: '江边步道、公共空间和艺术场馆可以自由组合，节奏容易掌控。',
    tags: ['滨江', '日落', '艺术'],
    suitablePersonas: ['couple', 'family', 'lazy', 'urban'],
    suggestedDuration: '建议 2 小时',
    bestTime: '傍晚',
    theme: 'garden',
    mock: true,
  },
  {
    id: 'shanghai-yuyuan',
    city: '上海',
    name: '豫园—城隍庙',
    district: '黄浦区',
    category: 'street',
    reason: '古典园林和老城厢氛围集中，适合与外滩组合成第一次来上海的路线。',
    tags: ['老城厢', '园林', '传统'],
    suitablePersonas: ['fast', 'family'],
    suggestedDuration: '建议 2 小时',
    bestTime: '上午或亮灯后',
    theme: 'market',
    mock: true,
  },
  {
    id: 'shanghai-taikoo-li',
    city: '上海',
    name: '前滩太古里',
    district: '浦东新区',
    category: 'mall',
    reason: '商业、餐饮和户外空间集中，适合不想频繁换乘的轻松半天。',
    tags: ['商场', '餐饮', '轻松'],
    suitablePersonas: ['couple', 'lazy', 'urban'],
    suggestedDuration: '建议 2–4 小时',
    bestTime: '下午至晚间',
    theme: 'city',
    mock: true,
  },
  {
    id: 'shanghai-nanjing-road',
    city: '上海',
    name: '南京路步行街',
    district: '黄浦区',
    category: 'street',
    reason: '与人民广场、外滩自然衔接，适合第一次来上海快速串起核心地标。',
    tags: ['步行街', '夜景', '地标'],
    suitablePersonas: ['fast', 'family', 'urban'],
    suggestedDuration: '建议 1–2 小时',
    bestTime: '傍晚',
    theme: 'night',
    mock: true,
  },
  {
    id: 'shanghai-zhujiajiao',
    city: '上海',
    name: '朱家角古镇',
    district: '青浦区',
    category: 'district',
    reason: '适合把半天留给一个完整区域，不必在市中心反复赶场。',
    tags: ['古镇', '水乡', '慢游'],
    suitablePersonas: ['couple', 'family', 'lazy'],
    suggestedDuration: '建议半天',
    bestTime: '上午',
    theme: 'river',
    mock: true,
  },
  {
    id: 'shanghai-chenshan',
    city: '上海',
    name: '辰山植物园',
    district: '松江区',
    category: 'nature',
    reason: '面积大、停留时间长，更适合当作当天主目的地，而不是普通顺路 POI。',
    tags: ['植物园', '户外', '亲子'],
    suitablePersonas: ['couple', 'family', 'lazy'],
    suggestedDuration: '建议半天',
    bestTime: '上午',
    theme: 'garden',
    mock: true,
  },
  {
    id: 'shanghai-lujiazui-center',
    city: '上海',
    name: '陆家嘴中心商圈',
    district: '浦东新区',
    category: 'mall',
    reason: '商场、城市景观和滨江距离近，雨天也能灵活调整室内外比例。',
    tags: ['商圈', '室内', '夜景'],
    suitablePersonas: ['fast', 'lazy', 'urban'],
    suggestedDuration: '建议 2–3 小时',
    bestTime: '下午至晚间',
    theme: 'city',
    mock: true,
  },
  {
    id: 'shanghai-huanghe-road',
    city: '上海',
    name: '黄河路及周边',
    district: '黄浦区',
    category: 'food',
    reason: '更适合作为人民广场一带路线的用餐落点，而不是单独跨城前往。',
    tags: ['老上海', '街区', '用餐'],
    suitablePersonas: ['fast', 'couple', 'urban'],
    suggestedDuration: '建议 1–2 小时',
    bestTime: '晚餐时段',
    theme: 'night',
    mock: true,
  },
]

const BEIJING_SPOTS: InspirationSpot[] = [
  {
    id: 'beijing-palace-museum', city: '北京', name: '故宫博物院', district: '东城区',
    category: 'museum', reason: '北京中轴线最核心的一站，适合单独留出半天并提前预约。',
    tags: ['世界遗产', '博物馆'], suitablePersonas: ['fast', 'couple', 'family'],
    suggestedDuration: '建议半天', bestTime: '上午入场', theme: 'museum', mock: true,
  },
  {
    id: 'beijing-summer-palace', city: '北京', name: '颐和园', district: '海淀区',
    category: 'nature', reason: '园林、湖景和古建集中，适合把半天留给一个完整区域。',
    tags: ['皇家园林', '湖景'], suitablePersonas: ['couple', 'family', 'lazy'],
    suggestedDuration: '建议半天', bestTime: '上午或日落前', theme: 'garden', mock: true,
  },
  {
    id: 'beijing-universal', city: '北京', name: '北京环球度假区', district: '通州区',
    category: 'theme_park', reason: '适合直接占满一天的主目的地，不建议再拼接市中心景点。',
    tags: ['主题乐园', '一日游'], suitablePersonas: ['fast', 'couple', 'family'],
    suggestedDuration: '建议一整天', bestTime: '开园前抵达', theme: 'wonderland', mock: true,
  },
  {
    id: 'beijing-qianmen', city: '北京', name: '前门大街—大栅栏', district: '东城区',
    category: 'street', reason: '老字号、传统商业和中轴线氛围集中，可与天坛或故宫南线衔接。',
    tags: ['步行街', '老字号'], suitablePersonas: ['fast', 'family', 'urban'],
    suggestedDuration: '建议 2 小时', bestTime: '下午至亮灯', theme: 'market', mock: true,
  },
  {
    id: 'beijing-shichahai', city: '北京', name: '什刹海—烟袋斜街', district: '西城区',
    category: 'district', reason: '湖面、胡同和老城生活感共存，适合午后慢走到夜色。',
    tags: ['胡同', '湖景'], suitablePersonas: ['couple', 'lazy', 'urban'],
    suggestedDuration: '建议 2–3 小时', bestTime: '午后至晚间', theme: 'river', mock: true,
  },
  {
    id: 'beijing-798', city: '北京', name: '798艺术区', district: '朝阳区',
    category: 'district', reason: '展览、工业建筑和店铺密集，适合在一个街区内自由组合。',
    tags: ['艺术区', '展览'], suitablePersonas: ['couple', 'lazy', 'urban'],
    suggestedDuration: '建议 3 小时', bestTime: '午后', theme: 'city', mock: true,
  },
  {
    id: 'beijing-sanlitun', city: '北京', name: '三里屯太古里', district: '朝阳区',
    category: 'mall', reason: '购物、餐饮与夜生活集中，适合不想频繁换乘的城市型半天。',
    tags: ['商场', '潮流'], suitablePersonas: ['couple', 'lazy', 'urban'],
    suggestedDuration: '建议 2–4 小时', bestTime: '下午至晚间', theme: 'city', mock: true,
  },
  {
    id: 'beijing-guijie', city: '北京', name: '簋街', district: '东城区',
    category: 'food', reason: '餐饮密集且营业时段偏晚，适合作为夜游路线的用餐落点。',
    tags: ['美食街', '夜宵'], suitablePersonas: ['fast', 'couple', 'urban'],
    suggestedDuration: '建议 1–2 小时', bestTime: '晚餐至夜宵', theme: 'night', mock: true,
  },
]

const HANGZHOU_SPOTS: InspirationSpot[] = [
  {
    id: 'hangzhou-west-lake', city: '杭州', name: '西湖风景名胜区', district: '西湖区',
    category: 'landmark', reason: '杭州最核心的城市体验，适合按湖滨、苏堤或北山街分段游玩。',
    tags: ['世界遗产', '湖景'], suitablePersonas: ['fast', 'couple', 'family', 'lazy'],
    suggestedDuration: '建议半天', bestTime: '清晨或傍晚', theme: 'river', mock: true,
  },
  {
    id: 'hangzhou-lingyin', city: '杭州', name: '灵隐寺—飞来峰', district: '西湖区',
    category: 'landmark', reason: '寺院、石刻和山林集中，适合上午慢游并预留排队时间。',
    tags: ['寺院', '山林'], suitablePersonas: ['couple', 'family', 'lazy'],
    suggestedDuration: '建议 3 小时', bestTime: '上午', theme: 'garden', mock: true,
  },
  {
    id: 'hangzhou-xixi', city: '杭州', name: '西溪国家湿地公园', district: '西湖区',
    category: 'nature', reason: '水网、芦苇和慢行空间适合放慢节奏，最好单独安排半天。',
    tags: ['湿地', '自然'], suitablePersonas: ['couple', 'family', 'lazy'],
    suggestedDuration: '建议半天', bestTime: '上午', theme: 'garden', mock: true,
  },
  {
    id: 'hangzhou-liangzhu-museum', city: '杭州', name: '良渚博物院', district: '余杭区',
    category: 'landmark', reason: '了解良渚文明的室内目的地，适合雨天并应提前查看预约要求。',
    tags: ['博物馆', '室内'], suitablePersonas: ['family', 'lazy', 'urban'],
    suggestedDuration: '建议 2–3 小时', bestTime: '上午', theme: 'museum', mock: true,
  },
  {
    id: 'hangzhou-songcheng', city: '杭州', name: '杭州宋城', district: '西湖区',
    category: 'theme_park', reason: '演出和园区内容适合占据大半天，具体场次以当天公告为准。',
    tags: ['主题景区', '演出'], suitablePersonas: ['fast', 'couple', 'family'],
    suggestedDuration: '建议半天至一天', bestTime: '结合演出场次', theme: 'wonderland', mock: true,
  },
  {
    id: 'hangzhou-xiaohe-street', city: '杭州', name: '小河直街历史文化街区', district: '拱墅区',
    category: 'district', reason: '运河边老街尺度舒适，适合和桥西、拱宸桥组成慢逛路线。',
    tags: ['运河', '老街'], suitablePersonas: ['couple', 'lazy', 'urban'],
    suggestedDuration: '建议 2 小时', bestTime: '午后', theme: 'lane', mock: true,
  },
  {
    id: 'hangzhou-hefang-street', city: '杭州', name: '清河坊历史文化特色街区', district: '上城区',
    category: 'street', reason: '传统商业、老字号和南宋街巷氛围集中，可与吴山顺路组合。',
    tags: ['步行街', '老字号'], suitablePersonas: ['fast', 'family', 'urban'],
    suggestedDuration: '建议 2 小时', bestTime: '下午至晚间', theme: 'market', mock: true,
  },
  {
    id: 'hangzhou-hubin-intime', city: '杭州', name: '湖滨银泰in77', district: '上城区',
    category: 'mall', reason: '购物餐饮与西湖东岸相连，雨天也能在室内外灵活切换。',
    tags: ['商圈', '西湖边'], suitablePersonas: ['couple', 'lazy', 'urban'],
    suggestedDuration: '建议 2–4 小时', bestTime: '下午至晚间', theme: 'city', mock: true,
  },
  {
    id: 'hangzhou-wulin-night-market', city: '杭州', name: '武林夜市', district: '拱墅区',
    category: 'food', reason: '适合作为市中心夜游的用餐和逛摊落点，而不是白天专程前往。',
    tags: ['夜市', '小吃'], suitablePersonas: ['fast', 'couple', 'urban'],
    suggestedDuration: '建议 1–2 小时', bestTime: '晚间', theme: 'night', mock: true,
  },
]

export function getExploreSpots(cityName: string): InspirationSpot[] {
  if (cityName === '上海') return SHANGHAI_SPOTS
  if (cityName === '北京') return BEIJING_SPOTS
  if (cityName === '杭州') return HANGZHOU_SPOTS
  return []
}

export function filterAndRankSpots(
  spots: InspirationSpot[],
  persona: Persona,
  category: ExploreCategory,
): InspirationSpot[] {
  return spots
    .filter(spot => category === 'all' || spot.category === category)
    .map((spot, index) => ({
      spot,
      index,
      score: spot.suitablePersonas.includes(persona) ? 1 : 0,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.spot)
}
