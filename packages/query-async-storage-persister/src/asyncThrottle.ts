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
  let currentExecution: Promise<void> | undefined
  let scheduledExecution:
    | {
        args: TArgs
        promise: Promise<void>
      }
    | undefined

  return (...args: TArgs) => {
    if (scheduledExecution) {
      scheduledExecution.args = args
      return scheduledExecution.promise
    }

    let resolveScheduled!: () => void
    let rejectScheduled!: (error: unknown) => void
    const promise = new Promise<void>((resolve, reject) => {
      resolveScheduled = resolve
      rejectScheduled = reject
    })
    const execution = { args, promise }
    scheduledExecution = execution

    void (async () => {
      if (currentExecution) {
        await currentExecution
      }
      while (Date.now() < nextExecutionTime) {
        await new Promise((done) =>
          timeoutManager.setTimeout(done, nextExecutionTime - Date.now()),
        )
      }

      if (scheduledExecution === execution) {
        scheduledExecution = undefined
      }

      let finishExecution!: () => void
      currentExecution = new Promise<void>((resolve) => {
        finishExecution = resolve
      })
      try {
        await func(...execution.args)
      } catch (error) {
        try {
          onError(error)
        } catch {}
      } finally {
        nextExecutionTime = Date.now() + interval
        currentExecution = undefined
        finishExecution()
      }
    })().then(resolveScheduled, rejectScheduled)

    return promise
  }
}
