import { Hono } from 'hono'
import { reverseGeocode } from '../services/amap/geocode.js'
import { getWeather } from '../services/amap/weather.js'
import { cityContextQuerySchema } from './exploreRoutes.schemas.js'
import { zodErrorToBody } from '../middleware/errorHandler.js'
import type { Bindings } from '../config/env.js'

interface CityRouteDependencies {
  reverseGeocode?: typeof reverseGeocode
  getWeather?: typeof getWeather
  fetchStaticMap?: typeof fetch
}

interface MapPoint { lng: number; lat: number }

function parseMapPoints(value: string | undefined): MapPoint[] | null {
  if (!value) return null
  const chunks = value.split(';')
  if (chunks.length < 1 || chunks.length > 6) return null
  const points = chunks.map((chunk) => {
    const [lngText, latText, ...rest] = chunk.split(',')
    const lng = Number(lngText)
    const lat = Number(latText)
    if (rest.length || !Number.isFinite(lng) || !Number.isFinite(lat)) return null
    if (lng < 73 || lng > 136 || lat < 3 || lat > 54) return null
    return { lng, lat }
  })
  return points.every((point): point is MapPoint => point !== null) ? points : null
}

export function createCityRoutes(dependencies: CityRouteDependencies = {}) {
  const geocode = dependencies.reverseGeocode ?? reverseGeocode
  const weatherQuery = dependencies.getWeather ?? getWeather
  const staticMapFetch = dependencies.fetchStaticMap ?? fetch
  const routes = new Hono<{ Bindings: Bindings }>()

  routes.get('/context', async (c) => {
    const parsed = cityContextQuerySchema.safeParse({
      lat: c.req.query('lat'),
      lng: c.req.query('lng'),
    })
    if (!parsed.success) return c.json(zodErrorToBody(parsed.error), 400)

    const geo = await geocode(parsed.data.lat, parsed.data.lng)
    if (!geo.city || !geo.adcode) {
      return c.json({
        error: { code: 'CITY_NOT_FOUND', message: '暂时无法识别所在城市，请手动选择' },
      }, 404)
    }

    const weather = await weatherQuery(geo.adcode)
    c.header('Cache-Control', 'no-store')
    return c.json({
      city: geo.city,
      district: geo.district,
      township: geo.township,
      adcode: geo.adcode,
      formattedAddress: geo.formatted,
      weather: weather ? {
        weather: weather.weather,
        temperature: weather.temperature,
        isRainy: weather.isRainy,
        note: weather.note,
      } : null,
    })
  })

  routes.get('/static-map', async (c) => {
    const points = parseMapPoints(c.req.query('points'))
    if (!points) {
      return c.json({ error: { code: 'INVALID_MAP_POINTS', message: '地图地点坐标无效' } }, 400)
    }

    const locations = points.map(point => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`)
    const markers = locations
      .map((location, index) => `large,0x315f45,${index + 1}:${location}`)
      .join('|')
    const paths = points.length >= 2
      ? `5,0x315f45,0.72,,:${locations.join(';')}`
      : ''
    const params = new URLSearchParams({
      key: c.env.AMAP_WEB_API_KEY,
      size: '750*520',
      scale: '1',
      markers,
      ...(paths ? { paths } : {}),
    })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), c.env.AMAP_TIMEOUT_MS)
    try {
      const response = await staticMapFetch(`https://restapi.amap.com/v3/staticmap?${params}`, {
        signal: controller.signal,
      })
      const contentType = response.headers.get('Content-Type') || ''
      if (!response.ok || !contentType.startsWith('image/')) {
        return c.json({ error: { code: 'STATIC_MAP_UNAVAILABLE', message: '地图底图暂时不可用' } }, 502)
      }
      return new Response(response.body, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      })
    } catch {
      return c.json({ error: { code: 'STATIC_MAP_UNAVAILABLE', message: '地图底图暂时不可用' } }, 502)
    } finally {
      clearTimeout(timer)
    }
  })

  return routes
}

export default createCityRoutes()
