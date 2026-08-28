import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getHostVersion,
	resetHostCompatStateForTests,
	safeHostAction,
	safeHostAsyncAction,
	safeSetDialogSize,
	safeSlotRender,
} from "./host-compat";

describe("host-compat", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetHostCompatStateForTests();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("getHostVersion", () => {
    it("returns the version from api.app.version", () => {
      expect(getHostVersion({ app: { version: "1.14.49" } })).toBe("1.14.49");
    });

    it("returns 'unknown' when app is missing", () => {
      expect(getHostVersion({})).toBe("unknown");
    });

    it("returns 'unknown' when version is missing", () => {
      expect(getHostVersion({ app: {} })).toBe("unknown");
    });
  });

  describe("safeSlotRender", () => {
    it("returns the render result when nothing throws", () => {
      const result = safeSlotRender("home_bottom", () => "ok");
      expect(result).toBe("ok");
    });

	it("returns null when the renderer is missing", () => {
		const result = safeSlotRender("home_bottom", () => {
			throw new Error("No renderer found");
		});
		expect(result).toBeNull();
	});

	it("returns null when the renderer missing error is wrapped", () => {
		const result = safeSlotRender("home_bottom", () => {
			throw new Error("slot failed", { cause: new Error("No renderer found") });
		});
		expect(result).toBeNull();
	});

    it("warns once across multiple incompatible renders", () => {
      safeSlotRender("home_bottom", () => {
        throw new Error("No renderer found");
      });
      safeSlotRender("sidebar_content", () => {
        throw new Error("No renderer found");
      });
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

	it("disables the slot on errors unrelated to the renderer", () => {
		const result = safeSlotRender("home_bottom", () => {
			throw new Error("something else");
		});

		expect(result).toBeNull();
		expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		expect(consoleErrorSpy.mock.calls[0]?.[0]).toContain(
			"OpenCode will continue without this optional UI",
		);
	});

	it("disables the slot on non-Error throwables", () => {
		const result = safeSlotRender("home_bottom", () => {
			throw "string error";
		});

		expect(result).toBeNull();
	});

	it("warns once per slot for non-renderer failures", () => {
		safeSlotRender("home_bottom", () => {
			throw new Error("first failure");
		});
		safeSlotRender("home_bottom", () => {
			throw new Error("second failure");
		});
		safeSlotRender("sidebar_content", () => {
			throw new Error("third failure");
		});

		expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
	});
});

describe("safeHostAction", () => {
	it("returns the action result when nothing throws", () => {
		expect(safeHostAction("register command", () => "ok", "fallback")).toBe(
			"ok",
		);
	});

	it("returns the fallback when the action throws", () => {
		const result = safeHostAction("register command", () => {
			throw new Error("boom");
		}, "fallback");

		expect(result).toBe("fallback");
		expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		expect(consoleErrorSpy.mock.calls[0]?.[0]).toContain("OpenCode will continue");
	});
});

describe("safeHostAsyncAction", () => {
	it("returns the async action result when nothing throws", async () => {
		await expect(
			safeHostAsyncAction("load preferences", async () => "ok", "fallback"),
		).resolves.toBe("ok");
	});

	it("returns the fallback when the async action rejects", async () => {
		const result = await safeHostAsyncAction("load preferences", async () => {
			throw new Error("boom");
		}, "fallback");

		expect(result).toBe("fallback");
		expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		expect(consoleErrorSpy.mock.calls[0]?.[0]).toContain("OpenCode will continue");
	});
});

describe("safeSetDialogSize (T27, T28)", () => {
	it.each([
		["undefined api", undefined],
		["empty api", {}],
		["empty ui", { ui: {} }],
		["empty dialog", { ui: { dialog: {} } }],
		["undefined setSize", { ui: { dialog: { setSize: undefined } } }],
	])("T27: degrades safely when setSize is missing on %s", (_, api) => {
		expect(() => safeSetDialogSize(api as any, "large")).not.toThrow();
	});

	it.each([
		["Error instance", new Error("setSize crash")],
		["string throwable", "custom setSize failure"],
	])("T28: catches and logs when setSize throws %s", (_, errorToThrow) => {
		const setSizeSpy = vi.fn().mockImplementation(() => {
			throw errorToThrow;
		});
		const api = { ui: { dialog: { setSize: setSizeSpy } } };
		expect(() => safeSetDialogSize(api as any, "xlarge")).not.toThrow();
		expect(setSizeSpy).toHaveBeenCalledWith("xlarge");
		expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
	});

	it("invokes setSize with target DialogSize when available", () => {
		const setSizeSpy = vi.fn();
		const api = { ui: { dialog: { setSize: setSizeSpy } } };
		safeSetDialogSize(api as any, "medium");
		expect(setSizeSpy).toHaveBeenCalledWith("medium");
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});
});
});
