import { describe, expect, it } from 'vitest'
import loginPage from '../pages/admin/AdminLoginPage.vue?raw'
import spotEditPage from '../pages/admin/AdminSpotEditPage.vue?raw'
import spotListPage from '../pages/admin/AdminSpotsPage.vue?raw'
import refreshPage from '../pages/admin/AdminCityRefreshPage.vue?raw'
import adminLayout from '../layouts/AdminLayout.vue?raw'
import citySwitcher from '../components/admin/AdminCitySwitcher.vue?raw'
import adminComponents from '../components/admin/AdminBadge.vue?raw'
import authSource from './auth.ts?raw'
import typeSource from './types.ts?raw'

const adminSources = [adminLayout, citySwitcher, adminComponents, spotEditPage, spotListPage, refreshPage]

describe('admin UI contracts', () => {
  it('keeps credentials out of local storage and uses password autocomplete', () => {
    expect(loginPage).toContain('autocomplete="current-password"')
    expect(authSource).not.toContain('localStorage')
    expect(authSource).not.toContain('sessionStorage')
    expect(citySwitcher).not.toContain('localStorage')
    expect(citySwitcher).not.toContain('sessionStorage')
  })

  it('has accessible error and image fallback', () => {
    expect(spotEditPage).toContain('role="alert"')
    expect(spotEditPage).toContain('@error="form.coverImageUrl=null"')
  })

  it('shows Chinese labels while retaining stable API enum values', () => {
    expect(typeSource).toContain("classic_landmark: '经典景点 / 城市地标'")
    expect(typeSource).toContain("published: '已发布'")
    expect(spotListPage).toContain('SPOT_CATEGORY_LABELS[spot.category]')
    expect(spotEditPage).toContain('SPOT_TIER_LABELS[value]')
  })

  it('renders imported AI text as escaped text and secures source links', () => {
    expect(refreshPage).not.toContain('v-html')
    expect(refreshPage).toContain('rel="noopener noreferrer"')
    expect(refreshPage).toContain('{{ formatJson(candidate.proposedData) }}')
  })

  it('keeps existing admin destinations and avoids a map SDK dependency', () => {
    expect(adminLayout).toContain("to: '/admin'")
    expect(adminLayout).toContain("to: '/admin/cities'")
    expect(adminLayout).toContain("to: '/admin/spots'")
    for (const source of adminSources) {
      expect(source).not.toMatch(/AMapLoader|LocationMap|amap-jsapi-loader/)
    }
  })
})
