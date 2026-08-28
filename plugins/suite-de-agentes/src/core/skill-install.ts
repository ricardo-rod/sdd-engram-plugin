import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { validateSkillId } from "./config.ts";
import { validateSkillPackage, type IntegrationPlan } from "./skill-package.ts";

type JournalEntry = { path: string; bytes?: Buffer; mode?: number };
export type SkillInstallOptions = { home?: string; approved?: boolean; auditPath?: string; validate?: () => Promise<void>; assign?: (agentId: string, skillId: string) => Promise<void> };

export function globalSkillPath(id: string, home = process.env.HOME || process.env.USERPROFILE || "."): string { return join(home, ".config", "opencode", "skills", validateSkillId(id), "SKILL.md"); }

function ensureSafeDirectory(path: string, home: string): void {
  const root = resolve(home); const target = resolve(path); if (target !== root && !target.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`)) throw new Error("Skill destination escapes the configured home.");
  let current = root; if (!existsSync(current)) mkdirSync(current, { recursive: true });
  if (lstatSync(current).isSymbolicLink()) throw new Error("Skill destination contains a symbolic link.");
  for (const part of relative(current, resolve(path)).split(/[\\/]/).filter(Boolean)) { current = join(current, part); if (existsSync(current)) { if (lstatSync(current).isSymbolicLink()) throw new Error("Skill destination contains a symbolic link."); } else mkdirSync(current); }
}

function atomicWrite(path: string, content: string): void {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("Skill destination is a symbolic link.");
  const temporary = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  try { writeFileSync(temporary, content, { mode: 0o600 }); renameSync(temporary, path); } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}

function restore(entries: readonly JournalEntry[]): void { for (const entry of [...entries].reverse()) { if (entry.bytes) { atomicWrite(entry.path, entry.bytes.toString()); if (entry.mode !== undefined) writeFileSync(entry.path, entry.bytes, { mode: entry.mode }); } else if (existsSync(entry.path)) unlinkSync(entry.path); } }
function audit(path: string, home: string, plan: IntegrationPlan, outcome: "success" | "failure"): void { ensureSafeDirectory(dirname(path), home); appendFileSync(path, `${JSON.stringify({ timestamp: new Date().toISOString(), id: plan.pkg.id, source: plan.pkg.source, action: "install", outcome })}\n`, { mode: 0o600 }); }

export async function installSkill(plan: IntegrationPlan, options: SkillInstallOptions = {}): Promise<{ path: string }> {
  if (options.approved !== true) throw new Error("Skill installation requires explicit approval.");
  if (!options.validate || !options.assign || !Object.isFrozen(plan) || !Object.isFrozen(plan.pkg) || !Object.isFrozen(plan.pkg.files)) throw new Error("Skill integration plan is not approved and frozen.");
  const pkg = validateSkillPackage(plan.pkg); const home = options.home ?? process.env.HOME ?? process.env.USERPROFILE ?? ".";
  const root = dirname(globalSkillPath(pkg.id, home)); const auditPath = options.auditPath ?? join(home, ".config", "opencode", "agent-suite", "skill-audit.jsonl");
  const entries: JournalEntry[] = [];
  try {
    for (const file of pkg.files) { const path = resolve(root, file.path); if (!path.startsWith(`${resolve(root)}${process.platform === "win32" ? "\\" : "/"}`)) throw new Error("Invalid skill destination."); ensureSafeDirectory(dirname(path), home); entries.push(existsSync(path) ? { path, bytes: readFileSync(path), mode: lstatSync(path).mode & 0o777 } : { path }); }
    for (const file of pkg.files) atomicWrite(resolve(root, file.path), file.content);
    await options.validate(); await options.assign(plan.agentId, pkg.id); audit(auditPath, home, plan, "success");
    return { path: globalSkillPath(pkg.id, home) };
  } catch (error) { restore(entries); try { audit(auditPath, home, plan, "failure"); } catch { /* Preserve the installation failure without logging sensitive content. */ } throw error; }
}
