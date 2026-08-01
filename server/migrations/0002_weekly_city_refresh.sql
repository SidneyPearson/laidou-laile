ALTER TABLE cities ADD COLUMN review_interval_days INTEGER NOT NULL DEFAULT 7
  CHECK (review_interval_days IN (7, 14, 30));
ALTER TABLE cities ADD COLUMN last_content_review_at TEXT;
ALTER TABLE cities ADD COLUMN last_refresh_run_id TEXT;

CREATE TABLE IF NOT EXISTS city_refresh_runs (
  id TEXT PRIMARY KEY,
  city_adcode TEXT NOT NULL REFERENCES cities(adcode),
  status TEXT NOT NULL CHECK (status IN (
    'draft', 'prompt_generated', 'result_imported', 'reviewing',
    'completed', 'cancelled', 'failed'
  )),
  schema_version TEXT NOT NULL,
  prompt_text TEXT,
  raw_result_json TEXT,
  import_summary_json TEXT,
  started_at TEXT NOT NULL,
  prompt_generated_at TEXT,
  result_imported_at TEXT,
  completed_at TEXT,
  completed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS city_refresh_candidates (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES city_refresh_runs(id) ON DELETE CASCADE,
  candidate_type TEXT NOT NULL CHECK (candidate_type IN (
    'new_spot', 'existing_update', 'tier_change', 'category_change',
    'rename', 'possible_closed', 'possible_duplicate', 'no_material_change'
  )),
  target_spot_id TEXT REFERENCES spots(id),
  proposed_name TEXT,
  proposed_search_name TEXT,
  proposed_category TEXT CHECK (
    proposed_category IS NULL OR proposed_category IN (
      'classic_landmark', 'featured_district', 'theme_park', 'nature',
      'walk_street', 'mall', 'food', 'museum_culture'
    )
  ),
  proposed_tier TEXT CHECK (
    proposed_tier IS NULL OR proposed_tier IN ('S', 'A', 'B', 'C')
  ),
  proposed_reason TEXT,
  proposed_tier_reason TEXT,
  proposed_data_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  diff_json TEXT,
  amap_verification_status TEXT NOT NULL CHECK (
    amap_verification_status IN ('not_required', 'unverified', 'verified', 'failed')
  ),
  amap_verification_json TEXT,
  system_assessment TEXT NOT NULL CHECK (system_assessment IN (
    'recommended_update', 'needs_amap_verification', 'needs_more_evidence',
    'possible_duplicate', 'high_risk_manual_review', 'no_material_change', 'invalid'
  )),
  system_assessment_reason TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('pending', 'accepted', 'rejected', 'ignored')),
  decision_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_runs_one_active_city
  ON city_refresh_runs(city_adcode)
  WHERE status NOT IN ('completed', 'cancelled', 'failed');
CREATE INDEX IF NOT EXISTS idx_refresh_runs_city ON city_refresh_runs(city_adcode);
CREATE INDEX IF NOT EXISTS idx_refresh_runs_status ON city_refresh_runs(status);
CREATE INDEX IF NOT EXISTS idx_refresh_candidates_run ON city_refresh_candidates(run_id);
CREATE INDEX IF NOT EXISTS idx_refresh_candidates_target ON city_refresh_candidates(target_spot_id);
CREATE INDEX IF NOT EXISTS idx_refresh_candidates_type ON city_refresh_candidates(candidate_type);
CREATE INDEX IF NOT EXISTS idx_refresh_candidates_assessment ON city_refresh_candidates(system_assessment);
CREATE INDEX IF NOT EXISTS idx_refresh_candidates_decision ON city_refresh_candidates(decision);
