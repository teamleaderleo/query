import { describe, expect, it, vi } from 'vitest'
import { asyncThrottle } from '../asyncThrottle'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('asyncThrottle coalesced acknowledgement', () => {
  it('settles coalesced callers after the latest arguments execute', async () => {
    const firstStarted = deferred<void>()
    const releaseFirst = deferred<void>()
    const executions: Array<number> = []
    const throttled = asyncThrottle(
      async (value: number) => {
        executions.push(value)
        if (value === 1) {
          firstStarted.resolve()
          await releaseFirst.promise
        }
      },
      { interval: 0 },
    )

    const first = throttled(1)
    await firstStarted.promise

    const scheduled = throttled(2)
    const coalesced = throttled(3)
    expect(coalesced).toBe(scheduled)

    const onScheduled = vi.fn()
    const onCoalesced = vi.fn()
    void scheduled.then(onScheduled)
    void coalesced.then(onCoalesced)
    await Promise.resolve()

    expect(onScheduled).not.toHaveBeenCalled()
    expect(onCoalesced).not.toHaveBeenCalled()
    expect(executions).toEqual([1])

    releaseFirst.resolve()
    await Promise.all([first, scheduled, coalesced])

    expect(executions).toEqual([1, 3])
    expect(onScheduled).toHaveBeenCalledTimes(1)
    expect(onCoalesced).toHaveBeenCalledTimes(1)
  })

  it('keeps a later execution generation independent', async () => {
    const firstStarted = deferred<void>()
    const secondStarted = deferred<void>()
    const releaseFirst = deferred<void>()
    const releaseSecond = deferred<void>()
    const executions: Array<number> = []
    const throttled = asyncThrottle(
      async (value: number) => {
        executions.push(value)
        if (value === 1) {
          firstStarted.resolve()
          await releaseFirst.promise
        }
        if (value === 2) {
          secondStarted.resolve()
          await releaseSecond.promise
        }
      },
      { interval: 0 },
    )

    const first = throttled(1)
    await firstStarted.promise

    const second = throttled(2)
    releaseFirst.resolve()
    await secondStarted.promise

    const third = throttled(3)
    const fourth = throttled(4)
    expect(fourth).toBe(third)
    expect(third).not.toBe(second)

    const onLaterGeneration = vi.fn()
    void third.then(onLaterGeneration)
    await Promise.resolve()
    expect(onLaterGeneration).not.toHaveBeenCalled()

    releaseSecond.resolve()
    await Promise.all([first, second, third, fourth])

    expect(executions).toEqual([1, 2, 4])
    expect(onLaterGeneration).toHaveBeenCalledTimes(1)
  })
})
