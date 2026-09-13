export interface CityIdentity { cityName: string; cityAdcode: string }
export const normalizeCityName = (name: string) => name.trim().replace(/市$/, '')

/** 只给名称唯一对应的行政码补别名，不合并两个不同的有效行政码。 */
export function cityKeyResolver(records: CityIdentity[]) {
  const aliases = new Map<string, Set<string>>()
  for (const record of records) {
    if (!/^\d{6}$/.test(record.cityAdcode)) continue
    const name = normalizeCityName(record.cityName)
    const codes = aliases.get(name) ?? new Set<string>()
    codes.add(record.cityAdcode)
    aliases.set(name, codes)
  }
  return (record: CityIdentity): string => {
    if (/^\d{6}$/.test(record.cityAdcode)) return record.cityAdcode
    const name = normalizeCityName(record.cityName)
    const codes = aliases.get(name)
    return codes?.size === 1 ? [...codes][0] : `name:${name}`
  }
}
