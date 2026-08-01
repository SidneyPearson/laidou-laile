import { describe, expect, it, vi } from 'vitest'

import { runAmapSearchTasks } from './amapSearchScheduler.js'

describe('runAmapSearchTasks', () => {
  it('caps concurrent Amap requests at the free-tier-safe batch size', async () => {
    let active = 0
    let maximum = 0
    const tasks = Array.from({ length: 7 }, (_, index) => async () => {
      active += 1
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      active -= 1
      return [index]
    })

    const results = await runAmapSearchTasks(tasks, { batchSize: 2, pauseMs: 0 })

    expect(maximum).toBeLessThanOrEqual(2)
    expect(results).toEqual([[0], [1], [2], [3], [4], [5], [6]])
  })

  it('pauses between batches instead of firing every search at once', async () => {
    vi.useFakeTimers()
    const calls: number[] = []
    const pending = runAmapSearchTasks(
      Array.from({ length: 3 }, (_, index) => async () => {
        calls.push(index)
        return [index]
      }),
      { batchSize: 2, pauseMs: 400 },
    )

    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toEqual([0, 1])
    await vi.advanceTimersByTimeAsync(400)
    await expect(pending).resolves.toHaveLength(3)
    expect(calls).toEqual([0, 1, 2])
    vi.useRealTimers()
  })
})
