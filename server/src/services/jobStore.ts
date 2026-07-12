import type { Route } from '../types/route.js'

export interface JobResult {
  routes: Route[]
  generatedAt: string
  weatherNote: string | null
  weather: { weather: string; temperature: string; isRainy: boolean } | null
  locationName: string
  source: string
  fallbackReason: string | null
}

export interface JobData {
  id: string
  status: 'processing' | 'done' | 'error'
  result?: JobResult
  error?: { code: string; message: string }
  createdAt: number
}

const PROCESSING_TTL = 5 * 60 // 5 minutes for processing jobs
const DONE_TTL = 2 * 60       // 2 minutes for done/error jobs

let kv: KVNamespace | null = null

export function initJobStore(namespace: KVNamespace): void {
  kv = namespace
}

function key(id: string): string {
  return `job:${id}`
}

export async function createJob(): Promise<string> {
  if (!kv) throw new Error('JobStore not initialized')
  const id = crypto.randomUUID()
  const job: JobData = { id, status: 'processing', createdAt: Date.now() }
  await kv.put(key(id), JSON.stringify(job), { expirationTtl: PROCESSING_TTL })
  return id
}

export async function completeJob(id: string, result: JobResult): Promise<void> {
  if (!kv) throw new Error('JobStore not initialized')
  const raw = await kv.get(key(id))
  if (!raw) return
  const job: JobData = JSON.parse(raw)
  job.status = 'done'
  job.result = result
  await kv.put(key(id), JSON.stringify(job), { expirationTtl: DONE_TTL })
}

export async function failJob(id: string, error: { code: string; message: string }): Promise<void> {
  if (!kv) throw new Error('JobStore not initialized')
  const raw = await kv.get(key(id))
  if (!raw) return
  const job: JobData = JSON.parse(raw)
  job.status = 'error'
  job.error = error
  await kv.put(key(id), JSON.stringify(job), { expirationTtl: DONE_TTL })
}

export async function getJob(id: string): Promise<JobData | undefined> {
  if (!kv) throw new Error('JobStore not initialized')
  const raw = await kv.get(key(id))
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as JobData
  } catch {
    return undefined
  }
}
