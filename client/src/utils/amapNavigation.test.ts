import { describe, expect, it } from 'vitest'
import {
  amapNavigationUrl,
  closeAmapNavigation,
  openAmapNavigation,
  useAmapNavigation,
} from './amapNavigation'

describe('高德导航分流', () => {
  it('uses web navigation by default and keeps native launch explicit', () => {
    expect(amapNavigationUrl('故宫博物院', 116.397, 39.916)).toContain('callnative=0')
    expect(amapNavigationUrl('故宫博物院', 116.397, 39.916, 1)).toContain('callnative=1')
    expect(amapNavigationUrl('故宫博物院', 116.397, 39.916)).toContain(encodeURIComponent('故宫博物院'))
  })

  it('opens and closes the shared navigation choice without changing route state', () => {
    const navigation = useAmapNavigation()
    openAmapNavigation('故宫博物院', 116.397, 39.916)
    expect(navigation.target.value).toEqual({ name: '故宫博物院', lng: 116.397, lat: 39.916 })

    closeAmapNavigation()
    expect(navigation.target.value).toBeNull()
  })
})
