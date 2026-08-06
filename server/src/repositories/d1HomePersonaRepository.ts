import { sanitizeAuditPayload } from '../domain/curation.js'
import type {
  HomePersonaRecord,
  HomePersonaRepository,
  HomePersonaUpdate,
} from './homePersonaRepository.js'

function map(row: any): HomePersonaRecord {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? null,
    imageUrl: row.image_url ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    enabled: row.enabled === 1,
    version: Number(row.version ?? 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class D1HomePersonaRepository implements HomePersonaRepository {
  constructor(private readonly db: D1Database) {}

  async list(): Promise<HomePersonaRecord[]> {
    const result = await this.db
      .prepare('SELECT * FROM home_persona_cards ORDER BY sort_order ASC, title ASC')
      .all<Record<string, unknown>>()
    return result.results.map(map)
  }

  async listPublished(): Promise<HomePersonaRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM home_persona_cards WHERE enabled = 1 ORDER BY sort_order ASC, title ASC")
      .all<Record<string, unknown>>()
    return result.results.map(map)
  }

  async get(id: string): Promise<HomePersonaRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM home_persona_cards WHERE id = ?')
      .bind(id)
      .first<Record<string, unknown>>()
    return row ? map(row) : null
  }

  async update(
    id: string,
    expectedVersion: number,
    input: HomePersonaUpdate,
    now: string,
  ): Promise<'conflict' | HomePersonaRecord | null> {
    const current = await this.get(id)
    if (!current) return null

    const next = {
      title: input.title ?? current.title,
      subtitle: input.subtitle === undefined ? current.subtitle : input.subtitle,
      imageUrl: input.imageUrl === undefined ? current.imageUrl : input.imageUrl,
      sortOrder: input.sortOrder ?? current.sortOrder,
      enabled: input.enabled ?? current.enabled,
    }

    const result = await this.db
      .prepare(
        `UPDATE home_persona_cards
         SET title = ?, subtitle = ?, image_url = ?, sort_order = ?, enabled = ?,
             version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?`,
      )
      .bind(
        next.title,
        next.subtitle,
        next.imageUrl,
        next.sortOrder,
        next.enabled ? 1 : 0,
        now,
        id,
        expectedVersion,
      )
      .run()

    if (!result.meta.changes) {
      // Row exists but version didn't match → conflict; otherwise not found.
      return (await this.get(id)) ? 'conflict' : null
    }
    return this.get(id) as Promise<HomePersonaRecord>
  }

  async audit(
    action: string,
    entityType: string,
    entityId: string,
    payload: unknown,
    now: string,
  ): Promise<void> {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    const auditId = [...bytes].map(v => v.toString(16).padStart(2, '0')).join('')
    await this.db
      .prepare(
        'INSERT INTO admin_audit_logs (id, action, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(auditId, action, entityType, entityId, JSON.stringify(sanitizeAuditPayload(payload)), now)
      .run()
  }
}
