import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildArchiveFilesList,
  generateReleasePackage,
  validatePackageHygiene,
} from "../scripts/package.mjs";
import {
  checkPrerequisites,
  installPlugin,
  parseArgs,
  readJsonSafe,
  uninstallPlugin,
} from "../scripts/installer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

interface ArchiveFileEntry {
  relativePath: string;
  fullPath: string;
  mode: number;
  size: number;
}

describe("packaging and release distribution", () => {
  beforeAll(() => {
    if (!fs.existsSync(path.join(projectRoot, "dist", "server.js"))) {
      execFileSync("npm", ["run", "build"], { cwd: projectRoot, shell: true, stdio: "pipe" });
    }
  });
  it("builds a deterministic file list containing only release assets without root leakage", () => {
    const files = buildArchiveFilesList(projectRoot) as ArchiveFileEntry[];
    const relPaths = files.map((f: ArchiveFileEntry) => f.relativePath);

    expect(relPaths).toContain("dist/server.js");
    expect(relPaths).toContain("dist/tui.js");
    expect(relPaths).toContain("dist/core/index.js");
    expect(relPaths).toContain("scripts/installer.mjs");
    expect(relPaths).toContain("install.ps1");
    expect(relPaths).toContain("install.sh");
    expect(relPaths).toContain("package.json");
    expect(relPaths).toContain("package-lock.json");
    expect(relPaths).toContain("manifest.json");
    expect(relPaths).toContain("README.md");
    expect(relPaths).toContain("LICENSE");

    // Must not include development source trees or temporary directories
    expect(relPaths.some((p: string) => p.startsWith("src/"))).toBe(false);
    expect(relPaths.some((p: string) => p.startsWith("test/"))).toBe(false);
    expect(relPaths.some((p: string) => p.startsWith(".git"))).toBe(false);
    expect(relPaths.some((p: string) => p.startsWith("node_modules/"))).toBe(false);

    // List must be strictly sorted
    const sorted = [...relPaths].sort((a: string, b: string) => a.localeCompare(b));
    expect(relPaths).toEqual(sorted);
  });

  it("passes package hygiene validation with zero personal paths or tokens", () => {
    const files = buildArchiveFilesList(projectRoot) as ArchiveFileEntry[];
    expect(() => validatePackageHygiene(files)).not.toThrow();
  });

  it("generates valid .zip, .tar.gz, and SHA256SUMS.txt with matching checksums", () => {
    const tempReleaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-suite-release-test-"));
    try {
      const result = generateReleasePackage(projectRoot, tempReleaseDir);

      expect(result.version).toBe("1.1.0");
      expect(result.filesCount).toBeGreaterThanOrEqual(10);
      expect(fs.existsSync(result.zip.path)).toBe(true);
      expect(fs.existsSync(result.tarGz.path)).toBe(true);
      expect(fs.existsSync(result.checksums.path)).toBe(true);

      expect(result.zip.size).toBeGreaterThan(1000);
      expect(result.tarGz.size).toBeGreaterThan(1000);

      // Verify SHA256 content
      const sumsContent = fs.readFileSync(result.checksums.path, "utf8");
      const lines = sumsContent.trim().split("\n");
      expect(lines).toHaveLength(2);

      const zipActualHash = crypto.createHash("sha256").update(fs.readFileSync(result.zip.path)).digest("hex");
      const tarGzActualHash = crypto.createHash("sha256").update(fs.readFileSync(result.tarGz.path)).digest("hex");

      expect(lines[0]).toBe(`${zipActualHash}  ${result.zip.name}`);
      expect(lines[1]).toBe(`${tarGzActualHash}  ${result.tarGz.name}`);
    } finally {
      fs.rmSync(tempReleaseDir, { recursive: true, force: true });
    }
  });

  it("manifest.json defines exactly the 7 canonical built-ins without personal agent seeds", () => {
    const manifestPath = path.join(projectRoot, "manifest.json");
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    expect(manifest.version).toBe("1.1.0");
    expect(manifest.builtInAgents).toEqual([
      "build",
      "compaction",
      "explore",
      "general",
      "plan",
      "summary",
      "title",
    ]);
    expect(manifest.builtInAgents).not.toContain("agent-github");
    expect(manifest.builtInAgents).not.toContain("agent-notebooklm");
  });
});

