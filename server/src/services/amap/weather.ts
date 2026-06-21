import { getAmapClient } from './client.js'
import type { AmapWeatherResponse } from '../../types/poi.js'

interface WeatherInfo {
  weather: string       // e.g. "多云", "小雨", "雾"
  temperature: string   // e.g. "25"
  isRainy: boolean
  note: string | null   // e.g. "当前小雨，已为您推荐室内路线"
}

/** Normalize adcode to city-level for weather API (district adcode may not be supported) */
function toCityAdcode(adcode: string): string {
  if (!adcode || adcode.length < 6) return adcode
  // Municipalities (11=Beijing, 31=Shanghai, 12=Tianjin, 50=Chongqing):
  // district 310105 → province 310000
  const prefix2 = adcode.slice(0, 2)
  if (['11', '31', '12', '50'].includes(prefix2)) {
    return prefix2 + '0000'
  }
  // Regular cities: district 440106 → city 440100
  return adcode.slice(0, 4) + '00'
}

/** Fetch live weather for given adcode (auto-normalized to city level) */
export async function getWeather(adcode: string): Promise<WeatherInfo | null> {
  const client = getAmapClient()
  const cityCode = toCityAdcode(adcode)

  try {
    const { data } = await client.get<AmapWeatherResponse>('/weather/weatherInfo', {
      params: {
        city: cityCode,
        extensions: 'base',
      },
    })

    const live = data.lives?.[0]
    if (!live) {
      console.warn(`Weather API returned no data for adcode=${adcode} (cityCode=${cityCode})`)
      return null
    }

    const weatherText = live.weather
    const isRainy = /雨|雪|冰雹/.test(weatherText)
    const isFoggy = /雾|霾/.test(weatherText)

    let note: string | null = null
    if (isRainy) {
      note = `当前${weatherText}，已为您推荐室内路线`
    } else if (isFoggy) {
      note = `当前${weatherText}，能见度较低，注意出行安全`
    }

    console.log(`Weather: adcode=${adcode}→cityCode=${cityCode} result="${weatherText}" ${live.temperature}℃`)

    return {
      weather: weatherText,
      temperature: live.temperature,
      isRainy,
      note,
    }
  } catch (err: any) {
    console.error('Weather query failed:', err.message)
    return null
  }
}

