interface FoodPoiLike {
  name: string
  type?: string
  typecode?: string
}

const OCCASION_ONLY_RE = /宴会(?:中心|厅)|婚宴|婚礼(?:会馆|酒店|中心)|喜宴/
const INSTITUTIONAL_RE = /(?:大学|学院|学校|医院|机关|政府|公司|企业|园区|工厂).{0,8}(?:食堂|员工餐厅)|单位食堂|职工食堂|员工餐厅/
const CLUB_RE = /私人会所|商务会所|名流会所|会所餐饮/
const HOTEL_INTERNAL_RE = /(?:酒店|宾馆|旅馆|度假村).{0,10}(?:中餐厅|西餐厅|自助餐厅|全日餐厅|宴会厅)/
const LODGING_ONLY_RE = /(?:酒店|宾馆|旅馆|度假村)(?:[（(][^)）]*[)）])?$/
const VENUE_SERVICE_RE = /团体接待|会议餐厅|场地服务/

/** Keep only venues that an ordinary user can independently visit for food. */
export function isOrdinaryDineInPoi(poi: FoodPoiLike): boolean {
  if (poi.typecode && !poi.typecode.startsWith('05')) return false
  const text = `${poi.name} ${poi.type ?? ''}`
  return !OCCASION_ONLY_RE.test(text)
    && !INSTITUTIONAL_RE.test(text)
    && !CLUB_RE.test(text)
    && !HOTEL_INTERNAL_RE.test(text)
    && !LODGING_ONLY_RE.test(poi.name)
    && !VENUE_SERVICE_RE.test(text)
}
