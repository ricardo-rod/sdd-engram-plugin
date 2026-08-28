import { describe, expect, it, vi } from "vitest";
import { PLUGIN_VERSION } from "../src/version.ts";
import { buildSuiteRootOptions, suiteSidebarLabel, suiteTitle } from "../src/tui/index.tsx";
import { resetHostCompatStateForTests, safeSlotRender } from "../src/tui/host-compat.ts";

describe("TUI host compatibility", () => {
  it("disables an incompatible renderer without throwing", () => {
    expect(safeSlotRender("sidebar", () => { throw new Error("No renderer found"); })).toBeNull();
  });

  it("logs a renderer-missing diagnostic once per process", () => {
    resetHostCompatStateForTests();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      safeSlotRender("sidebar", () => { throw new Error("No renderer found"); });
      safeSlotRender("sidebar", () => { throw new Error("No renderer found"); });
      expect(consoleError).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps the version visible in the host-safe labels", () => {
    expect(PLUGIN_VERSION).toBe("1.0.1");
    expect(suiteTitle()).toBe(`Suite de Agentes · v${PLUGIN_VERSION}`);
    expect(suiteSidebarLabel()).toBe(`Suite de Agentes · Alt+S · v${PLUGIN_VERSION}`);
  });

  it("exposes exactly the three Spanish root options including configuration", () => {
    expect(buildSuiteRootOptions()).toEqual([{ title: "Catálogo de agentes", value: "catalog" }]);
  });
});
