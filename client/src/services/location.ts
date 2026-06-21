export interface Coords {
  lat: number
  lng: number
}

export type LocationErrorType =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'NOT_SUPPORTED'

export class LocationError extends Error {
  constructor(public type: LocationErrorType, message: string) {
    super(message)
    this.name = 'LocationError'
  }
}

export function getCurrentPosition(
  timeoutMs = 10000,
): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new LocationError('NOT_SUPPORTED', '您的浏览器不支持定位功能'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      (error) => {
        let type: LocationErrorType
        let message: string
        switch (error.code) {
          case error.PERMISSION_DENIED:
            type = 'PERMISSION_DENIED'
            message = '请允许获取位置信息，我们才能为您推荐附近路线'
            break
          case error.POSITION_UNAVAILABLE:
            type = 'POSITION_UNAVAILABLE'
            message = '无法获取位置信息，请检查GPS是否开启'
            break
          case error.TIMEOUT:
            type = 'TIMEOUT'
            message = '获取位置超时，请重试'
            break
          default:
            type = 'POSITION_UNAVAILABLE'
            message = '获取位置失败，请稍后重试'
        }
        reject(new LocationError(type, message))
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 300000, // 5 min cache
      },
    )
  })
}

// Mock location for development (Beijing Gulou)
export function getMockPosition(): Coords {
  return {
    lat: 39.9396,
    lng: 116.397,
  }
}
