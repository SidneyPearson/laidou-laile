import { describe,expect,it,vi,afterEach } from 'vitest'
import { loadCityRecommendations } from './cityRecommendations'
vi.mock('axios',()=>({default:{get:vi.fn()}}));import axios from 'axios'
const get=vi.mocked(axios.get)
afterEach(()=>vi.clearAllMocks())
describe('city recommendations',()=>{
  it('does not restore static spots for a managed empty city and bypasses stale caches',async()=>{
    get.mockResolvedValue({data:{source:'d1',managedAdcodes:['310000'],cities:[{adcode:'310000',province:'上海',name:'上海',attractions:[]}]}})
    const r=await loadCityRecommendations()
    expect(r.cities.find(c=>c.name==='上海')?.attractions).toEqual([])
    expect(r.source).toBe('mixed')
    expect(get).toHaveBeenCalledWith('/api/recommendations/cities',expect.objectContaining({headers:{'Cache-Control':'no-cache'}}))
  })
  it('marks explicit static fallback on failure',async()=>{
    get.mockRejectedValue(new Error('offline'))
    const r=await loadCityRecommendations()
    expect(r.source).toBe('static_fallback')
    expect(r.cities.length).toBeGreaterThan(3)
  })
})
