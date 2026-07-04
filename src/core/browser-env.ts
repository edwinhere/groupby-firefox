/**
 * Thin shim that exposes the native Firefox `browser` object under the
 * `webextension-polyfill` import name. This decouples the rest of the codebase
 * from the global and gives tests a single seam to mock.
 *
 * If the `browser` global is unavailable (e.g. running under node in tests),
 * accessing any property throws lazily so misuse surfaces clearly.
 */
declare global {
  // eslint-disable-next-line no-var
  const browser: any;
}

const native: any = typeof browser !== "undefined" ? browser : undefined;

export default native as any;
