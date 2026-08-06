-- 前 4 个首页画像改用客户端内置打包图：清空 image_url，前端在为空时回退到
-- assets/homepage 里的 PNG。urban 没有本地图，保留其 Unsplash 地址。
-- 只清空 0005 最初灌入的那 4 个 Unsplash 默认地址；后台之后自定义过的图片不动。
UPDATE home_persona_cards
SET image_url = NULL,
    updated_at = '2026-08-05T00:00:00.000Z'
WHERE id = 'fast'   AND image_url = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=300&q=70&auto=format&fit=crop';
UPDATE home_persona_cards
SET image_url = NULL,
    updated_at = '2026-08-05T00:00:00.000Z'
WHERE id = 'couple' AND image_url = 'https://images.unsplash.com/photo-1474181487882-5abf3f0ba6c2?w=300&q=70&auto=format&fit=crop';
UPDATE home_persona_cards
SET image_url = NULL,
    updated_at = '2026-08-05T00:00:00.000Z'
WHERE id = 'family' AND image_url = 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=300&q=70&auto=format&fit=crop';
UPDATE home_persona_cards
SET image_url = NULL,
    updated_at = '2026-08-05T00:00:00.000Z'
WHERE id = 'lazy'   AND image_url = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=300&q=70&auto=format&fit=crop';
