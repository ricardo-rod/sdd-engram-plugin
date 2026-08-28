import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function getDefaultHome() {
  return process.env.HOME || process.env.USERPROFILE || ".";
}

export function getDefaultConfigDir(home = getDefaultHome()) {
  return path.join(home, ".config", "opencode");
}

export function getDefaultTargetDir(configDir = getDefaultConfigDir()) {
  return path.join(configDir, "plugins", "suite-de-agentes");
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    dryRun: false,
    uninstall: false,
    help: false,
    skipNpm: false,
    targetDir: "",
    configDir: "",
    sourceDir: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run" || arg === "-d") {
      options.dryRun = true;
    } else if (arg === "--uninstall" || arg === "-u") {
      options.uninstall = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--skip-npm") {
      options.skipNpm = true;
    } else if (arg === "--target-dir") {
      options.targetDir = argv[++i] ?? "";
    } else if (arg.startsWith("--target-dir=")) {
      options.targetDir = arg.slice("--target-dir=".length);
    } else if (arg === "--config-dir") {
      options.configDir = argv[++i] ?? "";
    } else if (arg.startsWith("--config-dir=")) {
      options.configDir = arg.slice("--config-dir=".length);
    } else if (arg === "--source-dir") {
      options.sourceDir = argv[++i] ?? "";
    } else if (arg.startsWith("--source-dir=")) {
      options.sourceDir = arg.slice("--source-dir=".length);
    }
  }

  return options;
}

export function checkPrerequisites() {
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split(".")[0], 10);
  if (isNaN(major) || major < 22) {
    throw new Error(`Node.js version >= 22 required (found ${nodeVersion}). Please update Node.js.`);
  }

  let npmOk = false;
  try {
    const npmVersion = execFileSync("npm", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: true,
    }).trim();
    if (npmVersion) npmOk = true;
  } catch {
    npmOk = false;
  }

  return { nodeVersion, npmOk };
}

export function readJsonSafe(filePath, defaultContent = {}) {
  if (!fs.existsSync(filePath)) return defaultContent;
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return defaultContent;
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse JSON configuration file at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function writeJsonSafe(filePath, data, dryRun = false) {
  const formatted = JSON.stringify(data, null, 2) + "\n";
  if (dryRun) return;

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Backup existing file before modifying
  if (fs.existsSync(filePath)) {
    const timestamp = Date.now();
    const backupPath = `${filePath}.bak-${timestamp}`;
    const primaryBak = `${filePath}.bak`;
    fs.copyFileSync(filePath, backupPath);
    if (!fs.existsSync(primaryBak)) {
      fs.copyFileSync(filePath, primaryBak);
    }
  }

  // Write atomically
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  fs.writeFileSync(tempPath, formatted, "utf8");
  fs.renameSync(tempPath, filePath);
}

function copyDirectoryRecursive(source, target, dryRun = false) {
  if (!fs.existsSync(source)) return;
  if (!dryRun && !fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const entries = fs.readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const dstPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, dstPath, dryRun);
    } else if (entry.isFile()) {
      if (!dryRun) {
        fs.copyFileSync(srcPath, dstPath);
      }
    }
  }
}

export function installPlugin(options = {}) {
  const home = getDefaultHome();
  const configDir = path.resolve(options.configDir || getDefaultConfigDir(home));
  const targetDir = path.resolve(options.targetDir || getDefaultTargetDir(configDir));
  const sourceDir = path.resolve(options.sourceDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const dryRun = Boolean(options.dryRun);
  const skipNpm = Boolean(options.skipNpm);

  const serverPluginPath = path.join(targetDir, "dist", "server.js").replace(/\\/g, "/");
  const tuiPluginPath = path.join(targetDir, "dist", "tui.js").replace(/\\/g, "/");

  const planned = {
    sourceDir,
    targetDir,
    configDir,
    serverPluginPath,
    tuiPluginPath,
    opencodeConfig: path.join(configDir, "opencode.json"),
    tuiConfig: path.join(configDir, "tui.json"),
    copiedItems: ["dist", "package.json", "package-lock.json", "manifest.json", "README.md", "LICENSE", "scripts", "install.ps1", "install.sh"],
  };

  if (dryRun) {
    return {
      status: "dry-run",
      dryRun: true,
      planned,
    };
  }

  // 1. Copy files to target directory
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  for (const item of planned.copiedItems) {
    const src = path.join(sourceDir, item);
    const dst = path.join(targetDir, item);
    if (fs.existsSync(src)) {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        copyDirectoryRecursive(src, dst, false);
      } else {
        fs.copyFileSync(src, dst);
      }
    }
  }

  // 2. Run npm install --omit=dev in target directory if needed
  if (!skipNpm && fs.existsSync(path.join(targetDir, "package.json"))) {
    try {
      execFileSync(
        "npm",
        ["install", "--omit=dev", "--no-audit", "--no-fund"],
        {
          cwd: targetDir,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          shell: true,
        }
      );
    } catch (err) {
      // In self-contained package where node_modules are already present, npm install failure may be non-fatal,
      // but warn if needed.
    }
  }

  // 3. Register server plugin in opencode.json
  const opencodeJsonPath = path.join(configDir, "opencode.json");
  const opencodeData = readJsonSafe(opencodeJsonPath, {
    $schema: "https://opencode.ai/config.json",
    plugin: [],
  });

  if (!Array.isArray(opencodeData.plugin)) {
    opencodeData.plugin = [];
  }

  // Normalize existing entries
  const existingServerIdx = opencodeData.plugin.findIndex((p) => {
    if (typeof p !== "string") return false;
    const normalized = p.replace(/\\/g, "/");
    return normalized === serverPluginPath || normalized.endsWith("/dist/server.js") && normalized.includes("suite-de-agentes");
  });

  if (existingServerIdx >= 0) {
    opencodeData.plugin[existingServerIdx] = serverPluginPath;
  } else {
    opencodeData.plugin.push(serverPluginPath);
  }

  writeJsonSafe(opencodeJsonPath, opencodeData, false);

  // 4. Register TUI plugin in tui.json
  const tuiJsonPath = path.join(configDir, "tui.json");
  const tuiData = readJsonSafe(tuiJsonPath, {
    $schema: "https://opencode.ai/tui.json",
    plugin: [],
  });

  if (!Array.isArray(tuiData.plugin)) {
    tuiData.plugin = [];
  }

  const existingTuiIdx = tuiData.plugin.findIndex((p) => {
    if (typeof p !== "string") return false;
    const normalized = p.replace(/\\/g, "/");
    return normalized === tuiPluginPath || normalized.endsWith("/dist/tui.js") && normalized.includes("suite-de-agentes");
  });

  if (existingTuiIdx >= 0) {
    tuiData.plugin[existingTuiIdx] = tuiPluginPath;
  } else {
    tuiData.plugin.push(tuiPluginPath);
  }

  writeJsonSafe(tuiJsonPath, tuiData, false);

  return {
    status: "installed",
    targetDir,
    configDir,
    serverPluginPath,
    tuiPluginPath,
  };
}

