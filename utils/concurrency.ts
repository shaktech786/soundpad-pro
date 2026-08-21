// Generic bounded-concurrency worker pool. Used to parallelize the startup
// sound preload so it doesn't load hundreds of pads one at a time, while
// still capping how many file reads/decodes run at once.

/**
 * Run `worker` over every item in `items`, with at most `limit` invocations
 * in flight at once. Items are started in array order; a finished slot
 * immediately picks up the next pending item (not batched in fixed chunks).
 *
 * If `worker` rejects for an item, that rejection propagates out of the
 * returned promise (same as `Promise.all`). Callers that want to keep
 * processing remaining items after an individual failure must catch inside
 * `worker` itself.
 */
export async function runWithConcurrencyLimit<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  limit: number
): Promise<void> {
  if (items.length === 0) return

  const effectiveLimit = Math.max(1, Math.min(limit, items.length))
  let nextIndex = 0

  const runNext = async (): Promise<void> => {
    const index = nextIndex++
    if (index >= items.length) return
    await worker(items[index], index)
    await runNext()
  }

  await Promise.all(Array.from({ length: effectiveLimit }, () => runNext()))
}
