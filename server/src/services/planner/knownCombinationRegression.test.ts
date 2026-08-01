import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AmapPOI } from '../../types/poi.js'
import type {
  CuisineType,
  DistanceOption,
  PreferenceTag,
  Route,
  ScenicType,
  TimeOption,
  WanderType,
} from '../../types/route.js'

const providers = vi.hoisted(() => ({
  searchNearbyPOIs: vi.fn(),
  generatePlan: vi.fn(),
  reverseGeocode: vi.fn(),
  getWeather: vi.fn(),
}))

vi.mock('../amap/poiSearch.js', () => ({ searchNearbyPOIs: providers.searchNearbyPOIs }))
vi.mock('../amap/geocode.js', () => ({ reverseGeocode: providers.reverseGeocode }))
vi.mock('../amap/weather.js', () => ({ getWeather: providers.getWeather }))
vi.mock('../aiPlannerService.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../aiPlannerService.js')>()
  return { ...original, generatePlan: providers.generatePlan }
})

import { generateRoutes } from '../routeGenerator.js'

interface CombinationFixture {
  label: string
  origin: { lat: number; lng: number }
  areaName: string
  timeOption: TimeOption
  distance: DistanceOption
  preferences: PreferenceTag[]
  cuisineTypes?: CuisineType[]
  scenicTypes?: ScenicType[]
  wanderTypes?: WanderType[]
  candidates: AmapPOI[]
  mustKeep: string[]
  mustReject: string[]
}

const BLACKLIST = /学校|中学|小学|幼儿园|培训中心|培训学校|培训机构|青少年活动中心|服务站|维修站|发行站|办事处|政务中心|办公区/

/** Parse every supported count claim instead of merely checking one optional regex. */
function parsePresentedCounts(text: string): number[] {
  const patterns = [
    /TOP\s*(\d+)/gi,
    /(\d+)\s*个地点/g,
    /共\s*(\d+)\s*家/g,
    /(?:AI\s*)?精选\s*(\d+)\s*家/g,
    /附近\s*(\d+)\s*家(?:餐厅)?/g,
  ]
  return patterns.flatMap(pattern =>
    [...text.matchAll(pattern)].map(match => Number.parseInt(match[1], 10)),
  )
}

function expectHardInvariants(route: Route, maxDistance: number, timeMinutes: number) {
  expect(route.stops.length, `${route.name} must contain at least one usable stop`).toBeGreaterThan(0)
  expect(route.stops.every(stop =>
    maxDistance === 0
      || (Number.isFinite(stop.distanceMeters) && (stop.distanceMeters ?? Infinity) <= maxDistance),
  )).toBe(true)
  expect(route.stops.some(stop => BLACKLIST.test(stop.name))).toBe(false)
  expect(route.totalDurationMinutes).toBeLessThanOrEqual(timeMinutes)

  const counts = parsePresentedCounts(`${route.name} ${route.tagline}`)
  expect(counts.length, `${route.name} must expose a machine-checkable final count`).toBeGreaterThan(0)
  for (const count of counts) expect(count).toBe(route.stops.length)
}

function candidate(
  origin: CombinationFixture['origin'],
  id: string,
  name: string,
  distance: number,
  typecode: string,
): AmapPOI {
  return {
    id,
    name,
    distance,
    typecode,
    type: typecode.startsWith('05') ? '餐饮服务' : typecode.startsWith('11') ? '风景名胜' : '休闲场所',
    address: `${name}地址`,
    lng: origin.lng + distance / 1_000_000,
    lat: origin.lat,
    rating: '4.6',
    cost: null,
  }
}

