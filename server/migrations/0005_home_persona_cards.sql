-- 首页画像卡片配置
-- 画像 id 是服务端推荐筛选的稳定契约（见 exploreRoutes.schemas 的 personaSchema），
-- 只能编辑文案/图片/排序/启用状态，不能新增或删除 id。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS home_persona_cards (
  id TEXT PRIMARY KEY CHECK (id IN ('fast','couple','family','lazy','urban')),
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_home_persona_cards_enabled_sort
  ON home_persona_cards(enabled, sort_order);

-- 默认 5 行，幂等灌入。前 4 个首页展示，urban（都市丽人）默认停用。
-- image_url 为 NULL 表示使用客户端内置打包图（把 JPG 放进 assets/homepage
-- 重新发布或用后台 dev 上传即可替换）；5 个画像都有本地打包图。
INSERT INTO home_persona_cards (id, title, subtitle, image_url, sort_order, enabled, created_at, updated_at) VALUES
('fast',   '特种兵式', '高效 · 打卡 · 省时',     NULL, 10, 1, '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z'),
('couple', '情侣约会', '浪漫 · 夜景 · 出片',     NULL, 20, 1, '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z'),
('family', '亲子玩乐', '互动 · 成长 · 有趣',     NULL, 30, 1, '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z'),
('lazy',   '懒人躺平', '放松 · 慢游 · 舒适',     NULL, 40, 1, '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z'),
('urban',  '都市丽人', '街区 · 展览 · 精致',     NULL, 50, 0, '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  subtitle = excluded.subtitle,
  image_url = excluded.image_url,
  sort_order = excluded.sort_order,
  enabled = excluded.enabled,
  updated_at = '2026-08-05T00:00:00.000Z';
