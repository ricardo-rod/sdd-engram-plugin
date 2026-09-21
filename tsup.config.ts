import { defineConfig } from "tsup";
import { solidPlugin } from "esbuild-plugin-solid";

const solidEsbuildPlugin = solidPlugin({
	solid: {
		moduleName: "@opentui/solid",
		generate: "universal",
	},
});

// V2 (OpenCode 2.x) native `./tui` bundle: total cutover, no parallel
// `./tui-v2`. Built from the root V2 entry (index.tsx) with `Plugin.define`
// from `@opencode/plugin/tui`. Node builtins stay external via tsup's node
// platform default; OpenCode/OpenTUI peers must resolve from the host at
// runtime.
export default defineConfig({
	entry: {
		tui: "index.tsx",
	},
	format: ["esm"],
	target: "node22",
	bundle: true,
	splitting: false,
	clean: true,
	dts: true,
	outDir: "dist",
	minify: false,
	external: [
		"@opencode/plugin",
		"@opencode/plugin/tui",
		"@opencode/theme",
		"@opentui/core",
		"@opentui/solid",
		"solid-js",
		"@opentui/keymap",
	],
	esbuildPlugins: [solidEsbuildPlugin],
});