function makeFixtures(): CombinationFixture[] {
  const bund = { lat: 31.2401, lng: 121.4907 }
  const westLake = { lat: 30.2431, lng: 120.1503 }
  const hefang = { lat: 30.2385, lng: 120.1746 }
  const nanluo = { lat: 39.9387, lng: 116.4034 }
  const kuanzhai = { lat: 30.6699, lng: 104.0599 }
  const muslimQuarter = { lat: 34.2611, lng: 108.9422 }
  const beijingRoad = { lat: 23.1252, lng: 113.2708 }

  return [
    {
      label: '01 上海外滩｜1小时｜500m｜美食不限：补足可用餐厅并排除非餐饮服务站',
      origin: bund, areaName: '外滩', timeOption: 60, distance: 500, preferences: ['food'],
      candidates: [
        candidate(bund, 'sh-food-1', '德兴馆本帮菜', 120, '050100'),
        candidate(bund, 'sh-food-2', '老上海菜馆', 260, '050100'),
        candidate(bund, 'sh-food-bad', '滨江餐饮服务站', 180, '070000'),
      ],
      mustKeep: ['德兴馆本帮菜', '老上海菜馆'], mustReject: ['滨江餐饮服务站'],
    },
    {
      label: '02 上海外滩｜2小时｜1km｜面馆：不再出现TOP3但实际2家',
      origin: bund, areaName: '外滩', timeOption: 120, distance: 1000, preferences: ['food'], cuisineTypes: ['noodles'],
      candidates: [
        ...Array.from({ length: 9 }, (_, index) =>
          candidate(bund, `sh-noodle-${index}`, `老上海面馆${index + 1}号店`, 100 + index * 70, '050300')),
        candidate(bund, 'sh-noodle-far', '超范围面馆', 1300, '050300'),
      ],
      mustKeep: ['老上海面馆1号店'], mustReject: ['超范围面馆'],
    },
    {
      label: '03 上海外滩｜半天｜3km｜美食不限：过滤非餐饮候选并保持真实数量',
      origin: bund, areaName: '外滩', timeOption: 240, distance: 3000, preferences: ['food'],
      candidates: [
        candidate(bund, 'sh-half-1', '上海老饭店', 260, '050100'),
        candidate(bund, 'sh-half-2', '人和馆本帮菜', 480, '050100'),
        candidate(bund, 'sh-half-3', '蟹黄面馆', 620, '050300'),
        candidate(bund, 'sh-half-4', '生煎老铺', 780, '050200'),
        candidate(bund, 'sh-half-5', '海派点心店', 940, '050200'),
        candidate(bund, 'sh-half-bad', '外滩美食培训中心', 350, '141400'),
      ],
      mustKeep: ['上海老饭店', '人和馆本帮菜'], mustReject: ['外滩美食培训中心'],
    },
    {
      label: '04 杭州西湖｜半天｜3km｜热门景点：过滤内部小景并保留公开景点',
      origin: westLake, areaName: '西湖', timeOption: 240, distance: 3000, preferences: ['scenic'], scenicTypes: ['popular'],
      candidates: [
        candidate(westLake, 'hz-west-1', '西湖风景名胜区', 220, '110000'),
        candidate(westLake, 'hz-west-2', '白堤', 480, '110000'),
        candidate(westLake, 'hz-west-3', '西泠印社', 760, '140100'),
        candidate(westLake, 'hz-west-4', '雷峰塔景区', 1200, '110000'),
        candidate(westLake, 'hz-west-5', '浙江省博物馆', 1600, '140100'),
        candidate(westLake, 'hz-west-bad', '博物馆古籍部展品', 400, '140100'),
      ],
      mustKeep: ['西湖风景名胜区', '白堤'], mustReject: ['博物馆古籍部展品'],
    },
    {
      label: '05 杭州河坊街｜2小时｜1km｜特色街区：拒绝培训中心、活动中心、发行站和服务站',
      origin: hefang, areaName: '河坊街', timeOption: 120, distance: 1000, preferences: ['scenic'], scenicTypes: ['street'],
      candidates: [
        candidate(hefang, 'hz-hf-1', '河坊街历史文化街区', 120, '110000'),
        candidate(hefang, 'hz-hf-2', '胡庆余堂中药博物馆', 280, '140100'),
        candidate(hefang, 'hz-hf-3', '南宋御街', 460, '110000'),
        candidate(hefang, 'hz-hf-bad-1', '卫生系统培训中心', 80, '140000'),
        candidate(hefang, 'hz-hf-bad-2', '青少年活动中心', 100, '140000'),
        candidate(hefang, 'hz-hf-bad-3', '湖滨发行站', 140, '070000'),
        candidate(hefang, 'hz-hf-bad-4', '美的星级服务站', 180, '070000'),
        candidate(hefang, 'hz-hf-bad-5', '杭州浙一水建驾考中心', 210, '141400'),
        candidate(hefang, 'hz-hf-bad-6', '浙江省教育考试服务中心', 230, '140900'),
        candidate(hefang, 'hz-hf-bad-7', '花鳖专卖店', 250, '061200'),
        candidate(hefang, 'hz-hf-bad-8', '逸心超市(断河头小区店)', 270, '060400'),
      ],
      mustKeep: ['河坊街历史文化街区', '胡庆余堂中药博物馆'],
      mustReject: [
        '卫生系统培训中心', '青少年活动中心', '湖滨发行站', '美的星级服务站',
        '杭州浙一水建驾考中心', '浙江省教育考试服务中心', '花鳖专卖店',
        '逸心超市(断河头小区店)',
      ],
    },
    {
      label: '06 北京南锣鼓巷｜1小时｜500m｜咖啡+小众：数量不足时如实展示且拒绝服务站',
      origin: nanluo, areaName: '南锣鼓巷', timeOption: 60, distance: 500, preferences: ['wander'], wanderTypes: ['cafe', 'hidden'],
      candidates: [
        // Real providers may expose an English brand name; its 0505xx type is
        // still valid evidence for the selected cafe subtype.
        candidate(nanluo, 'bj-cafe-1', 'Wiggly Jiggly’s五月', 90, '050500'),
        candidate(nanluo, 'bj-cafe-2', '老街茶馆', 180, '050500'),
        candidate(nanluo, 'bj-cafe-bad', '南锣便民服务站', 70, '070000'),
        candidate(nanluo, 'bj-cafe-far', '超范围胡同咖啡馆', 620, '050500'),
      ],
      mustKeep: ['Wiggly Jiggly’s五月', '老街茶馆'], mustReject: ['南锣便民服务站', '超范围胡同咖啡馆'],
    },
    {
      label: '07 北京南锣鼓巷｜2小时｜1km｜火锅：候选充足时每条方案数量与文案一致',
      origin: nanluo, areaName: '南锣鼓巷', timeOption: 120, distance: 1000, preferences: ['food'], cuisineTypes: ['hotpot'],
      candidates: [
        ...Array.from({ length: 9 }, (_, index) =>
          candidate(nanluo, `bj-hotpot-${index}`, `老北京铜锅涮肉${index + 1}号店`, 120 + index * 80, '050117')),
        candidate(nanluo, 'bj-hotpot-bad', '火锅培训学校', 100, '141400'),
      ],
      mustKeep: ['老北京铜锅涮肉1号店'], mustReject: ['火锅培训学校'],
    },
    {
      label: '08 成都宽窄巷子｜2小时｜3km｜地方菜：热门区域召回后不能再返回空结果',
      origin: kuanzhai, areaName: '宽窄巷子', timeOption: 120, distance: 3000, preferences: ['food'], cuisineTypes: ['local_cuisine'],
      candidates: [
        candidate(kuanzhai, 'cd-local-1', '成都老字号特色菜一店', 260, '050100'),
        candidate(kuanzhai, 'cd-local-2', '川味本地菜二店', 520, '050100'),
        candidate(kuanzhai, 'cd-local-3', '宽窄巷子老字号三店', 760, '050100'),
        candidate(kuanzhai, 'cd-local-4', '成都特色菜四店', 980, '050100'),
        candidate(kuanzhai, 'cd-local-bad', '成都单位食堂', 120, '050100'),
      ],
      mustKeep: ['成都老字号特色菜一店', '川味本地菜二店'], mustReject: ['成都单位食堂'],
    },
    {
      label: '09 西安回民街｜半天｜3km｜地方菜+热门景点：混合路线不得包含学校',
      origin: muslimQuarter, areaName: '回民街', timeOption: 240, distance: 3000, preferences: ['food', 'scenic'], cuisineTypes: ['local_cuisine'], scenicTypes: ['popular'],
      candidates: [
        candidate(muslimQuarter, 'xa-mix-1', '回民街老字号特色菜', 160, '050100'),
        candidate(muslimQuarter, 'xa-mix-2', '西安本地菜馆', 340, '050100'),
        candidate(muslimQuarter, 'xa-mix-3', '钟楼', 620, '110000'),
        candidate(muslimQuarter, 'xa-mix-4', '鼓楼', 760, '110000'),
        candidate(muslimQuarter, 'xa-mix-5', '化觉巷清真大寺', 900, '110000'),
        candidate(muslimQuarter, 'xa-mix-bad', '回民中学', 220, '140000'),
      ],
      mustKeep: ['回民街老字号特色菜', '钟楼'], mustReject: ['回民中学'],
    },
    {
      label: '10 广州北京路｜1小时｜1km｜购物+娱乐：核心商圈召回后不能再返回空结果',
      origin: beijingRoad, areaName: '北京路步行街', timeOption: 60, distance: 1000, preferences: ['wander'], wanderTypes: ['shopping', 'entertainment'],
      candidates: [
        // Names do not have to repeat the generic subtype words; Amap's
        // selected-category typecodes provide the match.
        candidate(beijingRoad, 'gz-wander-1', '广百百货', 100, '060101'),
        candidate(beijingRoad, 'gz-wander-2', '青宫影城', 520, '080601'),
        candidate(beijingRoad, 'gz-wander-bad', '北京路维修服务站', 80, '070000'),
      ],
      mustKeep: ['广百百货', '青宫影城'], mustReject: ['北京路维修服务站'],
    },
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
  providers.generatePlan.mockResolvedValue({
    routes: [], source: 'fallback', fallbackReason: '离线回归：强制走规则规划入口',
  })
  providers.getWeather.mockResolvedValue(null)
})

