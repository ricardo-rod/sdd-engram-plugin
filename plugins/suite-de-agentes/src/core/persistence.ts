import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseSuiteConfig } from "./config.ts";
import type { SuiteConfig } from "./types.ts";

export function defaultSuitePath(home = process.env.HOME || process.env.USERPROFILE || "."): string { return join(home, ".config", "opencode", "agent-suite", "suites.json"); }
export function loadSuiteConfig(path: string): SuiteConfig {
  if (!existsSync(path)) return { version: 1, customAgents: {}, modelAssignments: {}, variantAssignments: {} };
  return parseSuiteConfig(JSON.parse(readFileSync(path, "utf8")));
}
export function saveSuiteConfig(path: string, value: unknown): void {
  const validated = parseSuiteConfig(value);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  try { writeFileSync(tmp, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 }); renameSync(tmp, path); } finally { if (existsSync(tmp)) unlinkSync(tmp); }
}
