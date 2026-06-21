import { getAmapClient } from './client.js'
import type { AmapWeatherResponse } from '../../types/poi.js'

interface WeatherInfo {
  weather: string       // e.g. "多云", "小雨"
  temperature: string   // e.g. "25"
  isRainy: boolean
  note: string | null   // e.g. "当前小雨，已为您推荐室内路线"
}

/** Fetch live weather for given adcode (city code) */
export async function getWeather(adcode: string): Promise<WeatherInfo | null> {
  const client = getAmapClient()

  try {
    const { data } = await client.get<AmapWeatherResponse>('/weather/weatherInfo', {
      params: {
        city: adcode,
        extensions: 'base',
      },
    })

    const live = data.lives?.[0]
    if (!live) return null

    const weatherText = live.weather
    const isRainy = /雨|雪|冰雹/.test(weatherText)

    return {
      weather: weatherText,
      temperature: live.temperature,
      isRainy,
      note: isRainy ? `当前${weatherText}，已为您推荐室内路线` : null,
    }
  } catch (err: any) {
    console.error('Weather query failed:', err.message)
    return null
  }
}

/** Try weather by coordinates — get adcode from regeo first, then weather */
export async function getWeatherByCoords(
  lat: number,
  lng: number,
): Promise<WeatherInfo | null> {
  const client = getAmapClient()

  try {
    // First get adcode from reverse geocode
    const { data: regeoData } = await client.get<{ status: string; regeocode: { addressComponent: { adcode: string } } }>(
      '/geocode/regeo',
      { params: { location: `${lng},${lat}`, extensions: 'base' } },
    )
    const adcode = regeoData.regeocode?.addressComponent?.adcode
    if (!adcode) return null

    return getWeather(adcode)
  } catch (err: any) {
    console.error('Weather by coords failed:', err.message)
    return null
  }
}