describe('10 audited route combinations (providers mocked)', () => {
  it.each(makeFixtures())('$label', async (fixture) => {
    providers.reverseGeocode.mockResolvedValue({
      province: '测试省', city: '测试市', district: fixture.areaName, township: '', adcode: '000000',
    })
    providers.searchNearbyPOIs.mockResolvedValue(fixture.candidates)

    const result = await generateRoutes({
      ...fixture.origin,
      areaName: fixture.areaName,
      timeOption: fixture.timeOption,
      distance: fixture.distance,
      preferences: fixture.preferences,
      cuisineTypes: fixture.cuisineTypes,
      scenicTypes: fixture.scenicTypes,
      wanderTypes: fixture.wanderTypes,
    })

    expect(providers.searchNearbyPOIs).toHaveBeenCalledWith(expect.objectContaining({
      areaName: fixture.areaName,
      distance: fixture.distance,
      timeOption: fixture.timeOption,
      preferences: fixture.preferences,
      cuisineTypes: fixture.cuisineTypes,
      scenicTypes: fixture.scenicTypes,
      wanderTypes: fixture.wanderTypes,
    }))
    expect(result.routes.length, `${fixture.label} must remain usable`).toBeGreaterThan(0)

    const names = result.routes.flatMap(route => route.stops.map(stop => stop.name))
    for (const expected of fixture.mustKeep) expect(names).toContain(expected)
    for (const rejected of fixture.mustReject) expect(names).not.toContain(rejected)
    expect(new Set(result.routes.flatMap(route => route.stops.map(stop => stop.amapPoiId))).size)
      .toBe(names.length)
    for (const route of result.routes) {
      expectHardInvariants(route, fixture.distance, fixture.timeOption)
    }
  })
})
