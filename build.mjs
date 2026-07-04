import { build, context } from "esbuild";
import { copyFileSync, mkdirSync, rmSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "dist");

const watch = process.argv.includes("--watch");

// Clean output.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const ENTRY_POINTS = [
  join(SRC, "background", "main.ts"),
  join(SRC, "popup", "popup.ts"),
  join(SRC, "options", "options.ts"),
];

const baseConfig = {
  bundle: true,
  format: "iife",
  target: "firefox138",
  platform: "browser",
  logLevel: "info",
  sourcemap: "linked",
  outbase: SRC,
  outdir: OUT,
  entryPoints: ENTRY_POINTS,
  // Source imports `browser` from "webextension-polyfill"; at bundle time we
  // resolve that to a tiny shim that returns the native Firefox `browser`
  // object. This keeps the rest of the code decoupled from the global.
  alias: {
    "webextension-polyfill": join(SRC, "core", "browser-env.ts"),
  },
};

async function copyStatic() {
  // manifest.json
  copyFileSync(join(ROOT, "manifest.json"), join(OUT, "manifest.json"));
  // icons/
  const iconsSrc = join(ROOT, "icons");
  const iconsDst = join(OUT, "icons");
  if (existsSync(iconsSrc)) {
    mkdirSync(iconsDst, { recursive: true });
    for (const file of readdirSync(iconsSrc)) {
      if (file.endsWith(".png")) {
        copyFileSync(join(iconsSrc, file), join(iconsDst, file));
      }
    }
  }
  // popup HTML + options HTML live next to their TS entry, but we ship them
  // flat at dist root for clarity.
  for (const dir of ["popup", "options"]) {
    const html = join(SRC, dir, `${dir}.html`);
    if (existsSync(html)) {
      const outDir = join(OUT, dir);
      mkdirSync(outDir, { recursive: true });
      copyFileSync(html, join(outDir, `${dir}.html`));
    }
  }
  // CSS
  const styles = join(SRC, "shared", "styles.css");
  if (existsSync(styles)) {
    const sharedDir = join(OUT, "shared");
    mkdirSync(sharedDir, { recursive: true });
    copyFileSync(styles, join(sharedDir, "styles.css"));
  }
}

if (watch) {
  const ctx = await context(baseConfig);
  await ctx.watch();
  await copyStatic();
  console.log("[watch] built once, watching...");
} else {
  await build(baseConfig);
  await copyStatic();
  console.log("[build] done. Load dist/ via about:debugging.");
}
