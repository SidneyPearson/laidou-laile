-- 第 5 个画像 urban（都市丽人/精致）现在也有本地打包图，清空其 Unsplash 地址，
-- 让前端回退到内置图（06-persona-urban.jpg）。只清 0005 最初灌入的默认地址，
-- 后台之后自定义过的图片不动。
UPDATE home_persona_cards
SET image_url = NULL,
    updated_at = '2026-08-05T00:00:00.000Z'
WHERE id = 'urban'
  AND image_url = 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=300&q=70&auto=format&fit=crop';
