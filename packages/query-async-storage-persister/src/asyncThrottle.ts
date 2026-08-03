import { timeoutManager } from '@tanstack/query-core'
import { noop } from './utils'

interface AsyncThrottleOptions {
  interval?: number
  onError?: (error: unknown) => void
}

export function asyncThrottle<TArgs extends ReadonlyArray<unknown>>(
  func: (...args: TArgs) => Promise<void>,
  { interval = 1000, onError = noop }: AsyncThrottleOptions = {},
) {
  if (typeof func !== 'function') throw new Error('argument is not function.')

  let nextExecutionTime = 0
  let lastArgs = null
  let isExecuting = false
  let scheduledPromise: Promise<void> | undefined

  return (...args: TArgs) => {
    lastArgs = args
    if (scheduledPromise) return scheduledPromise

    let resolveScheduled!: () => void
    let rejectScheduled!: (error: unknown) => void
    const promise = new Promise<void>((resolve, reject) => {
      resolveScheduled = resolve
      rejectScheduled = reject
    })
    scheduledPromise = promise

    void (async () => {
      while (isExecuting) {
        await new Promise((done) => timeoutManager.setTimeout(done, interval))
      }
      while (Date.now() < nextExecutionTime) {
        await new Promise((done) =>
          timeoutManager.setTimeout(done, nextExecutionTime - Date.now()),
        )
      }
      scheduledPromise = undefined
      isExecuting = true
      try {
        await func(...lastArgs)
      } catch (error) {
        try {
          onError(error)
        } catch {}
      }
      nextExecutionTime = Date.now() + interval
      isExecuting = false
    })().then(resolveScheduled, rejectScheduled)

    return promise
  }
}
