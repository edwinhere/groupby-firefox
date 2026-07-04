/** Tiny structured logger; routed through console but easy to silence. */
export const log = {
  debug(...args: unknown[]) {
    if (LOG_DEBUG) console.debug("[groupby]", ...args);
  },
  info(...args: unknown[]) {
    console.info("[groupby]", ...args);
  },
  warn(...args: unknown[]) {
    console.warn("[groupby]", ...args);
  },
  error(...args: unknown[]) {
    console.error("[groupby]", ...args);
  },
};

const LOG_DEBUG = false;

export function setDebug(_value: boolean) {
  // Reserved for runtime toggling if a debug option is added later.
}
