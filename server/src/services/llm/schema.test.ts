import { describe, it, expect } from 'vitest'
import { parseAndValidate, formatValidationErrors } from './schema.js'

const validRoute = {
  name: '示例路线',
  tagline: '一句话特色描述',
  stops: [
    { name: '外婆家', visitDurationMinutes: 60, notes: '本帮菜老字号，招牌菜叫花鸡' },
  ],
  totalDurationMinutes: 90,
  walkingDistanceMeters: 500,
  tips: '提前预约',
}

describe('parseAndValidate — happy paths', () => {
  it('accepts a minimal valid single-route payload', () => {
    const raw = JSON.stringify({ routes: [validRoute] })
    const out = parseAndValidate(raw)
    expect(out).not.toBeNull()
    expect(out?.routes).toHaveLength(1)
    expect(out?.routes[0].name).toBe('示例路线')
  })

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n' + JSON.stringify({ routes: [validRoute] }) + '\n```'
    expect(parseAndValidate(raw)).not.toBeNull()
  })

  it('accepts up to 3 routes', () => {
    const raw = JSON.stringify({
      routes: [validRoute, validRoute, validRoute],
    })
    expect(parseAndValidate(raw)?.routes).toHaveLength(3)
  })

  it('accepts optional axes/direction/reason fields', () => {
    const raw = JSON.stringify({
      routes: [{
        ...validRoute,
        direction: '深度 · 一处慢逛',
        reason: '与其它路线的差异',
        axes: { goal: 'eat', behavior: 'deep_single', info: 'by_theme' },
      }],
    })
    const out = parseAndValidate(raw)
    expect(out?.routes[0].axes?.goal).toBe('eat')
  })
})

describe('parseAndValidate — rejections', () => {
  it('returns null when routes is missing', () => {
    expect(parseAndValidate(JSON.stringify({}))).toBeNull()
  })

  it('returns null when a route has no stops', () => {
    const raw = JSON.stringify({ routes: [{ ...validRoute, stops: [] }] })
    expect(parseAndValidate(raw)).toBeNull()
  })

  it('returns null when route name exceeds 20 chars', () => {
    const raw = JSON.stringify({
      routes: [{ ...validRoute, name: 'A'.repeat(21) }],
    })
    expect(parseAndValidate(raw)).toBeNull()
  })

  it('returns null when visitDurationMinutes is out of range', () => {
    const raw = JSON.stringify({
      routes: [{ ...validRoute,
        stops: [{ ...validRoute.stops[0], visitDurationMinutes: 999 }],
      }],
    })
    expect(parseAndValidate(raw)).toBeNull()
  })

  it('returns null for total garbage', () => {
    expect(parseAndValidate('not json at all')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseAndValidate('')).toBeNull()
  })
})

describe('parseAndValidate — truncation repair', () => {
  it('repairs a JSON payload missing its closing braces', () => {
    const full = JSON.stringify({ routes: [validRoute] })
    // Drop the final "}}" so parser fails but repair can close it.
    const truncated = full.slice(0, -2)
    const out = parseAndValidate(truncated)
    expect(out).not.toBeNull()
    expect(out?.routes[0].name).toBe('示例路线')
  })
})

describe('formatValidationErrors', () => {
  it('returns per-issue lines for a failing payload', () => {
    const raw = JSON.stringify({ routes: [{ ...validRoute, name: 'A' }] })
    const msg = formatValidationErrors(raw)
    expect(msg).toContain('routes.0.name')
  })

  it('reports invalid JSON syntax', () => {
    expect(formatValidationErrors('not json')).toContain('Invalid JSON')
  })
})
