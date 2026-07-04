import browser from "webextension-polyfill";
import { loadSettings, saveSettings } from "../core/storage";
import { DEFAULT_SETTINGS, type Settings } from "../core/types";
import { ensureStrategiesRegistered } from "../core/planner";
import { listStrategies } from "../strategies/grouping-strategy";
import { createController, type GroupingController } from "./events";
import { log } from "../util/log";

/**
 * Background entry point. Runs as a Firefox MV3 event page
 * (manifest `background.scripts`). Owns one GroupingController and wires the
 * runtime messaging used by the popup and options page.
 */

let controller: GroupingController | null = null;
let currentSettings: Settings = DEFAULT_SETTINGS;

async function bootstrap(): Promise<void> {
  ensureStrategiesRegistered();
  currentSettings = await loadSettings();
  controller = createController();
  controller.attach(currentSettings);
  log.info("background ready; active strategy =", currentSettings.activeStrategyId);
}

void bootstrap();

/** Runtime messaging: UI pages send commands, background performs them. */
browser.runtime.onMessage.addListener((message: unknown) => {
  if (!message || typeof message !== "object") return;
  const msg = message as { type?: string; windowId?: number };

  switch (msg.type) {
    case "group-active": {
      return handle(() => controller!.runForActiveWindow({ force: true }));
    }
    case "group-window": {
      return handle(async () => {
        if (typeof msg.windowId === "number") {
          await controller!.runForWindow(msg.windowId, { force: true });
        }
      });
    }
    case "ungroup-active": {
      return handle(async () => {
        const removed = await controller!.ungroupActiveWindow();
        return { removed };
      });
    }
    case "ungroup-window": {
      return handle(async () => {
        if (typeof msg.windowId !== "number") return { removed: 0 };
        const removed = await controller!.ungroupWindow(msg.windowId);
        return { removed };
      });
    }
    case "sort-active": {
      return handle(async () => {
        const moved = await controller!.sortActiveWindow();
        return { moved };
      });
    }
    case "preview-active": {
      return handle(async () => {
        const wins = await browser.windows.getAll({
          windowTypes: ["normal"],
        });
        const active =
          (wins as any[]).find((w) => w.focused) ?? wins[0];
        if (!active) return { groups: 0, tabs: 0, summary: "no window" };
        return controller!.preview(active.id);
      });
    }
    case "list-strategies": {
      return Promise.resolve(listStrategies().map((s) => ({ id: s.id, label: s.label })));
    }
    case "get-settings": {
      return Promise.resolve(currentSettings);
    }
    case "update-settings": {
      return handle(async () => {
        currentSettings = await loadSettings();
        controller!.attach(currentSettings);
      });
    }
    default: {
      return Promise.resolve({ ok: false, error: "unknown message" });
    }
  }
});

/** Wrap a handler, returning a serializable result/error to the caller. */
async function handle(fn: () => Promise<unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  try {
    const result = await fn();
    return { ok: true, result };
  } catch (err) {
    log.error("message handler error:", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Surface saveSettings for symmetry / future use (e.g. options page writes
// settings directly; the background is notified via "update-settings").
export { saveSettings };
