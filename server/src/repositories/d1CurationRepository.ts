import type { CityRecord, SpotRecord } from '../domain/curation.js'
import { sanitizeAuditPayload } from '../domain/curation.js'
import type { CityListQuery, CityWrite, CurationRepository, DashboardStats, Page, SpotListQuery, SpotWrite, VerificationWrite } from './curationRepository.js'

function jsonArray(value: unknown): string[] { try { const parsed = JSON.parse(String(value)); return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : [] } catch { return [] } }
function mapCity(row: any): CityRecord { return { adcode: row.adcode, provinceName: row.province_name, name: row.name, slug: row.slug, intro: row.intro, coverImageUrl: row.cover_image_url, status: row.status, priority: row.priority, reviewIntervalDays: Number(row.review_interval_days ?? 7) as 7 | 14 | 30, lastContentReviewAt: row.last_content_review_at ?? null, lastRefreshRunId: row.last_refresh_run_id ?? null, createdAt: row.created_at, updatedAt: row.updated_at, spotCount: Number(row.spot_count ?? 0), publishedSpotCount: Number(row.published_spot_count ?? 0) } }
function mapSpot(row: any): SpotRecord { return { id: row.id, cityAdcode: row.city_adcode, name: row.name, searchName: row.search_name, amapName: row.amap_name, amapPoiId: row.amap_poi_id, district: row.district, address: row.address, lng: row.lng, lat: row.lat, category: row.category, tier: row.tier, priority: row.priority, reason: row.reason, tierReason: row.tier_reason, personas: jsonArray(row.personas_json), tags: jsonArray(row.tags_json), suggestedDuration: row.suggested_duration, bestTime: row.best_time, indoorFriendly: row.indoor_friendly === 1, reservationRequired: row.reservation_required === 1, reservationNote: row.reservation_note, coverImageUrl: row.cover_image_url, verificationStatus: row.verification_status, verifiedAt: row.verified_at, publicationStatus: row.publication_status, sourceKind: row.source_kind, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at } }
function page<T>(items: T[], number: number, size: number, total: number): Page<T> { return { items, page: number, pageSize: size, total, totalPages: Math.ceil(total / size) } }

/** Reverse geocoding returns *district* adcodes (e.g. 310105 for 长宁区),
 *  while curated cities are keyed by the *city-level* adcode. Normalize:
 *  municipalities (北京11/天津12/上海31/重庆50) → xx0000, others → xxYY00
 *  (e.g. 330106 西湖区 → 330100 杭州市). */
function toCityLevelAdcode(adcode: string): string {
  const province = adcode.slice(0, 2)
  if (['11', '12', '31', '50'].includes(province)) return `${province}0000`
  return `${adcode.slice(0, 4)}00`
}

