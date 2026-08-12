import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CITIES, TOURISM_SOURCES } from './city-spot-catalog.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '../..')
const outputDir = path.join(projectRoot, 'data/city-spots')
const checkedAt = new Date().toISOString()
const skipAmap = process.env.SKIP_AMAP === '1'

function parseDevVars(content) {
  return Object.fromEntries(content.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const index = line.indexOf('=')
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')]
    }))
}

function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s·•（）()\-—_]/g, '')
    .replace(/风景名胜区|旅游度假区|旅游区|文化旅游区|民俗风貌区|历史文化街区|景区|公园/g, '')
}

function commonPrefixLength(a, b) {
  let length = 0
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1
  return length
}

function matchScore(query, candidate) {
  const a = normalizeName(query)
  const b = normalizeName(candidate)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.92
  return commonPrefixLength(a, b) / Math.max(a.length, b.length)
}

async function searchAmap(key, city, name) {
  const url = new URL('https://restapi.amap.com/v3/place/text')
  url.searchParams.set('key', key)
  url.searchParams.set('keywords', name)
  url.searchParams.set('city', city.adcode)
  url.searchParams.set('citylimit', 'true')
  url.searchParams.set('offset', '20')
  url.searchParams.set('page', '1')
  url.searchParams.set('extensions', 'base')

  const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`AMap HTTP ${response.status}`)
  const payload = await response.json()
  if (payload.status !== '1') throw new Error(`AMap ${payload.infocode}: ${payload.info}`)

  const candidates = (payload.pois ?? [])
    .filter(poi => String(poi.adcode ?? '').slice(0, 4) === city.adcode.slice(0, 4))
    .map(poi => ({ poi, score: matchScore(name, poi.name) }))
    .sort((a, b) => b.score - a.score)
  const best = candidates[0]
  return best && best.score >= 0.52 ? best : null
}

function personasFor(category) {
  const map = {
    classic_landmark: ['first_visit', 'photography', 'culture'],
    featured_district: ['urban', 'photography', 'couple', 'lazy'],
    theme_park: ['family', 'couple', 'theme_park'],
    nature: ['photography', 'family', 'lazy'],
    walk_street: ['urban', 'couple', 'shopping'],
    mall: ['shopping', 'couple', 'lazy'],
    food: ['urban', 'couple', 'lazy'],
    museum_culture: ['culture', 'museum', 'family'],
  }
  return map[category]
}

function tierFor(index, explicitTier) {
  if (explicitTier) return explicitTier
  if (index < 3) return 'S'
  if (index < 9) return 'A'
  return 'B'
}

function tierReason(tier) {
  if (tier === 'S') return '全国知名且城市辨识度高，初次到访建议优先安排。'
  if (tier === 'A') return '城市代表性与游览完成度较高，适合纳入常规行程。'
  return '具有鲜明在地特色，适合按兴趣、天气或路线位置补充安排。'
}

