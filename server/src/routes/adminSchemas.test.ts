import { describe, expect, it } from 'vitest'
import { batchPublishSchema, cityCreateSchema, spotCreateSchema, spotListSchema } from './adminSchemas.js'

const validSpot = { id:'spot-id',cityAdcode:'310000',name:'地点',searchName:'地点',category:'classic_landmark',tier:'A',priority:1,reason:'推荐',tierReason:'理由',personas:[],tags:[],indoorFriendly:false,reservationRequired:false,publicationStatus:'draft' }
describe('admin schemas',()=>{
  it('strictly rejects unknown category, tier and status values',()=>{
    expect(spotCreateSchema.safeParse({...validSpot,category:'landmark'}).success).toBe(false)
    expect(spotCreateSchema.safeParse({...validSpot,tier:'D'}).success).toBe(false)
    expect(cityCreateSchema.safeParse({adcode:'310000',provinceName:'上海',name:'上海',slug:'shanghai',status:'active',priority:1}).success).toBe(false)
  })
  it('limits batch publish to 50 records',()=>expect(batchPublishSchema.safeParse({spots:Array.from({length:51},(_,i)=>({id:String(i),expectedVersion:1}))}).success).toBe(false))
  it('validates pagination and filters',()=>{expect(spotListSchema.safeParse({page:'1',pageSize:'20',tier:'S'}).success).toBe(true);expect(spotListSchema.safeParse({page:'0',pageSize:'101'}).success).toBe(false)})
  it('requires non-empty tierReason',()=>expect(spotCreateSchema.safeParse({...validSpot,tierReason:''}).success).toBe(false))
  it('accepts https cover URLs and same-origin /covers/ paths, rejects unsafe values',()=>{
    expect(spotCreateSchema.safeParse({...validSpot,coverImageUrl:'https://cdn.example.com/a.jpg'}).success).toBe(true)
    expect(spotCreateSchema.safeParse({...validSpot,coverImageUrl:'/covers/spot-id.jpg'}).success).toBe(true)
    expect(spotCreateSchema.safeParse({...validSpot,coverImageUrl:'/covers/../evil.jpg'}).success).toBe(false)
    expect(spotCreateSchema.safeParse({...validSpot,coverImageUrl:'http://cdn.example.com/a.jpg'}).success).toBe(false)
    expect(cityCreateSchema.safeParse({adcode:'310000',provinceName:'上海',name:'上海',slug:'shanghai',status:'draft',priority:1,coverImageUrl:'/covers/city-shanghai.jpg'}).success).toBe(true)
  })
})
