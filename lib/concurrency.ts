/**
 * Run an array of async task factories with at most `limit` concurrent
 * executions at any given time.  Results are returned in the same order as
 * the input tasks (analogous to Promise.all, but throttled).
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
