import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("plugin distribution smoke", () => {
	it("verifies the post-build plugin package from a temporary cwd", () => {
		const output = execFileSync(process.execPath, ["scripts/smoke-plugins.ts"], {
		cwd: process.cwd(),
		encoding: "utf8",
	});

		expect(output).toContain("Plugin distribution smoke passed");
		expect(output).toContain("temporary cwd");
	});
});
