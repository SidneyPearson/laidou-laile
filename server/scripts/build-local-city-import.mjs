import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '../..')
const dataDir = path.join(projectRoot, 'data/city-spots')
const outputDir = path.join(projectRoot, 'server/generated')
const outputPath = path.join(outputDir, 'local-popular-city-spots.sql')

const sql = value => {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${String(value).replaceAll("'", "''")}'`
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(dataDir, 'china-popular-cities.json'), 'utf8'))
  const cityData = await Promise.all(manifest.cities.map(async item => ({
    manifest: item,
    data: JSON.parse(await fs.readFile(path.join(dataDir, item.jsonFile), 'utf8')),
  })))
  const lines = [
    'PRAGMA foreign_keys = ON;',
    'BEGIN TRANSACTION;',
    '',
    '-- 非破坏性导入：已有记录按主键更新，新记录新增，不删除任何本地数据。',
    '',
  ]

  for (const { manifest: item } of cityData) {
    const city = item.city
    lines.push(
      `INSERT INTO cities (adcode, province_name, name, slug, intro, cover_image_url, status, priority, review_interval_days, created_at, updated_at) VALUES (${[
        city.adcode,
        city.provinceName,
        city.name,
        city.slug,
        item.intro,
        null,
        'draft',
        100 - item.rank,
        14,
        manifest.generatedAt,
        manifest.generatedAt,
      ].map(sql).join(', ')}) ON CONFLICT(adcode) DO UPDATE SET province_name=excluded.province_name, name=excluded.name, slug=excluded.slug, intro=excluded.intro, status='draft', priority=excluded.priority, review_interval_days=excluded.review_interval_days, updated_at=excluded.updated_at;`,
    )
  }
  lines.push('')

  for (const { data } of cityData) {
    for (const spot of data.spots) {
      const values = [
        spot.id, spot.cityAdcode, spot.name, spot.searchName, spot.amapName, spot.amapPoiId,
        spot.district, spot.address, spot.lng, spot.lat, spot.category, spot.tier, spot.priority,
        spot.reason, spot.tierReason, JSON.stringify(spot.personas), JSON.stringify(spot.tags),
        spot.suggestedDuration, spot.bestTime, spot.indoorFriendly, spot.reservationRequired,
        spot.reservationNote, spot.coverImageUrl, spot.verificationStatus, spot.verifiedAt,
        spot.publicationStatus, spot.sourceKind, spot.version, spot.createdAt, spot.updatedAt,
      ]
      lines.push(`INSERT INTO spots (id, city_adcode, name, search_name, amap_name, amap_poi_id, district, address, lng, lat, category, tier, priority, reason, tier_reason, personas_json, tags_json, suggested_duration, best_time, indoor_friendly, reservation_required, reservation_note, cover_image_url, verification_status, verified_at, publication_status, source_kind, version, created_at, updated_at) VALUES (${values.map(sql).join(', ')}) ON CONFLICT(id) DO UPDATE SET city_adcode=excluded.city_adcode, name=excluded.name, search_name=excluded.search_name, district=COALESCE(spots.district, excluded.district), address=COALESCE(spots.address, excluded.address), lng=COALESCE(spots.lng, excluded.lng), lat=COALESCE(spots.lat, excluded.lat), category=excluded.category, tier=excluded.tier, priority=excluded.priority, reason=excluded.reason, tier_reason=excluded.tier_reason, personas_json=excluded.personas_json, tags_json=excluded.tags_json, suggested_duration=excluded.suggested_duration, best_time=excluded.best_time, indoor_friendly=excluded.indoor_friendly, reservation_required=excluded.reservation_required, reservation_note=excluded.reservation_note, publication_status=CASE WHEN spots.publication_status='published' THEN 'published' ELSE 'draft' END, source_kind=excluded.source_kind, version=spots.version+1, updated_at=excluded.updated_at;`)
      for (const source of spot.sources) {
        lines.push(`INSERT INTO spot_sources (id, spot_id, title, url, source_name, checked_at, created_at) VALUES (${[source.id, spot.id, source.title, source.url, source.sourceName, source.checkedAt, source.createdAt].map(sql).join(', ')}) ON CONFLICT(id) DO UPDATE SET title=excluded.title, url=excluded.url, source_name=excluded.source_name, checked_at=excluded.checked_at;`)
      }
    }
  }
  lines.push('', 'COMMIT;', '')
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(outputPath, lines.join('\n'))
  console.log(JSON.stringify({ outputPath, cities: cityData.length, spots: cityData.reduce((sum, item) => sum + item.data.spots.length, 0), sources: cityData.reduce((sum, item) => sum + item.data.spots.reduce((inner, spot) => inner + spot.sources.length, 0), 0) }, null, 2))
}

await main()
