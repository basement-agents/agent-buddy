/**
 * Creates a concurrency limiter (similar to p-limit) that restricts
 * the number of concurrent async operations.
 *
 * No external dependencies required.
 *
 * @param maxConcurrent - Maximum number of promises allowed to run simultaneously
 * @returns A function that wraps an async operation, queuing it if the limit is reached
 */
export function createConcurrencyLimiter(maxConcurrent: number): <T>(fn: () => Promise<T>) => Promise<T> {
  if (maxConcurrent < 1) {
    throw new Error("maxConcurrent must be at least 1");
  }

  let activeCount = 0;
  const queue: Array<() => void> = [];

  function next(): void {
    if (queue.length > 0 && activeCount < maxConcurrent) {
      const resolve = queue.shift();
      if (resolve) resolve();
    }
  }

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = (): void => {
        activeCount++;
        fn().then(
          (result) => {
            activeCount--;
            next();
            resolve(result);
          },
          (error: unknown) => {
            activeCount--;
            next();
            reject(error);
          }
        );
      };

      if (activeCount < maxConcurrent) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}
