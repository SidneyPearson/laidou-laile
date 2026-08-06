-- 首页 4 张灵感卡对应的真实策展景点。
-- 数据来源：高德 place/text 实时查询（POI ID、坐标、地址均为真实值，非编造）。
-- 发布为 published + verified，H5 /api/explore/recommend 才会返回。
-- 封面图与当前前端种子一致（Unsplash CDN），后续可在后台替换。

-- 上海城市置为已发布
INSERT INTO cities (adcode, province_name, name, slug, intro, cover_image_url, status, priority, created_at, updated_at)
VALUES ('310000', '上海', '上海', 'shanghai', '江河入海处的现代都市，城市地标、街区与文化场馆并存。', NULL, 'published', 100, '2026-07-26T00:00:00.000Z', '2026-08-05T00:00:00.000Z')
ON CONFLICT(adcode) DO UPDATE SET
  status = 'published',
  priority = 100,
  updated_at = '2026-08-05T00:00:00.000Z';

-- 首页四景点（UPSERT，可重复执行）
INSERT INTO spots (
  id, city_adcode, name, search_name, amap_name, amap_poi_id, district, address,
  lng, lat, category, tier, priority, reason, tier_reason, personas_json, tags_json,
  suggested_duration, best_time, indoor_friendly, reservation_required, reservation_note,
  cover_image_url, verification_status, verified_at, publication_status, source_kind, version, created_at, updated_at
) VALUES
(
  'shanghai-wukang-mantime', '310000', '武康路慢时光', '武康路', '武康路', 'B0IA3PHRXP', '徐汇区', '武康路',
  121.440627, 31.209252, 'walk_street', 'A', 95,
  '老洋房、梧桐街区与咖啡馆聚集的城市漫步代表路段，适合拍照和慢逛。',
  '城市辨识度高，适合街区漫游、拍照与情侣/懒人画像。',
  '["first_visit","city_walk","photography","food"]', '["老洋房","咖啡","拍照","城市漫步"]',
  '1-2小时', '白天至傍晚', 0, 0, NULL,
  'https://images.unsplash.com/photo-1494522855154-9297ac14b55f?w=400&q=70&auto=format&fit=crop',
  'verified', '2026-08-05T00:00:00.000Z', 'published', 'admin_curated', 1,
  '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z'
),
(
  'shanghai-museum-east', '310000', '上海博物馆东馆', '上海博物馆东馆', '上海博物馆(东馆)', 'B0FFIFP90V', '浦东新区', '世纪大道1952号',
  121.538745, 31.219913, 'museum_culture', 'A', 90,
  '建筑与馆藏兼具的新文化地标，适合人文、艺术与室内参观。',
  '文化场馆代表性强，雨天/亲子/人文画像优先推荐。',
  '["first_visit","culture","museum","family"]', '["博物馆","建筑","人文","艺术"]',
  '2-3小时', '全天', 1, 1, '预约与开放安排请以官方公告为准。',
  'https://images.unsplash.com/photo-1519677100203-a0e668c92439?w=400&q=70&auto=format&fit=crop',
  'verified', '2026-08-05T00:00:00.000Z', 'published', 'admin_curated', 1,
  '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z'
),
(
  'shanghai-bund-rooftop', '310000', '外滩 Rooftop', '外滩', '外滩', 'B00155FXB3', '黄浦区', '中山东二路1号',
  121.492127, 31.233516, 'classic_landmark', 'A', 85,
  '陆家嘴天际线与近代建筑群交汇的夜景观景区域，氛围感强。',
  '夜景、江景与拍照代表性强，适合情侣与首次到访。',
  '["first_visit","photography","food"]', '["夜景","江景","氛围感","城市地标"]',
  '1-2小时', '傍晚至夜间', 0, 0, NULL,
  'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=400&q=70&auto=format&fit=crop',
  'verified', '2026-08-05T00:00:00.000Z', 'published', 'admin_curated', 1,
  '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z'
),
(
  'shanghai-natural-history-museum', '310000', '上海自然博物馆', '上海自然博物馆', '上海自然博物馆', 'B00156NVZG', '静安区', '北京西路510号',
  121.462672, 31.235021, 'museum_culture', 'A', 80,
  '恐龙化石与互动展项丰富的科普场馆，适合亲子与室内参观。',
  '亲子友好、室内、科普性强，雨天也适合安排。',
  '["first_visit","family","museum","culture"]', '["科普","互动","亲子","室内"]',
  '2-3小时', '全天', 1, 1, '预约与开放安排请以官方公告为准。',
  'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&q=70&auto=format&fit=crop',
  'verified', '2026-08-05T00:00:00.000Z', 'published', 'admin_curated', 1,
  '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z'
)
ON CONFLICT(id) DO UPDATE SET
  city_adcode = excluded.city_adcode,
  name = excluded.name,
  search_name = excluded.search_name,
  amap_name = excluded.amap_name,
  amap_poi_id = excluded.amap_poi_id,
  district = excluded.district,
  address = excluded.address,
  lng = excluded.lng,
  lat = excluded.lat,
  category = excluded.category,
  tier = excluded.tier,
  priority = excluded.priority,
  reason = excluded.reason,
  tier_reason = excluded.tier_reason,
  personas_json = excluded.personas_json,
  tags_json = excluded.tags_json,
  cover_image_url = excluded.cover_image_url,
  verification_status = 'verified',
  verified_at = '2026-08-05T00:00:00.000Z',
  publication_status = 'published',
  source_kind = 'admin_curated',
  updated_at = '2026-08-05T00:00:00.000Z';

-- 旧的"外滩"种子与上面的"外滩 Rooftop"共用同一 POI，会在首页造成重复，收回到草稿。
UPDATE spots SET publication_status = 'draft', updated_at = '2026-08-05T00:00:00.000Z'
WHERE id = 'shanghai-the-bund';
