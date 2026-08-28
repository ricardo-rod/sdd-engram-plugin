import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type HelpTopic, loadOfflineHelp, resolveOfflineHelpPath } from "./offline-help";

const originalCwd = process.cwd();

afterEach(() => process.chdir(originalCwd));

describe("offline Suite and multi-plugin help", () => {
  it("resolves bundled help package-relatively outside the repository cwd", () => {
    process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "suite-help-")));

    const helpPath = resolveOfflineHelpPath();

    expect(helpPath.endsWith(path.join("plugins", "suite-de-agentes", "README.md"))).toBe(true);
    expect(fs.existsSync(helpPath)).toBe(true);
    expect(loadOfflineHelp()).toContain("Suite de Agentes");
  });

  it("does not substitute a cwd document when packaged help is unavailable", () => {
    const missingModuleUrl = new URL("file:///C:/missing-package/dist/tui.js").href;

    expect(() => resolveOfflineHelpPath("suite", missingModuleUrl)).toThrow("Bundled Suite help is unavailable");
  });

  it("loads documentation for each target topic: suite, task-manager, and hub", () => {
    process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "multi-help-")));

    const suiteDoc = loadOfflineHelp("suite");
    expect(suiteDoc).toContain("Suite de Agentes");
    expect(suiteDoc).toContain("version");

    const tmDoc = loadOfflineHelp("task-manager");
    expect(tmDoc).toContain("Task Manager Portable");

    const hubDoc = loadOfflineHelp("hub");
    expect(hubDoc).toContain("opencode-sdd-engram-manage");
  });

  it("resolves exact file paths for task-manager and hub topics", () => {
    const tmPath = resolveOfflineHelpPath("task-manager");
    expect(tmPath.endsWith(path.join("plugins", "task-manager", "README.md"))).toBe(true);
    expect(fs.existsSync(tmPath)).toBe(true);

    const hubPath = resolveOfflineHelpPath("hub");
    expect(hubPath.endsWith("README.md")).toBe(true);
    expect(fs.existsSync(hubPath)).toBe(true);
  });

  it("throws expected error for unavailable task-manager and hub help", () => {
    const missingModuleUrl = new URL("file:///C:/missing-package/dist/tui.js").href;

    expect(() => resolveOfflineHelpPath("task-manager", missingModuleUrl)).toThrow("Bundled Task Manager help is unavailable");
    expect(() => resolveOfflineHelpPath("hub", missingModuleUrl)).toThrow("Bundled Hub help is unavailable");
  });
});
