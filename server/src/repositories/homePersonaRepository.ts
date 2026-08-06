/** Homepage persona card — a fixed set (ids are the stable Persona contract).
 *  Editors may only change copy/image/order/enabled, never add or remove ids. */
export interface HomePersonaRecord {
  id: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  sortOrder: number
  enabled: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export interface HomePersonaUpdate {
  title?: string
  subtitle?: string | null
  imageUrl?: string | null
  sortOrder?: number
  enabled?: boolean
}

export interface HomePersonaRepository {
  /** All cards (including disabled), ordered for the admin list. */
  list(): Promise<HomePersonaRecord[]>
  /** Only enabled cards, ordered by sort_order for the public homepage. */
  listPublished(): Promise<HomePersonaRecord[]>
  get(id: string): Promise<HomePersonaRecord | null>
  update(
    id: string,
    expectedVersion: number,
    input: HomePersonaUpdate,
    now: string,
  ): Promise<'conflict' | HomePersonaRecord | null>
  audit(action: string, entityType: string, entityId: string, payload: unknown, now: string): Promise<void>
}
