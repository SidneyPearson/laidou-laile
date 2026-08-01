import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  initSocialFoodSearch,
  matchSocialEvidence,
  platformFromUrl,
  searchSocialFoodEvidence,
  type SocialSearchResult,
} from './socialFoodSearch.js'

afterEach(() => {
  initSocialFoodSearch(undefined)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('social food evidence', () => {
  it('recognises supported public platform domains', () => {
    expect(platformFromUrl('https://www.xiaohongshu.com/explore/1')).toBe('小红书')
    expect(platformFromUrl('https://www.douyin.com/video/1')).toBe('抖音')
    expect(platformFromUrl('https://www.meituan.com/shop/1')).toBe('美团')
    expect(platformFromUrl('https://www.dianping.com/shop/1')).toBe('美团')
    expect(platformFromUrl('https://example.com/post')).toBeNull()
  })

  it('matches evidence by shop name, never by address alone', () => {
    const results: SocialSearchResult[] = [
      {
        title: '小红书：茶然居值得打卡',
        content: '浦东下午茶推荐',
        url: 'https://www.xiaohongshu.com/explore/tea',
      },
      {
        title: '南码头路热门美食汇总',
        content: '世博大道附近餐厅',
        url: 'https://www.douyin.com/video/list',
      },
    ]

    const matched = matchSocialEvidence('茶然居', results)
    expect(matched).toHaveLength(1)
    expect(matched[0]?.confidence).toBeGreaterThanOrEqual(0.7)
    expect(matchSocialEvidence('圣拉维滨江宴会中心', results)).toHaveLength(0)
  })

  it('scores a brand-and-branch match as high confidence', () => {
    const evidence = matchSocialEvidence('茶然居(南锣鼓巷店)', [{
      title: '小红书｜茶然居南锣鼓巷店探店',
      content: '茶然居值得打卡',
      url: 'https://www.xiaohongshu.com/explore/1',
    }])

    expect(evidence).toHaveLength(1)
    expect(evidence[0]?.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('matches Amap shop names that use full-width branch parentheses', () => {
    const evidence = matchSocialEvidence('阿娘面馆（思南路店）', [{
      title: '阿娘面馆思南路店探店',
      content: '本帮浇头面推荐',
      url: 'https://www.dianping.com/shop/a-niang-sinan',
    }])

    expect(evidence).toHaveLength(1)
    expect(evidence[0]?.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('scores an unambiguous brand-only match as medium confidence', () => {
    const evidence = matchSocialEvidence('额尔敦传统涮肉(南锣鼓巷店)', [{
      title: '额尔敦传统涮肉鼓楼店探店',
      content: '老北京铜锅涮肉推荐',
      url: 'https://www.douyin.com/video/brand-only',
    }])

    expect(evidence).toHaveLength(1)
    expect(evidence[0]?.confidence).toBeGreaterThanOrEqual(0.7)
    expect(evidence[0]?.confidence).toBeLessThan(0.9)
  })

  it('rejects area-or-category-only results without a concrete shop match', () => {
    expect(matchSocialEvidence('茶然居(南锣鼓巷店)', [{
      title: '南锣鼓巷美食推荐',
      content: '十家咖啡与茶馆合集',
      url: 'https://www.xiaohongshu.com/explore/2',
    }])).toEqual([])
  })

  it('deduplicates evidence URLs, caps matches at three, and always scores output', () => {
    const result = (url: string, title: string): SocialSearchResult => ({
      title,
      content: '茶然居南锣鼓巷店值得打卡',
      url,
    })
    const duplicateUrl = 'https://www.xiaohongshu.com/explore/duplicate'
    const evidence = matchSocialEvidence('茶然居(南锣鼓巷店)', [
      result(duplicateUrl, '茶然居南锣鼓巷店探店一'),
      result(duplicateUrl, '茶然居南锣鼓巷店探店二'),
      result('https://www.douyin.com/video/1', '茶然居南锣鼓巷店'),
      result('https://www.dianping.com/shop/2', '茶然居南锣鼓巷店'),
      result('https://www.xiaohongshu.com/explore/3', '茶然居南锣鼓巷店'),
    ])

    expect(evidence).toHaveLength(3)
    expect(new Set(evidence.map(item => item.url)).size).toBe(3)
    expect(evidence.every(item => typeof item.confidence === 'number')).toBe(true)
  })

  it('uses one free search credit per uncached area and reuses the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        title: '茶然居打卡推荐',
        content: '浦东热门下午茶',
        url: 'https://www.xiaohongshu.com/explore/tea-cache',
      }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    initSocialFoodSearch('tvly-test')

    const first = await searchSocialFoodEvidence('测试区唯一缓存键-001')
    const second = await searchSocialFoodEvidence('测试区唯一缓存键-001')

    expect(first).toEqual(second)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      search_depth: 'basic',
      max_results: 10,
    })
  })

  it('adds a bounded concrete-shop context and reuses it regardless of name order', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      results: [],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    initSocialFoodSearch('tvly-test')

    const names = ['阿娘面馆', '沪西老弄堂面馆', '老上海葱油拌面']
    await searchSocialFoodEvidence('上海市 外滩', names)
    await searchSocialFoodEvidence('上海市 外滩', [...names].reverse())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { query: string }
    expect(body.query).toContain('上海市 外滩')
    for (const name of names) expect(body.query).toContain(name)
  })

  it('caps concrete shop names so one basic query stays focused', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    initSocialFoodSearch('tvly-test')

    const names = Array.from({ length: 8 }, (_, index) => `候选餐厅${index + 1}`)
    await searchSocialFoodEvidence('候选上限测试区', names)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { query: string }
    for (const name of names.slice(0, 6)) expect(body.query).toContain(name)
    expect(body.query).not.toContain(names[6])
    expect(body.query).not.toContain(names[7])
  })

  it('does not reuse an area cache entry for a different concrete candidate set', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      results: [],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    initSocialFoodSearch('tvly-test')

    await searchSocialFoodEvidence('候选缓存隔离区', ['阿娘面馆'])
    await searchSocialFoodEvidence('候选缓存隔离区', ['茶然居'])

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([401, 429, 500])(
    'degrades without retrying or throwing on HTTP %i',
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('', { status }))
      vi.stubGlobal('fetch', fetchMock)
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      initSocialFoodSearch('tvly-test')

      await expect(
        searchSocialFoodEvidence(`测试区HTTP失败-${status}`),
      ).resolves.toEqual([])
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it('aborts a timed-out request once and degrades without throwing', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (signal?.aborted) {
          reject(new DOMException('The operation was aborted', 'AbortError'))
          return
        }
        signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'))
        }, { once: true })
      }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    initSocialFoodSearch('tvly-test')

    const search = searchSocialFoodEvidence('测试区请求超时-003')
    await vi.advanceTimersByTimeAsync(8000)

    await expect(search).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })
})
