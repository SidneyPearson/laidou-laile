/** 仅统一展示文案；保留画像 ID 和历史票根原始数据。 */
export function personaLabel(value: string): string {
  const aliases: Record<string, string> = {
    fast: '特种兵', 特种兵式: '特种兵',
    couple: '约会', 情侣约会: '约会',
    family: '亲子', 亲子玩乐: '亲子',
    lazy: '自由', 懒人: '自由', 懒人躺平: '自由',
    urban: '精致', 都市丽人: '精致',
  }
  return aliases[value.trim()] ?? value
}
