/**
 * Run an array of async task factories with at most `limit` concurrent
 * executions at any given time.  Results are returned in the same order as
 * the input tasks (analogous to Promise.all, but throttled).
 *
 * CONTRACT: Every task function MUST NOT throw (i.e. must handle its own
 * errors internally). If a task rejects, the entire batch rejects immediately
 * and the remaining results are discarded — matching the semantics of
 * Promise.all. Callers that need per-task fault tolerance should wrap each
 * task in try/catch before passing it to pLimit.
 */
export async function pLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  let active = 0;

  return new Promise((resolve, reject) => {
    function runNext() {
      if (nextIndex === tasks.length && active === 0) {
        resolve(results);
        return;
      }

      while (active < limit && nextIndex < tasks.length) {
        const index = nextIndex++;
        active++;

        tasks[index]()
          .then((result) => {
            results[index] = result;
            active--;
            runNext();
          })
          .catch((err) => {
            reject(err);
          });
      }
    }

    runNext();
  });
}
