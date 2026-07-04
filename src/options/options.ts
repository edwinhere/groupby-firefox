import browser from "webextension-polyfill";
import type { Settings } from "../core/types";
import { loadSettings, saveSettings } from "../core/storage";
import { ensureStrategiesRegistered } from "../core/planner";
import { listStrategies } from "../strategies/grouping-strategy";
import { listSortStrategies } from "../strategies/sort-strategy";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function setStatus(text: string, kind: "info" | "error" = "info") {
  const el = $("status");
  el.textContent = text;
  el.dataset.kind = kind;
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

async function loadStrategyOptions(): Promise<void> {
  ensureStrategiesRegistered();
  const select = $("strategy") as HTMLSelectElement;
  select.innerHTML = "";
  for (const s of listStrategies()) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.label;
    select.appendChild(opt);
  }
  // Sort strategies also come from the registry.
  const sortSelect = $("sort-mode") as HTMLSelectElement;
  // Keep the leading "No sorting" option, replace the rest.
  while (sortSelect.options.length > 1) sortSelect.remove(1);
  for (const s of listSortStrategies()) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.label;
    sortSelect.appendChild(opt);
  }
}

function paint(settings: Settings): void {
  ($("strategy") as HTMLSelectElement).value = settings.activeStrategyId;
  ($("normalization") as HTMLSelectElement).value = settings.normalizationMode;
  ($("sort-mode") as HTMLSelectElement).value = settings.sortMode;
  ($("trigram-threshold") as HTMLInputElement).valueAsNumber = settings.trigramThreshold;
  ($("strip-www") as HTMLInputElement).checked = settings.stripWww;
  ($("include-pinned") as HTMLInputElement).checked = settings.includePinned;
  ($("ungroup-before") as HTMLInputElement).checked = settings.ungroupBeforeApply;
  ($("excluded-domains") as HTMLTextAreaElement).value =
    settings.excludedDomains.join("\n");
  ($("excluded-prefixes") as HTMLTextAreaElement).value =
    settings.excludedUrlPrefixes.join("\n");
  ($("color-mode") as HTMLSelectElement).value = settings.colorMode;
  ($("fixed-color") as HTMLSelectElement).value =
    settings.fixedColor ?? "grey";
  ($("fixed-color-row") as HTMLElement).hidden = settings.colorMode !== "fixed";
  ($("collapsed") as HTMLInputElement).checked = settings.groupCollapsedByDefault;
  ($("auto-group") as HTMLInputElement).checked = settings.autoGroup;
  ($("on-create") as HTMLInputElement).checked = settings.groupOnCreate;
  ($("on-updated") as HTMLInputElement).checked = settings.groupOnUpdated;
  ($("on-moved") as HTMLInputElement).checked = settings.groupOnMoved;
  ($("on-focus") as HTMLInputElement).checked = settings.groupOnFocusChange;
  ($("debounce") as HTMLInputElement).valueAsNumber = settings.debounceMs;
}

function collect(): Settings {
  const base = {
    activeStrategyId: ($("strategy") as HTMLSelectElement).value,
    normalizationMode: ($("normalization") as HTMLSelectElement)
      .value as Settings["normalizationMode"],
    sortMode: ($("sort-mode") as HTMLSelectElement).value as Settings["sortMode"],
    trigramThreshold: clamp01(
      ($("trigram-threshold") as HTMLInputElement).valueAsNumber
    ),
    stripWww: ($("strip-www") as HTMLInputElement).checked,
    includePinned: ($("include-pinned") as HTMLInputElement).checked,
    ungroupBeforeApply: ($("ungroup-before") as HTMLInputElement).checked,
    excludedDomains: splitLines(
      ($("excluded-domains") as HTMLTextAreaElement).value
    ),
    excludedUrlPrefixes: splitLines(
      ($("excluded-prefixes") as HTMLTextAreaElement).value
    ),
    colorMode: ($("color-mode") as HTMLSelectElement).value as Settings["colorMode"],
    fixedColor: ($("fixed-color") as HTMLSelectElement).value,
    groupCollapsedByDefault: ($("collapsed") as HTMLInputElement).checked,
    autoGroup: ($("auto-group") as HTMLInputElement).checked,
    groupOnCreate: ($("on-create") as HTMLInputElement).checked,
    groupOnUpdated: ($("on-updated") as HTMLInputElement).checked,
    groupOnMoved: ($("on-moved") as HTMLInputElement).checked,
    groupOnFocusChange: ($("on-focus") as HTMLInputElement).checked,
    debounceMs: Math.max(0, ($("debounce") as HTMLInputElement).valueAsNumber | 0),
  };
  return { ...base, schemaVersion: 1 } as Settings;
}

window.addEventListener("DOMContentLoaded", async () => {
  await loadStrategyOptions();

  ($("color-mode") as HTMLSelectElement).addEventListener("change", (e) => {
    ($("fixed-color-row") as HTMLElement).hidden =
      (e.target as HTMLSelectElement).value !== "fixed";
  });

  $("save").addEventListener("click", async () => {
    try {
      const next = collect();
      await saveSettings(next);
      await browser.runtime.sendMessage({ type: "update-settings" });
      setStatus("Saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err), "error");
    }
  });

  try {
    const settings = await loadSettings();
    paint(settings);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  }
});
