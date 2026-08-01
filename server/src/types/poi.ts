// Amap API response types

/** Raw POI from Amap around-search response */
export interface AmapRawPOI {
  id: string
  name: string
  type: string
  typecode: string
  address: string
  location: string // "lng,lat"
  distance: string // meters
  parent?: string
  tel: string
  biz_ext?: {
    rating?: string
    cost?: string
  }
  photos?: Array<{
    url: string
    title: string
  }>
}

/** Normalized POI */
export interface AmapPOI {
  id: string
  name: string
  type: string
  typecode: string
  address: string
  lng: number
  lat: number
  distance: number
  rating: string | null
  cost: string | null
  /** Amap parent POI id; internal only, used to collapse scenic sub-POIs. */
  parentId?: string | null
  /** Raw provider photos retained for the admin verification review only. */
  photos?: Array<{ url: string; title: string }>
  /** Best provider photo URL, used as the Amap fallback cover before the gradient. */
  photoUrl?: string
}

/** Amap around-search response */
export interface AmapAroundResponse {
  status: string
  info: string
  count: string
  suggestion: any
  pois: AmapRawPOI[]
}

/** Amap text-search response */
export interface AmapTextResponse {
  status: string
  info: string
  count: string
  suggestion: any
  pois: AmapRawPOI[]
}

/** Amap reverse geocode response */
export interface AmapRegeoResponse {
  status: string
  info: string
  regeocode: {
    formatted_address: string
    addressComponent: {
      province: string
      city: string
      citycode: string
      adcode: string
      district: string
      township: string
      streetNumber: { street: string; number: string }
    }
  }
}

/** Amap weather response */
export interface AmapWeatherResponse {
  status: string
  info: string
  lives: Array<{
    province: string
    city: string
    weather: string
    temperature: string
    winddirection: string
    windpower: string
    humidity: string
    reporttime: string
  }>
}
