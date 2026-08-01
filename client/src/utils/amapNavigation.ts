export function amapNavigationUrl(name: string, lng: number, lat: number): string {
  const destination = `${lng},${lat},${encodeURIComponent(name)}`
  return `https://uri.amap.com/navigation?to=${destination}&mode=walk&callnative=1`
}

export function openAmapNavigation(name: string, lng: number, lat: number): void {
  window.open(amapNavigationUrl(name, lng, lat), '_blank', 'noopener,noreferrer')
}