async function main() {
  const vars = parseDevVars(await fs.readFile(path.join(projectRoot, 'server/.dev.vars'), 'utf8'))
  const key = process.env.AMAP_WEB_API_KEY || vars.AMAP_WEB_API_KEY
  if (!key) throw new Error('AMAP_WEB_API_KEY is required in environment or server/.dev.vars')
  await fs.mkdir(outputDir, { recursive: true })

  const manifestCities = []
  const unresolved = []
  let verifiedSpotCount = 0
  for (const city of CITIES) {
    const outputSpots = []
    for (const [index, definition] of city.spots.entries()) {
      let match = null
      try {
        match = skipAmap ? null : await searchAmap(key, city, definition.searchName)
      } catch (error) {
        unresolved.push({ city: city.name, spot: definition.name, error: error.message })
      }

      const poi = match?.poi
      const [lng, lat] = typeof poi?.location === 'string'
        ? poi.location.split(',').map(Number)
        : [null, null]
      const verified = Boolean(poi?.id && Number.isFinite(lng) && Number.isFinite(lat))
      if (verified) verifiedSpotCount += 1
      if (!verified && !skipAmap && !unresolved.some(item => item.city === city.name && item.spot === definition.name)) {
        unresolved.push({ city: city.name, spot: definition.name, error: '没有达到名称与城市匹配阈值' })
      }

      const id = definition.id ?? `${city.slug}-spot-${String(index + 1).padStart(2, '0')}`
      const tier = tierFor(index, definition.tier)
      outputSpots.push({
        id,
        cityAdcode: city.adcode,
        name: definition.name,
        searchName: definition.searchName,
        amapName: verified ? poi.name : null,
        amapPoiId: verified ? poi.id : null,
        district: verified ? (poi.adname || poi.pname || null) : null,
        address: verified && typeof poi.address === 'string' ? poi.address : null,
        lng: verified ? lng : null,
        lat: verified ? lat : null,
        category: definition.category,
        tier,
        priority: 100 - index * 5,
        reason: definition.reason,
        tierReason: tierReason(tier),
        personas: definition.personas ?? personasFor(definition.category),
        tags: definition.tags,
        suggestedDuration: definition.suggestedDuration ?? '2-3小时',
        bestTime: definition.bestTime ?? '全天',
        indoorFriendly: definition.indoorFriendly ?? (definition.category === 'museum_culture' || definition.category === 'mall'),
        reservationRequired: definition.reservationRequired ?? false,
        reservationNote: definition.reservationRequired ? '预约、票务与开放时间请以运营方最新公告为准。' : null,
        coverImageUrl: null,
        verificationStatus: verified ? 'verified' : 'unverified',
        verifiedAt: verified ? checkedAt : null,
        publicationStatus: 'draft',
        sourceKind: verified ? 'amap_verified' : 'editorial_research',
        version: 1,
        createdAt: checkedAt,
        updatedAt: checkedAt,
        sources: [{
          id: `${id}-source-amap`,
          title: verified ? `高德地图地点核验：${poi.name}` : `高德地图待核验：${definition.name}`,
          url: `https://www.amap.com/search?query=${encodeURIComponent(definition.name)}`,
          sourceName: '高德地图',
          checkedAt,
          createdAt: checkedAt,
        }],
      })
    }

    const cityJson = {
      city: { name: city.name, adcode: city.adcode },
      exportedAt: checkedAt,
      total: outputSpots.length,
      spots: outputSpots,
    }
    await fs.writeFile(path.join(outputDir, `${city.slug}-spots.json`), `${JSON.stringify(cityJson, null, 2)}\n`)
    manifestCities.push({
      rank: city.rank,
      tourismRankBasis: city.rank <= 9 ? '2026年五一国内酒店热门目的地顺位（剔除上海）' : '近两年热门目的地补充，并按2025年GDP排序',
      city: { name: city.name, provinceName: city.provinceName, adcode: city.adcode, slug: city.slug },
      intro: city.intro,
      gdp: { year: 2025, value100MillionCny: city.gdp2025, source: city.gdpSource },
      total: outputSpots.length,
      jsonFile: `${city.slug}-spots.json`,
    })
  }

  const manifest = {
    title: '全国热门城市地点库（上海模板扩展）',
    generatedAt: checkedAt,
    rankingMethod: '旅游热度优先：以前述携程/公开假期目的地榜单的重复出现和顺位为主；榜单外补充城市按2025年GDP总量排序。上海作为模板不重复收录。',
    publicationPolicy: '地点经高德准确匹配后标记verified，但全部保持draft；图片字段统一为null；仅允许导入本地D1。',
    tourismSources: TOURISM_SOURCES,
    totalCities: manifestCities.length,
    totalSpots: manifestCities.reduce((sum, city) => sum + city.total, 0),
    cities: manifestCities,
    validationSummary: {
      amapEnrichmentSkipped: skipAmap,
      verifiedSpots: verifiedSpotCount,
      unresolvedSpots: manifestCities.reduce((sum, city) => sum + city.total, 0) - verifiedSpotCount,
      unresolved,
    },
  }
  await fs.writeFile(path.join(outputDir, 'china-popular-cities.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(JSON.stringify({ outputDir, cities: manifest.totalCities, spots: manifest.totalSpots, unresolved: unresolved.length }, null, 2))
}

await main()
