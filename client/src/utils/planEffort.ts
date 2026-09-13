/** 强度描述游玩负担，与用户选择的身份分开；距离只表达直线跨度。 */
export function planEffort(minutes: number, count: number, spanMeters: number) {
  let level = 1
  if (count >= 3 || minutes >= 240) level += 1
  if (count >= 5 || minutes >= 420 || spanMeters >= 10000) level += 1
  if (count >= 6 || minutes >= 540 || spanMeters >= 18000) level += 1
  const reasons: string[] = []
  if (minutes >= 240) reasons.push(`游玩约 ${Math.round(minutes / 6) / 10} 小时`)
  if (spanMeters >= 10000) reasons.push(`最远两站直线相隔约 ${(spanMeters / 1000).toFixed(1)} 公里`)
  if (count >= 3) reasons.push(`共 ${count} 个地点`)
  return {
    label: ['轻松', '适中', '偏满', '较紧'][level - 1],
    percent: level * 25,
    note: reasons.length ? `${reasons.join('；')}。${level >= 3 ? '建议少选一站，留出休息时间。' : '给交通和休息留出时间。'}` : '地点不多，可以慢慢逛。',
  }
}
