export interface AmapSearchSchedulerOptions {
  batchSize?: number
  pauseMs?: number
}

/** Run small request batches to stay below Amap's free-tier QPS burst limit. */
export async function runAmapSearchTasks<T>(
  tasks: Array<() => Promise<T>>,
  options: AmapSearchSchedulerOptions = {},
): Promise<T[]> {
  const batchSize = Math.max(1, options.batchSize ?? 1)
  const pauseMs = Math.max(0, options.pauseMs ?? 400)
  const results: T[] = []

  for (let index = 0; index < tasks.length; index += batchSize) {
    if (index > 0 && pauseMs > 0) {
      await new Promise(resolve => setTimeout(resolve, pauseMs))
    }
    results.push(...await Promise.all(tasks.slice(index, index + batchSize).map(task => task())))
  }

  return results
}
