import { getAmapClient } from './client.js'
import type { AmapRegeoResponse } from '../../types/poi.js'

/** Reverse geocode: get human-readable location name from coordinates */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ district: string; township: string; formatted: string }> {
  const client = getAmapClient()

  try {
    const { data } = await client.get<AmapRegeoResponse>('/geocode/regeo', {
      params: {
        location: `${lng},${lat}`,
        extensions: 'base',
      },
    })

    const comp = data.regeocode.addressComponent
    const district = comp.district || comp.city || ''
    const township = comp.township || ''
    const formatted = data.regeocode.formatted_address || `${district}${township}附近`

    return { district, township, formatted }
  } catch (err: any) {
    console.error('Reverse geocode failed:', err.message)
    return {
      district: '',
      township: '',
      formatted: '当前位置附近',
    }
  }
}