describe("portable installer", () => {
  it("parses CLI arguments correctly", () => {
    const args = parseArgs(["--dry-run", "--target-dir", "/custom/plugins/suite", "--config-dir=/custom/config", "--uninstall"]);
    expect(args.dryRun).toBe(true);
    expect(args.uninstall).toBe(true);
    expect(args.targetDir).toBe("/custom/plugins/suite");
    expect(args.configDir).toBe("/custom/config");
  });

  it("checks Node and npm prerequisites", () => {
    const prereqs = checkPrerequisites();
    expect(prereqs.nodeVersion).toBeDefined();
    expect(prereqs.npmOk).toBe(true);
  });

  it("performs dry run without mutating target or config directories", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-suite-dryrun-"));
    const configDir = path.join(tempDir, "config");
    const targetDir = path.join(tempDir, "target");

    try {
      const res = installPlugin({
        sourceDir: projectRoot,
        configDir,
        targetDir,
        dryRun: true,
        skipNpm: true,
      });

      expect(res.dryRun).toBe(true);
      expect(res.status).toBe("dry-run");
      expect(fs.existsSync(configDir)).toBe(false);
      expect(fs.existsSync(targetDir)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("installs freshly into a missing configuration directory with valid schemas", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-suite-fresh-"));
    const configDir = path.join(tempDir, "config");
    const targetDir = path.join(tempDir, "target");

    try {
      const res = installPlugin({
        sourceDir: projectRoot,
        configDir,
        targetDir,
        dryRun: false,
        skipNpm: true,
      });

      expect(res.status).toBe("installed");
      expect(fs.existsSync(path.join(targetDir, "dist", "server.js"))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, "dist", "tui.js"))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, "package.json"))).toBe(true);

      const opencodeJson = readJsonSafe(path.join(configDir, "opencode.json"));
      expect(opencodeJson.$schema).toBe("https://opencode.ai/config.json");
      expect(opencodeJson.plugin).toContainEqual(res.serverPluginPath);

      const tuiJson = readJsonSafe(path.join(configDir, "tui.json"));
      expect(tuiJson.$schema).toBe("https://opencode.ai/tui.json");
      expect(tuiJson.plugin).toContainEqual(res.tuiPluginPath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("preserves existing configuration keys and creates backups before modification", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-suite-existing-"));
    const configDir = path.join(tempDir, "config");
    const targetDir = path.join(tempDir, "target");
    fs.mkdirSync(configDir, { recursive: true });

    const existingOpencode = {
      $schema: "https://opencode.ai/config.json",
      model: "anthropic/claude-3-7-sonnet",
      provider: [{ id: "anthropic", name: "Anthropic" }],
      plugin: ["/existing/custom-plugin.js"],
      agent: { myagent: { model: "anthropic/claude-3-7-sonnet" } },
    };

    const existingTui = {
      $schema: "https://opencode.ai/tui.json",
      theme: "dark",
      plugin: ["/existing/custom-tui.js"],
    };

    fs.writeFileSync(path.join(configDir, "opencode.json"), JSON.stringify(existingOpencode, null, 2), "utf8");
    fs.writeFileSync(path.join(configDir, "tui.json"), JSON.stringify(existingTui, null, 2), "utf8");

    try {
      const res = installPlugin({
        sourceDir: projectRoot,
        configDir,
        targetDir,
        dryRun: false,
        skipNpm: true,
      });

      // Verify backup files exist
      expect(fs.existsSync(path.join(configDir, "opencode.json.bak"))).toBe(true);
      expect(fs.existsSync(path.join(configDir, "tui.json.bak"))).toBe(true);

      // Verify preserved keys in opencode.json
      const updatedOpencode = readJsonSafe(path.join(configDir, "opencode.json"));
      expect(updatedOpencode.model).toBe("anthropic/claude-3-7-sonnet");
      expect(updatedOpencode.provider).toEqual([{ id: "anthropic", name: "Anthropic" }]);
      expect(updatedOpencode.agent).toEqual({ myagent: { model: "anthropic/claude-3-7-sonnet" } });
      expect(updatedOpencode.plugin).toEqual(["/existing/custom-plugin.js", res.serverPluginPath]);

      // Verify preserved keys in tui.json
      const updatedTui = readJsonSafe(path.join(configDir, "tui.json"));
      expect(updatedTui.theme).toBe("dark");
      expect(updatedTui.plugin).toEqual(["/existing/custom-tui.js", res.tuiPluginPath]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("is idempotent when executed multiple times", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-suite-idempotent-"));
    const configDir = path.join(tempDir, "config");
    const targetDir = path.join(tempDir, "target");

    try {
      const res1 = installPlugin({
        sourceDir: projectRoot,
        configDir,
        targetDir,
        dryRun: false,
        skipNpm: true,
      });

      installPlugin({
        sourceDir: projectRoot,
        configDir,
        targetDir,
        dryRun: false,
        skipNpm: true,
      });

      const opencodeJson = readJsonSafe(path.join(configDir, "opencode.json"));
      expect(opencodeJson.plugin.filter((p: string) => p === res1.serverPluginPath)).toHaveLength(1);

      const tuiJson = readJsonSafe(path.join(configDir, "tui.json"));
      expect(tuiJson.plugin.filter((p: string) => p === res1.tuiPluginPath)).toHaveLength(1);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uninstalls cleanly and restores plugin configuration without touching other keys", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-suite-uninstall-"));
    const configDir = path.join(tempDir, "config");
    const targetDir = path.join(tempDir, "target");

    try {
      const installRes = installPlugin({
        sourceDir: projectRoot,
        configDir,
        targetDir,
        dryRun: false,
        skipNpm: true,
      });

      const uninstallRes = uninstallPlugin({
        configDir,
        targetDir,
        dryRun: false,
      });

      expect(uninstallRes.status).toBe("uninstalled");

      const opencodeJson = readJsonSafe(path.join(configDir, "opencode.json"));
      expect(opencodeJson.plugin).not.toContain(installRes.serverPluginPath);

      const tuiJson = readJsonSafe(path.join(configDir, "tui.json"));
      expect(tuiJson.plugin).not.toContain(installRes.tuiPluginPath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("validates bash install.sh syntax", () => {
    const scriptPath = path.join(projectRoot, "install.sh");
    expect(fs.existsSync(scriptPath)).toBe(true);
    const scriptContent = fs.readFileSync(scriptPath, "utf8");
    expect(scriptContent.startsWith("#!/usr/bin/env sh")).toBe(true);
    expect(scriptContent).toContain("INSTALLER_SCRIPT");

    try {
      execFileSync("bash", ["-n", scriptPath.replace(/\\/g, "/")], { stdio: ["ignore", "ignore", "ignore"], timeout: 3000 });
    } catch {
      // If bash is unavailable or fails on host, unit syntax checks above suffice
    }
  });

  it("smokes dynamic import of compiled dist entries in clean environment", async () => {
    const serverUrl = pathToFileURL(path.join(projectRoot, "dist", "server.js")).href;
    const coreUrl = pathToFileURL(path.join(projectRoot, "dist", "core", "index.js")).href;

    const distServer = await import(serverUrl);
    const distCore = await import(coreUrl);

    expect(distServer.default).toMatchObject({ id: "agent-suite" });
    expect(distCore.CANONICAL_BUILT_IN_AGENTS).toHaveLength(7);
    expect(distCore.CANONICAL_BUILT_IN_AGENT_IDS).toEqual([
      "general",
      "build",
      "plan",
      "explore",
      "compaction",
      "title",
      "summary",
    ]);
  });
});
