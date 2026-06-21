import { getAmapClient } from './client.js'
import type { AmapWeatherResponse } from '../../types/poi.js'

interface WeatherInfo {
  weather: string       // e.g. "多云", "小雨"
  temperature: string   // e.g. "25"
  isRainy: boolean
  note: string | null   // e.g. "当前小雨，已为您推荐室内路线"
}

/** Fetch live weather for given city code or coordinates */
export async function getWeather(
  lat: number,
  lng: number,
): Promise<WeatherInfo | null> {
  const client = getAmapClient()

  try {
    // Amap weather takes adcode, but for simplicity use city from reverse geocode
    // Since weather info is nice-to-have, catch errors gracefully
    const { data } = await client.get<AmapWeatherResponse>('/weather/weatherInfo', {
      params: {
        city: `${lng},${lat}`,
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
