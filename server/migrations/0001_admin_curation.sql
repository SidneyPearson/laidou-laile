PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cities (
  adcode TEXT PRIMARY KEY,
  province_name TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  intro TEXT,
  cover_image_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'disabled')),
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spots (
  id TEXT PRIMARY KEY,
  city_adcode TEXT NOT NULL REFERENCES cities(adcode),
  name TEXT NOT NULL,
  search_name TEXT NOT NULL,
  amap_name TEXT,
  amap_poi_id TEXT,
  district TEXT,
  address TEXT,
  lng REAL,
  lat REAL,
  category TEXT NOT NULL CHECK (category IN ('classic_landmark', 'featured_district', 'theme_park', 'nature', 'walk_street', 'mall', 'food', 'museum_culture')),
  tier TEXT NOT NULL CHECK (tier IN ('S', 'A', 'B', 'C')),
  priority INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  tier_reason TEXT NOT NULL,
  personas_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  suggested_duration TEXT,
  best_time TEXT,
  indoor_friendly INTEGER NOT NULL DEFAULT 0 CHECK (indoor_friendly IN (0, 1)),
  reservation_required INTEGER NOT NULL DEFAULT 0 CHECK (reservation_required IN (0, 1)),
  reservation_note TEXT,
  cover_image_url TEXT,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('unverified', 'verified', 'failed', 'stale')),
  verified_at TEXT,
  publication_status TEXT NOT NULL CHECK (publication_status IN ('draft', 'pending_review', 'published', 'disabled')),
  source_kind TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spot_sources (
  id TEXT PRIMARY KEY,
  spot_id TEXT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT,
  source_name TEXT,
  checked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spots_city_adcode ON spots(city_adcode);
CREATE INDEX IF NOT EXISTS idx_spots_publication_status ON spots(publication_status);
CREATE INDEX IF NOT EXISTS idx_spots_category ON spots(category);
CREATE INDEX IF NOT EXISTS idx_spots_tier ON spots(tier);
CREATE INDEX IF NOT EXISTS idx_spots_priority ON spots(priority DESC);
CREATE INDEX IF NOT EXISTS idx_spots_amap_poi_id ON spots(amap_poi_id);
CREATE INDEX IF NOT EXISTS idx_spots_public_city_tier_priority ON spots(city_adcode, publication_status, verification_status, tier, priority DESC);
CREATE INDEX IF NOT EXISTS idx_spot_sources_spot_id ON spot_sources(spot_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON admin_audit_logs(created_at DESC);
