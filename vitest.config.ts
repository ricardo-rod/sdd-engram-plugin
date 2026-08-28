import { configDefaults, defineConfig } from "vitest/config";

/** Immutable vendor snapshots use their upstream-owned runners. */
export const HOST_VITEST_EXCLUDE = ["plugins/**", "dist/**"];

export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, ...HOST_VITEST_EXCLUDE],
	},
});
