/**
 * Runs at most one `task` at a time. A call made while one is running doesn't reuse
 * that run's result (it may have started before the caller's write); it gets the
 * result of exactly one extra run queued after it. Concurrent callers share that run.
 */
export function singleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null;
  let followUp: Promise<T> | null = null;

  const start = (): Promise<T> => {
    const p = task().finally(() => {
      if (running === p) running = null;
    });
    running = p;
    return p;
  };

  return () => {
    if (!running) return start();
    if (!followUp) {
      followUp = running
        .catch(() => undefined)
        .then(() => {
          followUp = null;
          return start();
        });
    }
    return followUp;
  };
}
