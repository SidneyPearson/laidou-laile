/** Normalize a name for dedup/comparison: lowercase, remove punctuation and whitespace */
export function normalizeName(s: string): string {
  return s.replace(/[（）()\s·.\-—,，、/\\[\]【】《》"']/g, '').toLowerCase()
}
