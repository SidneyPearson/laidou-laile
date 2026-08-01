export interface SeedSpot {
  id: string
  cityAdcode: string
  name: string
  searchName: string
  lat: number | null
  lng: number | null
  category: 'classic_landmark' | 'featured_district' | 'theme_park' | 'nature' | 'walk_street' | 'mall' | 'food' | 'museum_culture'
  tier: 'S' | 'A' | 'B' | 'C'
  priority: number
  reason: string
  tierReason: string
  personas: string[]
  tags: string[]
  indoorFriendly?: boolean
  reservationRequired?: boolean
  reservationNote?: string
}

export interface SeedCity {
  adcode: string
  provinceName: string
  name: string
  slug: string
  intro: string
  priority: number
  spots: SeedSpot[]
}
