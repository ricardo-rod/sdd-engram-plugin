import { describe, expect, it } from "vitest";
import config, { HOST_VITEST_EXCLUDE } from "../vitest.config.ts";

describe("host Vitest boundary", () => {
	it("excludes immutable vendored plugin suites from the host aggregate runner", () => {
		expect(HOST_VITEST_EXCLUDE).toContain("plugins/**");
		expect(HOST_VITEST_EXCLUDE).toContain("dist/**");
		expect(config.test?.exclude).toEqual(expect.arrayContaining(HOST_VITEST_EXCLUDE));
	});
});
