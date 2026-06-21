import { getAmapClient } from './client.js'
import type { AmapRegeoResponse } from '../../types/poi.js'

/** Reverse geocode: get human-readable location name from coordinates */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ district: string; township: string; city: string; adcode: string; formatted: string }> {
  const client = getAmapClient()

  try {
    const { data } = await client.get<AmapRegeoResponse>('/geocode/regeo', {
      params: {
        location: `${lng},${lat}`,
        extensions: 'base',
      },
    })

    const comp = data.regeocode.addressComponent
    // Amap returns city/district as empty arrays `[]` for 直辖市 (北京/上海/天津/重庆).
    // `[]` is truthy in JS, so we must explicitly check for non-string values.
    const cityRaw = typeof comp.city === 'string' ? comp.city : ''
    const districtRaw = typeof comp.district === 'string' ? comp.district : ''
    const province = typeof comp.province === 'string' ? comp.province : ''

    // For 直辖市, province IS the city (e.g. "上海市", "北京市"). Fall through:
    // province → city → district
    const district = districtRaw || ''
    const township = comp.township || ''
    const city = cityRaw || province || district || ''
    const adcode = comp.adcode || comp.citycode || ''
    const formatted = data.regeocode.formatted_address || `${district}${township}附近`

    return { district, township, city, adcode, formatted }
  } catch (err: any) {
    console.error('Reverse geocode failed:', err.message)
    return {
      district: '',
      township: '',
      city: '',
      adcode: '',
      formatted: '当前位置附近',
    }
  }
}
