/**
 * Ambient declaration so source modules can `import browser from
 * "webextension-polyfill"`. At bundle time build.mjs resolves this import to
 * src/core/browser-env.ts; this declaration only satisfies tsc.
 */
declare module "webextension-polyfill" {
  const browser: any;
  export default browser;
}
