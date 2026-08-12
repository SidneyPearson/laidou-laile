# National Popular City Spots Implementation Plan

**Goal:** Create Shanghai-compatible JSON datasets for 12 other popular Chinese cities, rank them by tourism popularity with GDP as a secondary signal, and import the curated records into local D1 without changing production.

**Approach:** Build one exact-format JSON file per city plus a national index, populate 12 representative spots per city, attempt AMap identity enrichment and use distance-checked OpenStreetMap coordinates as a non-verifying fallback, leave images empty, and import cities/spots/sources as locally reviewable draft records. Preserve Shanghai and avoid remote Wrangler commands.

**Affected areas:** `data/city-spots/`, `server/scripts/`, local Cloudflare D1 (`cities`, `spots`, `spot_sources`), and supporting validation/import tests or reports.

**Verification:** Validate every JSON record against the curation enums and required fields, verify unique IDs/adcodes/POI IDs, run a transaction-backed local import, and query local D1 for exact city/spot/source counts and zero published imports.

### Task 1: Fix ranking scope and authoritative references

**Files:**
- Create: `data/city-spots/china-popular-cities.json`

**Interfaces:**
- Consumes: recent tourism popularity evidence, official city GDP releases, official administrative adcodes
- Produces: ordered 12-city manifest with ranking rationale and source links

- [x] Select 12 cities outside Shanghai using tourism popularity as the primary signal and GDP as the tie-breaker.
- [x] Record city/province/adcode/slug, GDP year and value, tourism evidence, and reference URLs.
- [x] Ensure every selected city has a valid six-digit adcode and no duplicate city identity.

### Task 2: Curate Shanghai-compatible city spot JSON

**Files:**
- Create: `data/city-spots/<city-slug>-spots.json` for each selected city

**Interfaces:**
- Consumes: `shanghai-spots.json` field shape, curation categories/tiers, official destination or venue sources
- Produces: 12 spots per city with complete editorial fields and `coverImageUrl: null`

- [x] Choose a balanced set of landmarks, districts, museums, parks, food areas, and family destinations for each city.
- [x] Fill editorial fields, personas, tags, duration, visit timing, reservation guidance, tier, and priority.
- [x] Attach at least one traceable map or official source per spot and official GDP/tourism references in the manifest.
- [x] Keep publication state as `draft` and never copy Shanghai identifiers.

### Task 3: Enrich and validate POI identity

**Files:**
- Create: `server/scripts/enrich-city-spots.mjs`
- Create: `server/scripts/validate-city-spots.mjs`

**Interfaces:**
- Consumes: city JSON files, local `AMAP_WEB_API_KEY`, and OpenStreetMap Nominatim fallback
- Produces: verified AMap identity when available, distance-checked reference coordinates otherwise, and a validation report

- [x] Attempt city-scoped AMap place search without logging the API key; record the quota limitation without promoting incomplete matches.
- [x] Keep all records `unverified` unless a confident AMap match exists; OpenStreetMap fallback coordinates never change verification status.
- [x] Validate enums, required fields, booleans, arrays, coordinates, city distance, timestamps, and identifier uniqueness.
- [x] Report all 28 unresolved coordinate records explicitly before import.

### Task 4: Generate a safe local D1 import

**Files:**
- Create: `server/scripts/build-local-city-import.mjs`
- Generate: `server/generated/local-popular-city-spots.sql`

**Interfaces:**
- Consumes: validated city manifest and spot JSON files
- Produces: idempotent SQL for `cities`, `spots`, and `spot_sources`

- [x] Upsert the 12 city records without modifying Shanghai.
- [x] Use non-destructive primary-key upserts; preserve pre-existing records that are not part of the 144-record catalog.
- [x] Preserve `draft` publication status for every imported spot and set city status to `draft`.
- [x] Wrap all upserts in a transaction.

### Task 5: Import and verify local D1 only

**Files:**
- Modify: local Miniflare D1 state only

**Interfaces:**
- Consumes: generated SQL
- Produces: locally browsable admin data

- [x] Back up the local D1 database before importing.
- [x] Run Wrangler with `--local` and never use `--remote`.
- [x] Confirm all 144 catalog spots were upserted; local total is 145 because the pre-existing Hangzhou 雷峰塔 record was safely retained, and all 145 remain draft.
- [x] Confirm Shanghai remains 21 spots, all 21 published and verified.
- [x] Report JSON paths, ranking order, validation exceptions, and local D1 counts.
