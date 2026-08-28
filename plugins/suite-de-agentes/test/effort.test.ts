import { describe, expect, it } from "vitest";
import { EFFORT_ORDER, normalizeEffortOptions } from "../src/core/effort.ts";

describe("effort option normalization", () => {
  it("keeps the canonical vocabulary in a stable order with default first", () => {
    expect(EFFORT_ORDER).toEqual(["none", "low", "high", "xhigh", "max"]);
    expect(normalizeEffortOptions(["max", "low"])).toEqual(["default", "low", "max"]);
    expect(normalizeEffortOptions(["HIGH", "none", "x-high", "low"])).toEqual([
      "default",
      "none",
      "low",
      "high",
      "xhigh",
    ]);
  });

  it("drops unsupported runtime variants instead of surfacing them", () => {
    expect(normalizeEffortOptions(["low", "high", "turbo", "medium", "minimal"])).toEqual([
      "default",
      "low",
      "high",
    ]);
    expect(normalizeEffortOptions([])).toEqual(["default"]);
  });

  it("normalizes known aliases and ignores unknown keys without mutating input", () => {
    const runtimeVariants = ["MAXIMUM", "x_high", " default ", "turbo"];

    expect(normalizeEffortOptions(runtimeVariants)).toEqual(["default", "xhigh", "max"]);
    expect(runtimeVariants).toEqual(["MAXIMUM", "x_high", " default ", "turbo"]);
  });
});
