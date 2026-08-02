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
    const executions: number[] = []
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
})
