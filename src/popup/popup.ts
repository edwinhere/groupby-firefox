import browser from "webextension-polyfill";
import type { Settings } from "../core/types";
import { loadSettings, saveSettings } from "../core/storage";
import { ensureStrategiesRegistered } from "../core/planner";
import { listStrategies } from "../strategies/grouping-strategy";
import { listSortStrategies } from "../strategies/sort-strategy";

/**
 * Popup logic. Talks to the background via runtime messages for actions, and
 * reads/writes settings directly via storage so toggles feel instant.
 */

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

function setStatus(text: string, kind: "info" | "error" = "info") {
  const el = $("status");
  el.textContent = text;
  el.dataset.kind = kind;
}

async function send<T = unknown>(type: string, extra?: Record<string, unknown>): Promise<T> {
  const res = (await browser.runtime.sendMessage({ type, ...extra })) as {
    ok: boolean;
    result?: T;
    error?: string;
  };
  if (!res?.ok) throw new Error(res?.error ?? "unknown error");
  return res.result as T;
}

async function refreshPreview(settings: Settings) {
  // Populate dropdowns from the registries (so new strategies show up here too).
  ensureStrategiesRegistered();
  const stratSelect = $<HTMLSelectElement>("strategy");
  if (stratSelect.options.length === 0) {
    for (const s of listStrategies()) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.label;
      stratSelect.appendChild(opt);
    }
  }
  const sortSelect = $<HTMLSelectElement>("sort-mode");
  if (sortSelect.options.length <= 1) {
    for (const s of listSortStrategies()) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.label;
      sortSelect.appendChild(opt);
    }
  }
  try {
    const preview = await send<{ groups: number; tabs: number; summary: string }>(
      "preview-active"
    );
    $("summary").textContent = preview.summary;
  } catch {
    $("summary").textContent = "";
  }
  // Reflect settings into the UI.
  $<HTMLSelectElement>("strategy").value = settings.activeStrategyId;
  $<HTMLInputElement>("auto-group").checked = settings.autoGroup;
  $<HTMLInputElement>("include-pinned").checked = settings.includePinned;
  $<HTMLInputElement>("ungroup-before").checked = settings.ungroupBeforeApply;
  $<HTMLSelectElement>("sort-mode").value = settings.sortMode;
  $<HTMLInputElement>("trigram-threshold").valueAsNumber = settings.trigramThreshold;
  $<HTMLSelectElement>("normalization").value = settings.normalizationMode;
}

async function persist(patch: Partial<Settings>) {
  const current = await loadSettings();
  const next: Settings = { ...current, ...patch, schemaVersion: current.schemaVersion };
  await saveSettings(next);
  // Notify background to rebuild listeners.
  await send("update-settings");
  await refreshPreview(next);
}

window.addEventListener("DOMContentLoaded", async () => {
  $("open-options").addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });

  $("group-now").addEventListener("click", async () => {
    setStatus("Grouping…");
    try {
      await send("group-active");
      setStatus("Done.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err), "error");
    }
    await refreshPreview(await loadSettings());
  });

  $("ungroup-all").addEventListener("click", async () => {
    setStatus("Ungrouping…");
    try {
      const res = await send<{ removed: number }>("ungroup-active");
      setStatus(`Removed ${res.removed} tab${res.removed === 1 ? "" : "s"} from groups.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err), "error");
    }
    await refreshPreview(await loadSettings());
  });

  $("auto-group").addEventListener("change", (e) => {
    void persist({ autoGroup: (e.target as HTMLInputElement).checked });
  });
  $("include-pinned").addEventListener("change", (e) => {
    void persist({ includePinned: (e.target as HTMLInputElement).checked });
  });
  $("ungroup-before").addEventListener("change", (e) => {
    void persist({ ungroupBeforeApply: (e.target as HTMLInputElement).checked });
  });
  $("strategy").addEventListener("change", (e) => {
    void persist({
      activeStrategyId: (e.target as HTMLSelectElement).value,
    });
  });
  $("trigram-threshold").addEventListener("change", (e) => {
    const n = (e.target as HTMLInputElement).valueAsNumber;
    void persist({ trigramThreshold: Number.isFinite(n) ? n : 0.4 });
  });
  $("sort-mode").addEventListener("change", (e) => {
    void persist({
      sortMode: (e.target as HTMLSelectElement).value as Settings["sortMode"],
    });
  });
  $("normalization").addEventListener("change", (e) => {
    void persist({
      normalizationMode: (e.target as HTMLSelectElement)
        .value as Settings["normalizationMode"],
    });
  });

  try {
    const settings = await loadSettings();
    await refreshPreview(settings);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  }
});
