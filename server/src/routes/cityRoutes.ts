import { Hono } from 'hono'
import { reverseGeocode } from '../services/amap/geocode.js'
import { getWeather } from '../services/amap/weather.js'
import { cityContextQuerySchema } from './exploreRoutes.schemas.js'
import { zodErrorToBody } from '../middleware/errorHandler.js'

interface CityRouteDependencies {
  reverseGeocode?: typeof reverseGeocode
  getWeather?: typeof getWeather
}

export function createCityRoutes(dependencies: CityRouteDependencies = {}) {
  const geocode = dependencies.reverseGeocode ?? reverseGeocode
  const weatherQuery = dependencies.getWeather ?? getWeather
  const routes = new Hono()

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

  return routes
}

export default createCityRoutes()
