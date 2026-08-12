import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(scriptDir, '../../data/city-spots')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
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

async function geocode(cityName, spotName) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', `${spotName}, ${cityName}, 中国`)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('countrycodes', 'cn')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', '3')
  const response = await fetch(url, {
    headers: { 'User-Agent': 'citywalk-curation-local/1.0' },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`)
  const results = await response.json()
  return results[0] ?? null
}

function compactAddress(result) {
  const address = result.address ?? {}
  const parts = [address.road, address.neighbourhood, address.suburb, address.city_district]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
  return parts.length ? parts.join('，') : result.display_name
}

async function main() {
  const manifestPath = path.join(dataDir, 'china-popular-cities.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const failures = []
  let resolved = 0
  let totalGeocoded = 0
  for (const [cityIndex, manifestCity] of manifest.cities.entries()) {
    const filePath = path.join(dataDir, manifestCity.jsonFile)
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'))
    for (const spot of data.spots) {
      if (Number.isFinite(spot.lng) && Number.isFinite(spot.lat)) {
        const existingDistance = distanceKm(cityCenters[data.city.name], [spot.lng, spot.lat])
        if (spot.sourceKind === 'editorial_research_osm' && existingDistance > 100) {
          spot.lng = null
          spot.lat = null
          spot.district = null
          spot.address = null
          spot.sourceKind = 'editorial_research'
          spot.sources = spot.sources.filter(source => !source.id.endsWith('-source-osm'))
        } else {
          if (spot.sourceKind === 'editorial_research_osm') totalGeocoded += 1
          continue
        }
      }
      try {
        const result = await geocode(data.city.name, spot.name)
        if (!result) {
          failures.push({ city: data.city.name, spot: spot.name, error: '无结果' })
        } else {
          const lng = Number(result.lon)
          const lat = Number(result.lat)
          const distance = distanceKm(cityCenters[data.city.name], [lng, lat])
          if (distance > 100) {
            failures.push({ city: data.city.name, spot: spot.name, error: `结果距城市中心${distance.toFixed(1)}公里，已拒绝` })
            await wait(1100)
            continue
          }
          spot.lng = lng
          spot.lat = lat
          spot.district = result.address?.city_district || result.address?.district || result.address?.county || null
          spot.address = compactAddress(result)
          spot.sourceKind = 'editorial_research_osm'
          spot.updatedAt = new Date().toISOString()
          spot.sources.push({
            id: `${spot.id}-source-osm`,
            title: `OpenStreetMap 地理编码：${result.display_name}`,
            url: `https://www.openstreetmap.org/?mlat=${result.lat}&mlon=${result.lon}#map=17/${result.lat}/${result.lon}`,
            sourceName: 'OpenStreetMap contributors / Nominatim',
            checkedAt: spot.updatedAt,
            createdAt: spot.updatedAt,
          })
          resolved += 1
          totalGeocoded += 1
        }
      } catch (error) {
        failures.push({ city: data.city.name, spot: spot.name, error: error.message })
      }
      await wait(1100)
    }
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`)
    console.log(`[${cityIndex + 1}/${manifest.cities.length}] ${data.city.name}: completed`)
  }
  manifest.validationSummary.fallbackGeocodedSpots = totalGeocoded
  manifest.validationSummary.geocodingFailures = failures
  manifest.validationSummary.unresolvedSpots = failures.length
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(JSON.stringify({ resolved, failures: failures.length, failureDetails: failures }, null, 2))
}

await main()
