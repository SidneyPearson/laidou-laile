-- Public cards and today plans require district and duration metadata.
UPDATE spots
SET district = '黄浦区',
    suggested_duration = '建议 1–2 小时',
    best_time = COALESCE(best_time, '白天至夜间'),
    updated_at = '2026-08-13T00:00:00.000Z'
WHERE id = 'shanghai-the-bund';

UPDATE spots
SET district = '浦东新区',
    suggested_duration = '建议一整天',
    best_time = COALESCE(best_time, '开园前抵达'),
    updated_at = '2026-08-13T00:00:00.000Z'
WHERE id = 'shanghai-disneyland';

UPDATE spots
SET district = '浦东新区',
    suggested_duration = '建议 2–3 小时',
    best_time = COALESCE(best_time, '傍晚至夜间'),
    updated_at = '2026-08-13T00:00:00.000Z'
WHERE id = 'shanghai-oriental-pearl';

UPDATE spots
SET district = '黄浦区',
    suggested_duration = '建议 1–2 小时',
    best_time = COALESCE(best_time, '下午至夜间'),
    updated_at = '2026-08-13T00:00:00.000Z'
WHERE id = 'shanghai-nanjing-road';
