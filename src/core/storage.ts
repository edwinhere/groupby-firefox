import browser from "webextension-polyfill";
import { DEFAULT_SETTINGS, type Settings } from "./types";

const STORAGE_KEY = "groupby.settings";

/**
 * Apply forward-compatible migrations to a raw loaded object. Today only
 * schemaVersion 1 exists, but this is the single place future versions will be
 * upgraded into the current shape.
 */
export function migrateSettings(raw: unknown): Settings {
  const base = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<Settings>;
  // Merge defensively: only known keys override defaults.
  for (const key of Object.keys(base) as (keyof Settings)[]) {
    if (key in r && r[key] !== undefined) {
      (base as any)[key] = r[key];
    }
  }
  // Re-pin schemaVersion to the code's current version.
  base.schemaVersion = DEFAULT_SETTINGS.schemaVersion;
  return base;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    const raw = result?.[STORAGE_KEY];
    return migrateSettings(raw);
  } catch (err) {
    console.error("[groupby] loadSettings failed, using defaults:", err);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
}

export { STORAGE_KEY };
