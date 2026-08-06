-- 2026-07-27: 沉淀 v03 上海 12 策展地点的官方图片进 D1
--
-- 背景：v03 的 server/src/services/explore/cities/shanghai.ts 含 12 个策展地点，
-- 每个带官方封面图（officialCoverImage.url + 来源）。合并时将其沉淀进 citywalk 的 D1：
--   1) 为 citywalk 已有的 5 个上海 spot 补全 cover_image_url（外滩/迪士尼/南京路/黄河路/博物馆东馆）
--   2) 插入 v03 独有、citywalk 还没有的 7 个策展地点作为新 spot（draft，待高德校验与审核）
--   3) 为每个新 spot 写入 spot_sources 来源记录（官方图出处，仅供内部维护）
--
-- 回退策略（官方图 → 高德图 → 渐变封面）由前端 SpotCover.vue 实现，此处只负责数据沉淀。

-- 确保上海城市行存在（远端空库首次迁移时，下面的 spots INSERT 需要该外键）。
INSERT OR IGNORE INTO cities (adcode, province_name, name, slug, intro, cover_image_url, status, priority, created_at, updated_at)
VALUES ('310000', '上海', '上海', 'shanghai', '江河入海处的现代都市，城市地标、街区与文化场馆并存。', NULL, 'draft', 100, '2026-07-26T00:00:00.000Z', '2026-07-27T00:00:00.000Z');

-- ── 1) 为现有上海 spot 补全官方封面图 ──
UPDATE spots
SET cover_image_url = 'https://english.shanghai.gov.cn/cmsres/21/212ff40f030346cfa5767dcb2cb36663/4e209901f4e8fe80c02b366c3ea258e5.jpg',
    updated_at = '2026-07-27T00:00:00.000Z'
WHERE id = 'shanghai-the-bund';

UPDATE spots
SET cover_image_url = 'https://english.shanghai.gov.cn/cmsres/01/016e9997515a49a8a98a3d12fccbcec4/bcdb4e6497f419e63a67d3dad7f4d610.jpg',
    updated_at = '2026-07-27T00:00:00.000Z'
WHERE id = 'shanghai-disneyland';

UPDATE spots
SET cover_image_url = 'https://english.shanghai.gov.cn/cmsres/04/0405c100e3c84a4c97cacad0d4606c01/986eeafbc592ee9a92755b9a77ef8009.jpg',
    updated_at = '2026-07-27T00:00:00.000Z'
WHERE id = 'shanghai-nanjing-road';

UPDATE spots
SET cover_image_url = 'https://english.shanghai.gov.cn/cmsres/98/98ab8b8673404474836ea4dc5c25642d/eccbc87e4b5ce2fe28308fd9f2a7baf3.jpg',
    updated_at = '2026-07-27T00:00:00.000Z'
WHERE id = 'shanghai-huanghe-road';

UPDATE spots
SET cover_image_url = 'https://english.shanghai.gov.cn/cmsres/f7/f7ab5ea6c2b343a5b524feb4c83bac9e/1c0d8b6ac040493d59537d86b4724655.jpg',
    updated_at = '2026-07-27T00:00:00.000Z'
WHERE id = 'shanghai-museum-east';

