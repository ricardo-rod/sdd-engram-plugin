import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

type ImportDefinition = { id: "suite" | "task-manager"; source: string; destination: string; remote: string; commit: string; version: string };
type TreeEntry = { mode: string; type: string; oid: string; relativePath: string };

const ROOT = path.resolve(import.meta.dirname, "..");
const DEFINITIONS: ImportDefinition[] = [
  { id: "suite", source: process.env.SUITE_SOURCE_ROOT ?? path.resolve(ROOT, "../suite-de-agentes"), destination: "suite-de-agentes", remote: "https://github.com/RamonsDka/suite-de-agentes.git", commit: "f49270e8e738ef1babe6210c910f786b9da735e0", version: "1.1.0" },
  { id: "task-manager", source: process.env.TASK_MANAGER_SOURCE_ROOT ?? path.resolve(ROOT, "../proyecto-HTLM"), destination: "task-manager", remote: "https://github.com/RamonsDka/task-manager-portable.git", commit: "8264461d8e4fdf6df9072f50401692a51b6355ff", version: "1.1.0" },
];

function excluded(id: ImportDefinition["id"], relativePath: string): boolean {
  const common = [".git/", "node_modules/", "dist/", "coverage/"];
  const suiteOnly = ["openspec/", ".history/", ".atl/", ".codegraph/", ".github/"];
  const prefixes = id === "suite" ? [...common, ...suiteOnly] : [...common, ".github/"];
  return prefixes.some((prefix) => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix));
}

function git(source: string, args: string[]): Buffer {
  return execFileSync("git", args, { cwd: source, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
}

function treeEntries(definition: ImportDefinition): TreeEntry[] {
  return git(definition.source, ["ls-tree", "-r", "-z", definition.commit]).toString("utf8").split("\0").filter(Boolean)
    .map((raw) => {
      const match = raw.match(/^(\d+)\s+(\w+)\s+([0-9a-f]{40})\t(.+)$/);
      if (!match) throw new Error(`Unparseable git tree entry: ${raw}`);
      return { mode: match[1], type: match[2], oid: match[3], relativePath: match[4] };
    })
    .filter((entry) => entry.type === "blob" && !excluded(definition.id, entry.relativePath))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function importDefinition(definition: ImportDefinition): void {
  const entries = treeEntries(definition);
  const target = path.join(ROOT, "plugins", definition.destination);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  const records: string[] = [];
  let textFiles = 0; let textLines = 0; let binaryFiles = 0; let binaryBytes = 0; let totalBytes = 0;
  for (const entry of entries) {
    const content = git(definition.source, ["cat-file", "blob", entry.oid]);
    const binary = content.includes(0); const lines = binary ? 0 : content.toString("utf8").split("\n").length;
    totalBytes += content.length;
    if (binary) { binaryFiles++; binaryBytes += content.length; } else { textFiles++; textLines += lines; }
    fs.mkdirSync(path.dirname(path.join(target, entry.relativePath)), { recursive: true });
    fs.writeFileSync(path.join(target, entry.relativePath), content);
    records.push(`${entry.mode} ${entry.oid} ${crypto.createHash("sha256").update(content).digest("hex")} ${content.length} ${lines} ${entry.relativePath}`);
  }
  const manifest = `${records.join("\n")}\n`;
  const manifestSha256 = crypto.createHash("sha256").update(manifest).digest("hex");
  fs.writeFileSync(path.join(target, "MANIFEST.txt"), manifest);
  fs.writeFileSync(path.join(target, "PROVENANCE.json"), `${JSON.stringify({ source: definition.remote, commit: definition.commit, version: definition.version, manifestAlgorithm: "sorted entries <git_mode> <git_blob_oid> <sha256_content> <bytes> <lines> <rel_path>\\n", manifestSha256, inventory: { files: entries.length, textFiles, textLines, binaryFiles, binaryBytes, totalBytes }, exclusions: definition.id === "suite" ? [".git/**", "node_modules/**", "dist/**", "coverage/**", "openspec/**", ".history/**", ".atl/**", ".codegraph/**", ".github/**"] : [".git/**", "node_modules/**", "dist/**", "coverage/**", ".github/**"] }, null, 2)}\n`);
  console.log(`${definition.destination}: ${entries.length} files, ${manifestSha256}`);
}

for (const definition of DEFINITIONS) importDefinition(definition);
