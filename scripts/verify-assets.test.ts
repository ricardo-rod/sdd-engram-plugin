import { describe, expect, it } from "vitest";
import { requiredPluginAssets } from "./verify-assets";

describe("plugin asset spike", () => {
  it("requires the portable template and Suite offline help", () => {
    expect(requiredPluginAssets("/package").map((asset) => asset.replaceAll("\\", "/"))).toEqual([
      "/package/plugins/task-manager/Task-Manager-Portable.html",
      "/package/plugins/suite-de-agentes/README.md",
    ]);
  });
});
