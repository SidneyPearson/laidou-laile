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

export interface Job {
  id: string
  status: 'processing' | 'done' | 'error'
  result?: JobResult
  error?: { code: string; message: string }
  createdAt: number
}

const JOB_TTL_MS = 5 * 60 * 1000 // 5 minutes max lifetime
const DONE_TTL_MS = 2 * 60 * 1000 // done/error jobs expire after 2 minutes

const jobs = new Map<string, Job>()

/** Create a new job and return its ID */
export function createJob(): string {
  const id = crypto.randomUUID()
  jobs.set(id, { id, status: 'processing', createdAt: Date.now() })
  if (jobs.size > 100) gcJobs()
  return id
}

/** Store successful result */
export function completeJob(id: string, result: JobResult): void {
  const job = jobs.get(id)
  if (job) {
    job.status = 'done'
    job.result = result
  }
}

/** Store error */
export function failJob(id: string, error: { code: string; message: string }): void {
  const job = jobs.get(id)
  if (job) {
    job.status = 'error'
    job.error = error
  }
}

/** Get a job by ID. Returns undefined if expired or never existed. */
export function getJob(id: string): Job | undefined {
  const job = jobs.get(id)
  if (!job) return undefined
  // Auto-expire stale jobs
  const age = Date.now() - job.createdAt
  if (age > JOB_TTL_MS) {
    jobs.delete(id)
    return undefined
  }
  if (job.status !== 'processing' && age > DONE_TTL_MS) {
    jobs.delete(id)
    return undefined
  }
  return job
}

/** Remove stale jobs */
function gcJobs(): void {
  const now = Date.now()
  for (const [id, job] of jobs) {
    const age = now - job.createdAt
    if (age > JOB_TTL_MS || (job.status !== 'processing' && age > DONE_TTL_MS)) {
      jobs.delete(id)
    }
  }
}
