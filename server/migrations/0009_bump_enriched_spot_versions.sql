-- Invalidate stale admin editor versions after the public metadata backfill.
UPDATE spots
SET version = version + 1,
    updated_at = '2026-08-13T00:00:00.000Z'
WHERE id IN (
  'shanghai-the-bund',
  'shanghai-disneyland',
  'shanghai-oriental-pearl',
  'shanghai-nanjing-road'
);
