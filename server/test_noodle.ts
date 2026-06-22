import { getAmapClient } from './src/services/amap/client.js'

async function main() {
  const client = getAmapClient()
  const { data } = await client.get('/place/around', {
    params: {
      location: '121.50203033004826,31.195603939021307',
      radius: 1000,
      types: '050000',
      keywords: '面馆|面庄|拉面|米线|粉',
      offset: 25,
      page: 1,
      extensions: 'all',
    },
  })
  console.log(`Found ${data.pois?.length || 0} noodle shops within 1km:`)
  for (const p of (data.pois || [])) {
    console.log(`  ${p.name} | ${p.address} | distance=${p.distance}m`)
  }
  
  console.log('\n--- Searching for 渝味重庆面庄 ---')
  const { data: data2 } = await client.get('/place/text', {
    params: {
      keywords: '渝味重庆面庄',
      location: '121.50203033004826,31.195603939021307',
      offset: 5,
      page: 1,
      extensions: 'all',
    },
  })
  for (const p of (data2.pois || [])) {
    console.log(`  ${p.name} | ${p.address} | distance=${p.distance}m`)
  }
}
main().catch(e => console.error(e.message))
