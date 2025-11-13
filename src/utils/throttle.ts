export function throttle<T extends (...args: any[]) => any>(fn: T, wait: number) {
  let last = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: any[] | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    lastArgs = args;
    const run = () => { last = Date.now(); pending = null; fn(...(lastArgs as any[])); };

    if (now - last >= wait) {
      run();
    } else if (!pending) {
      pending = setTimeout(run, wait - (now - last));
    }
  };
}
