/**
 * Trailing-edge debounce. Returns a function that, when invoked, schedules the
 * wrapped callback to run after `wait` ms of quiet. The pending call can be
 * cancelled or flushed immediately.
 */
export interface Debounced<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;
  cancel(): void;
  flush(): void;
}

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  wait: number
): Debounced<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const wrapped = ((...args: Parameters<T>) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const a = lastArgs;
      lastArgs = null;
      if (a) fn(...a);
    }, wait);
  }) as Debounced<T>;

  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      lastArgs = null;
    }
  };

  wrapped.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      const a = lastArgs;
      lastArgs = null;
      if (a) fn(...a);
    }
  };

  return wrapped;
}
