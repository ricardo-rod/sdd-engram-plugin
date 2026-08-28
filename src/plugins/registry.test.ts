import { describe, expect, it } from "vitest";
import { buildPluginHubOptions, inspectPluginPath, isConfirmedGitRoot } from "./registry";

describe("plugin registry safety and hub", () => {
  it("exposes the Spanish hub in the required order", () => {
    expect(buildPluginHubOptions().map((option) => option.title)).toEqual([
      "Suite de Agentes",
      "Task Manager",
      "Ayuda",
      "← Volver",
    ]);
  });

  it("rejects documentation-like and executable-looking paths", () => {
    expect(inspectPluginPath("README.sh")).toEqual({ safe: false, reason: "documentation-like path" });
    expect(inspectPluginPath("requirements.txt")).toEqual({ safe: false, reason: "documentation-like path" });
    expect(inspectPluginPath("plugins/suite-de-agentes/README.md")).toEqual({ safe: true });
  });

  it("accepts only an explicit canonical git root", () => {
    expect(isConfirmedGitRoot("C:/repo", "C:/repo")).toBe(true);
    expect(isConfirmedGitRoot("C:/repo", "C:/repo/subdir")).toBe(false);
    expect(isConfirmedGitRoot("C:/repo", "../repo")).toBe(false);
  });
});