export class D1CurationRepository implements CurationRepository {
  constructor(private readonly db: D1Database) {}
  async listCities(q: CityListQuery) {
    const where = q.keyword ? 'WHERE c.name LIKE ? OR c.province_name LIKE ?' : ''
    const binds = q.keyword ? [`%${q.keyword}%`, `%${q.keyword}%`] : []
    const count = await this.db.prepare(`SELECT COUNT(*) total FROM cities c ${where}`).bind(...binds).first<{total:number}>()
    const rows = await this.db.prepare(`SELECT c.*, COUNT(s.id) spot_count, SUM(CASE WHEN s.publication_status='published' THEN 1 ELSE 0 END) published_spot_count FROM cities c LEFT JOIN spots s ON s.city_adcode=c.adcode ${where} GROUP BY c.adcode ORDER BY c.priority DESC,c.name LIMIT ? OFFSET ?`).bind(...binds, q.pageSize, (q.page - 1) * q.pageSize).all()
    return page(rows.results.map(mapCity), q.page, q.pageSize, Number(count?.total ?? 0))
  }
  async listPublishedCities() {
    const rows = await this.db.prepare(
      "SELECT * FROM cities WHERE status='published' ORDER BY priority DESC,name",
    ).all()
    return rows.results.map(mapCity)
  }
  async findPublishedCity(nameOrAdcode: string) {
    const value = nameOrAdcode.trim()
    if (!value) return null
    // Match by 6-digit adcode, or by name with/without a trailing 市/省.
    const name = value.replace(/[市省]$/, '')
    if (/^\d{6}$/.test(value)) {
      const row = await this.db.prepare("SELECT * FROM cities WHERE status='published' AND adcode=?").bind(value).first()
      if (row) return mapCity(row)
      // District adcode from reverse geocoding → retry at city level.
      const cityLevel = toCityLevelAdcode(value)
      if (cityLevel !== value) {
        const up = await this.db.prepare("SELECT * FROM cities WHERE status='published' AND adcode=?").bind(cityLevel).first()
        if (up) return mapCity(up)
      }
      return null
    }
    const byName = await this.db.prepare("SELECT * FROM cities WHERE status='published' AND (name=? OR name=?)").bind(name, value).first()
    return byName ? mapCity(byName) : null
  }
  async createCity(i: CityWrite, now: string) { await this.db.prepare('INSERT INTO cities(adcode,province_name,name,slug,intro,cover_image_url,status,priority,review_interval_days,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(i.adcode,i.provinceName,i.name,i.slug,i.intro??null,i.coverImageUrl??null,i.status,i.priority,i.reviewIntervalDays??7,now,now).run(); return mapCity(await this.db.prepare('SELECT * FROM cities WHERE adcode=?').bind(i.adcode).first()) }
  async updateCity(adcode: string, i: Partial<Omit<CityWrite,'adcode'>>, now: string) {
    const current = await this.db.prepare('SELECT * FROM cities WHERE adcode=?').bind(adcode).first<any>(); if (!current) return null
    await this.db.prepare('UPDATE cities SET province_name=?,name=?,slug=?,intro=?,cover_image_url=?,status=?,priority=?,review_interval_days=?,updated_at=? WHERE adcode=?').bind(i.provinceName??current.province_name,i.name??current.name,i.slug??current.slug,i.intro===undefined?current.intro:i.intro,i.coverImageUrl===undefined?current.cover_image_url:i.coverImageUrl,i.status??current.status,i.priority??current.priority,i.reviewIntervalDays??current.review_interval_days??7,now,adcode).run()
    return mapCity(await this.db.prepare('SELECT * FROM cities WHERE adcode=?').bind(adcode).first())
  }
  async listSpots(q: SpotListQuery) {
    const clauses:string[]=[]; const binds:unknown[]=[]
    for (const [column,value] of [['city_adcode',q.cityAdcode],['category',q.category],['tier',q.tier],['verification_status',q.verificationStatus],['publication_status',q.publicationStatus]] as const) if(value){clauses.push(`${column}=?`);binds.push(value)}
    if(q.keyword){clauses.push('(name LIKE ? OR search_name LIKE ? OR address LIKE ?)');binds.push(`%${q.keyword}%`,`%${q.keyword}%`,`%${q.keyword}%`)}
    if(q.persona){clauses.push(`EXISTS (SELECT 1 FROM json_each(personas_json) WHERE json_each.value = ?)`);binds.push(q.persona)}
    const where=clauses.length?`WHERE ${clauses.join(' AND ')}`:''
    const count=await this.db.prepare(`SELECT COUNT(*) total FROM spots ${where}`).bind(...binds).first<{total:number}>()
    const rows=await this.db.prepare(`SELECT * FROM spots ${where} ORDER BY CASE tier WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END,priority DESC,name LIMIT ? OFFSET ?`).bind(...binds,q.pageSize,(q.page-1)*q.pageSize).all()
    return page(rows.results.map(mapSpot),q.page,q.pageSize,Number(count?.total??0))
  }
  async getSpot(id:string){
    const row=await this.db.prepare('SELECT * FROM spots WHERE id=?').bind(id).first()
    if(!row)return null
    const spot=mapSpot(row)
    const sources=await this.db.prepare('SELECT title,url,source_name,checked_at FROM spot_sources WHERE spot_id=? ORDER BY created_at,id').bind(id).all<any>()
    spot.sources=sources.results.map(source=>({title:source.title,url:source.url,sourceName:source.source_name,checkedAt:source.checked_at}))
    return spot
  }
  async createSpot(i:SpotWrite,now:string){
    const statements = [
      this.db.prepare(`INSERT INTO spots(id,city_adcode,name,search_name,district,address,lng,lat,category,tier,priority,reason,tier_reason,personas_json,tags_json,suggested_duration,best_time,indoor_friendly,reservation_required,reservation_note,cover_image_url,verification_status,publication_status,source_kind,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'unverified',?,?,1,?,?)`).bind(i.id,i.cityAdcode,i.name,i.searchName,i.district??null,i.address??null,i.lng??null,i.lat??null,i.category,i.tier,i.priority,i.reason,i.tierReason,JSON.stringify(i.personas),JSON.stringify(i.tags),i.suggestedDuration??null,i.bestTime??null,i.indoorFriendly?1:0,i.reservationRequired?1:0,i.reservationNote??null,i.coverImageUrl??null,i.publicationStatus,i.sourceKind??'admin',now,now),
      ...(i.sources??[]).map((s,index)=>this.db.prepare('INSERT INTO spot_sources(id,spot_id,title,url,source_name,checked_at,created_at) VALUES(?,?,?,?,?,?,?)').bind(`${i.id}-source-${index+1}`,i.id,s.title,s.url??null,s.sourceName??null,s.checkedAt??null,now)),
    ]
    await this.db.batch(statements)
    return (await this.getSpot(i.id))!
  }
  private async replaceSources(spotId:string,sources:any[],now:string){await this.db.prepare('DELETE FROM spot_sources WHERE spot_id=?').bind(spotId).run();if(sources.length)await this.db.batch(sources.map((s,index)=>this.db.prepare('INSERT INTO spot_sources(id,spot_id,title,url,source_name,checked_at,created_at) VALUES(?,?,?,?,?,?,?)').bind(`${spotId}-source-${index+1}`,spotId,s.title,s.url??null,s.sourceName??null,s.checkedAt??null,now)))}
  async updateSpot(id:string,v:number,i:Partial<SpotWrite>,now:string){
    const c=await this.getSpot(id);if(!c)return null;if(c.version!==v)return 'conflict'
    const next={...c,...i}
    const verificationSensitive = (i.cityAdcode !== undefined && i.cityAdcode !== c.cityAdcode)
      || (i.searchName !== undefined && i.searchName !== c.searchName)
      || (i.lng !== undefined && i.lng !== c.lng)
      || (i.lat !== undefined && i.lat !== c.lat)
    const nextPublication = verificationSensitive ? 'draft' : next.publicationStatus
    const r=await this.db.prepare(`UPDATE spots SET city_adcode=?,name=?,search_name=?,district=?,address=?,lng=?,lat=?,category=?,tier=?,priority=?,reason=?,tier_reason=?,personas_json=?,tags_json=?,suggested_duration=?,best_time=?,indoor_friendly=?,reservation_required=?,reservation_note=?,cover_image_url=?,publication_status=?,source_kind=?,verification_status=CASE WHEN ?=1 THEN 'stale' ELSE verification_status END,version=version+1,updated_at=? WHERE id=? AND version=?`).bind(next.cityAdcode,next.name,next.searchName,next.district,next.address,next.lng,next.lat,next.category,next.tier,next.priority,next.reason,next.tierReason,JSON.stringify(next.personas),JSON.stringify(next.tags),next.suggestedDuration,next.bestTime,next.indoorFriendly?1:0,next.reservationRequired?1:0,next.reservationNote,next.coverImageUrl,nextPublication,next.sourceKind,verificationSensitive?1:0,now,id,v).run()
    if(!r.meta.changes)return 'conflict';if(i.sources)await this.replaceSources(id,i.sources,now);return this.getSpot(id) as Promise<SpotRecord>
  }
  async setVerification(id:string,v:number,i:VerificationWrite,now:string){const r=await this.db.prepare('UPDATE spots SET amap_name=?,amap_poi_id=?,district=COALESCE(?,district),address=?,lng=?,lat=?,cover_image_url=COALESCE(?,cover_image_url),verification_status=?,verified_at=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(i.amapName,i.amapPoiId,i.district??null,i.address??null,i.lng,i.lat,i.coverImageUrl??null,i.verificationStatus,i.verifiedAt,now,id,v).run();if(!r.meta.changes)return (await this.getSpot(id))?'conflict':null;return this.getSpot(id) as Promise<SpotRecord>}
  async setPublication(id:string,v:number,status:any,now:string){const r=await this.db.prepare('UPDATE spots SET publication_status=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(status,now,id,v).run();if(!r.meta.changes)return (await this.getSpot(id))?'conflict':null;return this.getSpot(id) as Promise<SpotRecord>}
  async deleteSpot(id:string,v:number):Promise<'conflict'|'published'|null>{const row=await this.db.prepare('SELECT publication_status FROM spots WHERE id=?').bind(id).first<any>();if(!row)return null;if(row.publication_status==='published')return 'published';const r=await this.db.prepare('DELETE FROM spots WHERE id=? AND version=?').bind(id,v).run();if(!r.meta.changes)return 'conflict';await this.db.prepare('DELETE FROM spot_sources WHERE spot_id=?').bind(id).run();return null}
  async dashboard(now:string){const cutoff=new Date(Date.parse(now)-90*86400000).toISOString();const r=await this.db.prepare(`SELECT (SELECT COUNT(*) FROM cities WHERE status='published') publishedCities,(SELECT COUNT(*) FROM spots WHERE publication_status='draft') draftSpots,(SELECT COUNT(*) FROM spots WHERE publication_status='pending_review') pendingReview,(SELECT COUNT(*) FROM spots WHERE publication_status='published') publishedSpots,(SELECT COUNT(*) FROM spots WHERE verification_status='failed') verificationFailed,(SELECT COUNT(*) FROM spots WHERE verification_status='stale' OR (verified_at IS NOT NULL AND verified_at<?)) staleSpots`).bind(cutoff).first<any>();return {publishedCities:Number(r?.publishedCities??0),draftSpots:Number(r?.draftSpots??0),pendingReview:Number(r?.pendingReview??0),publishedSpots:Number(r?.publishedSpots??0),verificationFailed:Number(r?.verificationFailed??0),staleSpots:Number(r?.staleSpots??0)} as DashboardStats}
  async audit(action:string,entityType:string,entityId:string,payload:unknown,now:string){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);const id=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');await this.db.prepare('INSERT INTO admin_audit_logs(id,action,entity_type,entity_id,payload_json,created_at) VALUES(?,?,?,?,?,?)').bind(id,action,entityType,entityId,JSON.stringify(sanitizeAuditPayload(payload)),now).run()}
  async listPublished(cityAdcode?:string){const sql=`SELECT * FROM spots WHERE publication_status='published' AND verification_status='verified' ${cityAdcode?'AND city_adcode=?':''} ORDER BY CASE tier WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END,priority DESC,name`;const r=cityAdcode?await this.db.prepare(sql).bind(cityAdcode).all():await this.db.prepare(sql).all();return r.results.map(mapSpot)}
}
