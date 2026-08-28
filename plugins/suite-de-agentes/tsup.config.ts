import { defineConfig } from "tsup";
import { solidPlugin } from "esbuild-plugin-solid";

export default defineConfig({
  entry: { server: "src/server/index.ts", tui: "src/tui/index.tsx", "core/index": "src/core/index.ts" },
  format: ["esm"], clean: true, dts: false, outDir: "dist", minify: false,
  external: ["@opencode-ai/plugin", "@opencode-ai/plugin/tui", "@opentui/core", "@opentui/keymap", "@opentui/keymap/addons", "@opentui/solid", "solid-js", "node:fs", "node:path", "node:os", "node:crypto"],
  esbuildPlugins: [solidPlugin({ solid: { moduleName: "@opentui/solid", generate: "universal" } })]
});
