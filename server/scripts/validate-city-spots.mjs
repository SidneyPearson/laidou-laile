import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(scriptDir, '../../data/city-spots')
const categories = new Set(['classic_landmark', 'featured_district', 'theme_park', 'nature', 'walk_street', 'mall', 'food', 'museum_culture'])
const tiers = new Set(['S', 'A', 'B', 'C'])
const verificationStatuses = new Set(['unverified', 'verified', 'failed', 'stale'])
const publicationStatuses = new Set(['draft', 'pending_review', 'published', 'disabled'])
const requiredStrings = ['id', 'cityAdcode', 'name', 'searchName', 'category', 'tier', 'reason', 'tierReason', 'suggestedDuration', 'bestTime', 'verificationStatus', 'publicationStatus', 'sourceKind', 'createdAt', 'updatedAt']
const cityCenters = {
  北京: [116.4074, 39.9042], 成都: [104.0665, 30.5728], 重庆: [106.5516, 29.563],
  杭州: [120.1551, 30.2741], 广州: [113.2644, 23.1291], 深圳: [114.0579, 22.5431],
  西安: [108.9398, 34.3416], 长沙: [112.9388, 28.2282], 南京: [118.7969, 32.0603],
  武汉: [114.3054, 30.5931], 青岛: [120.3826, 36.0671], 厦门: [118.0894, 24.4798],
}

function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(value))
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message)
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(dataDir, 'china-popular-cities.json'), 'utf8'))
  const errors = []
  const ids = new Set()
  const poiIds = new Set()
  let spotCount = 0
  let sourceCount = 0
  let verifiedCount = 0

  assert(manifest.totalCities === 12, `城市数应为12，实际${manifest.totalCities}`, errors)
  assert(manifest.totalSpots === 144, `地点数应为144，实际${manifest.totalSpots}`, errors)
  assert(new Set(manifest.cities.map(item => item.city.adcode)).size === manifest.cities.length, '城市adcode重复', errors)

  for (const manifestCity of manifest.cities) {
    const filePath = path.join(dataDir, manifestCity.jsonFile)
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'))
    assert(data.city.name === manifestCity.city.name, `${manifestCity.jsonFile}: 城市名称不一致`, errors)
    assert(data.city.adcode === manifestCity.city.adcode, `${manifestCity.jsonFile}: adcode不一致`, errors)
    assert(data.total === 12 && data.spots.length === 12, `${manifestCity.jsonFile}: 地点数不是12`, errors)

    for (const spot of data.spots) {
      const prefix = `${manifestCity.city.name}/${spot.name ?? '未命名'}`
      spotCount += 1
      for (const field of requiredStrings) assert(typeof spot[field] === 'string' && spot[field].trim(), `${prefix}: ${field}缺失`, errors)
      assert(spot.cityAdcode === manifestCity.city.adcode, `${prefix}: cityAdcode不一致`, errors)
      assert(!ids.has(spot.id), `${prefix}: id重复 ${spot.id}`, errors)
      ids.add(spot.id)
      assert(categories.has(spot.category), `${prefix}: category非法`, errors)
      assert(tiers.has(spot.tier), `${prefix}: tier非法`, errors)
      assert(verificationStatuses.has(spot.verificationStatus), `${prefix}: verificationStatus非法`, errors)
      assert(publicationStatuses.has(spot.publicationStatus), `${prefix}: publicationStatus非法`, errors)
      assert(spot.publicationStatus === 'draft', `${prefix}: 必须保持draft`, errors)
      assert(Array.isArray(spot.personas) && spot.personas.length > 0, `${prefix}: personas为空`, errors)
      assert(Array.isArray(spot.tags) && spot.tags.length > 0, `${prefix}: tags为空`, errors)
      assert(typeof spot.indoorFriendly === 'boolean', `${prefix}: indoorFriendly不是boolean`, errors)
      assert(typeof spot.reservationRequired === 'boolean', `${prefix}: reservationRequired不是boolean`, errors)
      assert(spot.coverImageUrl === null, `${prefix}: coverImageUrl必须为null`, errors)
      assert(Number.isInteger(spot.priority), `${prefix}: priority不是整数`, errors)
      assert(Number.isInteger(spot.version) && spot.version >= 1, `${prefix}: version非法`, errors)
      assert(Array.isArray(spot.sources) && spot.sources.length > 0, `${prefix}: sources为空`, errors)
      sourceCount += spot.sources?.length ?? 0
      if (Number.isFinite(spot.lng) || Number.isFinite(spot.lat)) {
        assert(Number.isFinite(spot.lng) && Number.isFinite(spot.lat), `${prefix}: 经纬度必须同时存在`, errors)
        assert(distanceKm(cityCenters[manifestCity.city.name], [spot.lng, spot.lat]) <= 100, `${prefix}: 坐标距城市中心超过100公里`, errors)
      }

      if (spot.verificationStatus === 'verified') {
        verifiedCount += 1
        assert(typeof spot.amapPoiId === 'string' && spot.amapPoiId, `${prefix}: verified但缺少amapPoiId`, errors)
        assert(Number.isFinite(spot.lng) && Number.isFinite(spot.lat), `${prefix}: verified但坐标无效`, errors)
        assert(!poiIds.has(spot.amapPoiId), `${prefix}: amapPoiId重复 ${spot.amapPoiId}`, errors)
        poiIds.add(spot.amapPoiId)
      } else {
        assert(spot.amapPoiId === null, `${prefix}: 未验证地点不应有amapPoiId`, errors)
      }
    }
  }

  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
    return
  }
  console.log(JSON.stringify({ valid: true, cities: manifest.totalCities, spots: spotCount, sources: sourceCount, verified: verifiedCount, unverified: spotCount - verifiedCount, allDraft: true, imagesEmpty: true }, null, 2))
}

await main()
