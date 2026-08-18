import { describe, expect, it } from 'vitest'
import { canPublishSpot, sanitizeAuditPayload, selectMainRecommendations, type SpotRecord } from './curation.js'

function spot(overrides: Partial<SpotRecord> = {}): SpotRecord {
  return { id:'x',cityAdcode:'310000',name:'地点',searchName:'地点',amapName:'地点',amapPoiId:'POI',district:'黄浦区',address:null,lng:121,lat:31,category:'classic_landmark',tier:'A',priority:1,reason:'推荐',tierReason:'理由',personas:[],tags:[],suggestedDuration:'建议 2 小时',bestTime:null,indoorFriendly:false,reservationRequired:false,reservationNote:null,coverImageUrl:null,verificationStatus:'verified',verifiedAt:'2026-01-01T00:00:00Z',publicationStatus:'published',sourceKind:null,version:1,createdAt:'',updatedAt:'',...overrides }
}

describe('curation policy',()=>{
  it('requires verification, POI, coordinates and complete public metadata before publish',()=>{expect(canPublishSpot(spot({verificationStatus:'unverified',amapPoiId:null,tierReason:'',district:' ',suggestedDuration:null}))).toEqual(expect.arrayContaining(['地点尚未通过高德验证','缺少高德 POI ID','级别理由不能为空','区县不能为空','建议停留时间不能为空']))})
  it('excludes drafts, C and unmatched B while keeping S/A before matched B',()=>{const result=selectMainRecommendations([spot({id:'c',tier:'C'}),spot({id:'b',tier:'B',personas:['museum'],priority:999}),spot({id:'a',tier:'A'}),spot({id:'s',tier:'S',priority:0}),spot({id:'draft',publicationStatus:'draft'})],{personas:['museum']});expect(result.map(x=>x.id)).toEqual(['s','a','b'])})
  it('only includes B when category, persona or rainy indoor context matches',()=>{const b=spot({tier:'B',category:'museum_culture',personas:['culture'],indoorFriendly:true});expect(selectMainRecommendations([b])).toHaveLength(0);expect(selectMainRecommendations([b],{category:'museum_culture'})).toHaveLength(1);expect(selectMainRecommendations([b],{personas:['culture']})).toHaveLength(1);expect(selectMainRecommendations([b],{rainy:true})).toHaveLength(1)})
  it('removes secrets from audit payload recursively',()=>{expect(sanitizeAuditPayload({id:'x',password:'p',nested:{cookie:'c',safe:true}})).toEqual({id:'x',nested:{safe:true}})})
})