-- ── 2) 插入 v03 独有 7 个策展地点（含官方封面图） ──
INSERT OR IGNORE INTO spots (
  id, city_adcode, name, search_name, amap_name, amap_poi_id, district, address,
  lng, lat, category, tier, priority, reason, tier_reason,
  personas_json, tags_json, suggested_duration, best_time,
  indoor_friendly, reservation_required, reservation_note, cover_image_url,
  verification_status, verified_at, publication_status, source_kind, version,
  created_at, updated_at
) VALUES
(
  'shanghai-wukang', '310000', '武康路—安福路街区', '武康路', NULL, NULL, '徐汇区', NULL,
  121.4370, 31.2104, 'featured_district', 'A', 88,
  '梧桐、老建筑和小店集中，适合不赶路地感受上海街区气质。',
  '梧桐街区代表，适合慢游与建筑打卡。',
  '["couple","lazy","urban"]', '["梧桐街区","建筑","散步"]',
  '建议 2–3 小时', '午后',
  0, 0, NULL,
  'https://english.shanghai.gov.cn/cmsres/ab/ab0dbea801aa49ba81e0fdf42c027c35/94cfa06a2f40af3debb4d78bb5d52625.jpg',
  'unverified', NULL, 'draft', 'curated_v03', 1,
  '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'
),
(
  'shanghai-west-bund', '310000', '西岸滨江', '西岸滨江', NULL, NULL, '徐汇区', NULL,
  121.4680, 31.1800, 'nature', 'A', 82,
  '江边步道、公共空间和艺术场馆可以自由组合，节奏容易掌控。',
  '滨江艺术空间，适合傍晚放松。',
  '["couple","family","lazy","urban"]', '["滨江","日落","艺术"]',
  '建议 2 小时', '傍晚',
  0, 0, NULL,
  'https://english.shanghai.gov.cn/cmsres/9f/9f1350548e7d4c4992617062e2e71091/3ceeefef556a8052c1cc22518e60cc77.png',
  'unverified', NULL, 'draft', 'curated_v03', 1,
  '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'
),
(
  'shanghai-yuyuan', '310000', '豫园—城隍庙', '豫园', NULL, NULL, '黄浦区', NULL,
  121.4920, 31.2270, 'walk_street', 'A', 84,
  '古典园林和老城厢氛围集中，适合与外滩组合成第一次来上海的路线。',
  '老城厢经典，适合与外滩组合。',
  '["fast","family"]', '["老城厢","园林","传统"]',
  '建议 2 小时', '上午或亮灯后',
  0, 0, NULL,
  'https://english.shanghai.gov.cn/cmsres/f2/f2ae04fa18ba4a28bc8ca4d1c04569b4/3a1b2b57069a56e7c57f2124a7e3c284.jpg',
  'unverified', NULL, 'draft', 'curated_v03', 1,
  '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'
),
(
  'shanghai-taikoo-li', '310000', '前滩太古里', '前滩太古里', NULL, NULL, '浦东新区', NULL,
  121.4695, 31.1547, 'mall', 'B', 78,
  '商业、餐饮和户外空间集中，适合不想频繁换乘的轻松半天。',
  '轻松半日，室内外结合。',
  '["couple","lazy","urban"]', '["商场","餐饮","轻松"]',
  '建议 2–4 小时', '下午至晚间',
  1, 0, NULL,
  'https://www.swireproperties.com/-/media/images/swireproperties/portfolio/current-developments/taikoo-li-qiantan/content/abstract-list/tlq_729x410px_detail-page1.ashx?as=0&bc=white&db=web&hash=8A24521181F2BA509D5EC2BF6E989970&iar=0&mh=936&mw=1464&vs=1',
  'unverified', NULL, 'draft', 'curated_v03', 1,
  '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'
),
(
  'shanghai-zhujiajiao', '310000', '朱家角古镇', '朱家角古镇', NULL, NULL, '青浦区', NULL,
  121.0560, 31.1110, 'featured_district', 'A', 80,
  '适合把半天留给一个完整区域，不必在市中心反复赶场。',
  '完整水乡半日，避免市中心赶场。',
  '["couple","family","lazy"]', '["古镇","水乡","慢游"]',
  '建议半天', '上午',
  0, 0, NULL,
  'https://www.shqp.gov.cn/shqp/shqp/upload/202409/0914_101004_338.jpg',
  'unverified', NULL, 'draft', 'curated_v03', 1,
  '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'
),
(
  'shanghai-chenshan', '310000', '辰山植物园', '上海辰山植物园', NULL, NULL, '松江区', NULL,
  121.1830, 31.0780, 'nature', 'B', 76,
  '面积大、停留时间长，更适合当作当天主目的地，而不是普通顺路 POI。',
  '植物园主目的地，适合亲子半天。',
  '["couple","family","lazy"]', '["植物园","户外","亲子"]',
  '建议半天', '上午',
  0, 0, NULL,
  'https://english.shanghai.gov.cn/cmsres/b9/b9a5627b9a7a4b0bb9345f56af4aa456/885b5bb8a62d7ea3d77aa8874cec8e88.png',
  'unverified', NULL, 'draft', 'curated_v03', 1,
  '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'
),
(
  'shanghai-lujiazui-center', '310000', '陆家嘴中心商圈', '陆家嘴中心L+MALL', NULL, NULL, '浦东新区', NULL,
  121.5010, 31.2390, 'mall', 'B', 79,
  '商场、城市景观和滨江距离近，雨天也能灵活调整室内外比例。',
  '商圈+滨江，雨天友好。',
  '["fast","lazy","urban"]', '["商圈","室内","夜景"]',
  '建议 2–3 小时', '下午至晚间',
  1, 0, NULL,
  'https://www.shanghai.gov.cn/cmsres/8c/8c8b639465f94104add25321c4dc1b79/6b9c42769086ae000952d599e3a8481f.jpg',
  'unverified', NULL, 'draft', 'curated_v03', 1,
  '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'
);

-- ── 3) 为新 spot 写入官方图来源记录（仅供内部维护，不暴露给前端） ──
INSERT OR IGNORE INTO spot_sources (id, spot_id, title, url, source_name, checked_at, created_at) VALUES
('v03-source-shanghai-wukang', 'shanghai-wukang', '上海市政府英文网', 'https://english.shanghai.gov.cn/en-ScenicSpots/20231218/596192f5f59048bbbc3fa54d92304e93.html', '上海市政府英文网', NULL, '2026-07-27T00:00:00.000Z'),
('v03-source-shanghai-west-bund', 'shanghai-west-bund', '上海文旅官方', 'https://english.shanghai.gov.cn/en-ShoppingCenters/20241025/7c1d74e65c20417f870ab55ceccd5ae7.html', '上海文旅官方', NULL, '2026-07-27T00:00:00.000Z'),
('v03-source-shanghai-yuyuan', 'shanghai-yuyuan', '上海黄浦文旅', 'https://english.shanghai.gov.cn/en-ScenicSpots/20231205/dc76893b94c248d195eaf7f4d44c6597.html', '上海黄浦文旅', NULL, '2026-07-27T00:00:00.000Z'),
('v03-source-shanghai-taikoo-li', 'shanghai-taikoo-li', '太古地产', 'https://www.swireproperties.com/en/portfolio/current-developments/taikoo-li-qiantan/', '太古地产', NULL, '2026-07-27T00:00:00.000Z'),
('v03-source-shanghai-zhujiajiao', 'shanghai-zhujiajiao', '上海市青浦区政府', 'https://www.shqp.gov.cn/shqp/tpxw/20240914/1210041.html', '上海市青浦区政府', NULL, '2026-07-27T00:00:00.000Z'),
('v03-source-shanghai-chenshan', 'shanghai-chenshan', '上海辰山植物园', 'https://english.shanghai.gov.cn/en-Parks/20240322/1964faa2a0e34379b090950cb6bb1857.html', '上海辰山植物园', NULL, '2026-07-27T00:00:00.000Z'),
('v03-source-shanghai-lujiazui-center', 'shanghai-lujiazui-center', '上海市政府官网', 'https://www.shanghai.gov.cn/nw4411/20251202/4eab378222004d43acdfc9390078f90d.html', '上海市政府官网', NULL, '2026-07-27T00:00:00.000Z');