export function uninstallPlugin(options = {}) {
  const home = getDefaultHome();
  const configDir = path.resolve(options.configDir || getDefaultConfigDir(home));
  const targetDir = path.resolve(options.targetDir || getDefaultTargetDir(configDir));
  const dryRun = Boolean(options.dryRun);

  const serverPluginPath = path.join(targetDir, "dist", "server.js").replace(/\\/g, "/");
  const tuiPluginPath = path.join(targetDir, "dist", "tui.js").replace(/\\/g, "/");

  const opencodeJsonPath = path.join(configDir, "opencode.json");
  const tuiJsonPath = path.join(configDir, "tui.json");

  if (dryRun) {
    return {
      status: "dry-run",
      dryRun: true,
      action: "uninstall",
      opencodeConfig: opencodeJsonPath,
      tuiConfig: tuiJsonPath,
    };
  }

  if (fs.existsSync(opencodeJsonPath)) {
    const opencodeData = readJsonSafe(opencodeJsonPath, {});
    if (Array.isArray(opencodeData.plugin)) {
      opencodeData.plugin = opencodeData.plugin.filter((p) => {
        if (typeof p !== "string") return true;
        const normalized = p.replace(/\\/g, "/");
        return normalized !== serverPluginPath && !(normalized.endsWith("/dist/server.js") && normalized.includes("suite-de-agentes"));
      });
      writeJsonSafe(opencodeJsonPath, opencodeData, false);
    }
  }

  if (fs.existsSync(tuiJsonPath)) {
    const tuiData = readJsonSafe(tuiJsonPath, {});
    if (Array.isArray(tuiData.plugin)) {
      tuiData.plugin = tuiData.plugin.filter((p) => {
        if (typeof p !== "string") return true;
        const normalized = p.replace(/\\/g, "/");
        return normalized !== tuiPluginPath && !(normalized.endsWith("/dist/tui.js") && normalized.includes("suite-de-agentes"));
      });
      writeJsonSafe(tuiJsonPath, tuiData, false);
    }
  }

  return {
    status: "uninstalled",
    configDir,
    targetDir,
  };
}

// CLI execution entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log("Suite de Agentes Installer (v1.1.0)");
      console.log("Usage: node scripts/installer.mjs [--dry-run] [--uninstall] [--target-dir <path>] [--config-dir <path>]");
      process.exit(0);
    }

    const { nodeVersion, npmOk } = checkPrerequisites();
    console.log(`OpenCode Suite de Agentes Installer`);
    console.log(`Environment: Node ${nodeVersion}, npm: ${npmOk ? "ok" : "not found in PATH"}`);

    if (options.uninstall) {
      const res = uninstallPlugin(options);
      if (options.dryRun) {
        console.log(`[DRY-RUN] Would uninstall Suite de Agentes from ${res.opencodeConfig} and ${res.tuiConfig}`);
      } else {
        console.log(`✓ Successfully uninstalled Suite de Agentes from ${res.configDir}`);
      }
    } else {
      const res = installPlugin(options);
      if (options.dryRun) {
        console.log(`[DRY-RUN] Target Directory: ${res.planned.targetDir}`);
        console.log(`[DRY-RUN] Server Plugin Path: ${res.planned.serverPluginPath}`);
        console.log(`[DRY-RUN] TUI Plugin Path: ${res.planned.tuiPluginPath}`);
        console.log(`[DRY-RUN] Would register in ${res.planned.opencodeConfig} and ${res.planned.tuiConfig}`);
      } else {
        console.log(`✓ Installed plugin files to ${res.targetDir}`);
        console.log(`✓ Registered server plugin: ${res.serverPluginPath}`);
        console.log(`✓ Registered TUI plugin: ${res.tuiPluginPath}`);
        console.log(`\nSuite de Agentes is ready! Restart OpenCode and press Alt+S or type /agent-suite to launch.`);
      }
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
