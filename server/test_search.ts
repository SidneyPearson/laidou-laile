import { getAmapClient } from './src/services/amap/client.js'

async function main() {
  const client = getAmapClient()
  const { data } = await client.get('/place/text', {
    params: {
      keywords: '面馆|面庄|拉面|米线|粉',
      types: '050000',
      location: '121.50203033004826,31.195603939021307',
      offset: 25,
      page: 1,
      extensions: 'all',
    },
  })
  console.log(`Text search page 1: ${data.pois?.length || 0} results`)
  for (const p of (data.pois || [])) {
    const name = p.name
    if (name.includes('渝味') || name.includes('面庄') || name.includes('面馆')) {
      console.log(`  ${name} | dist=${p.distance} | type=${p.type}`)
    }
  }
}
main().catch(e => console.error(e.message))
