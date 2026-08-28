import { randomBytes } from "node:crypto";
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateAgentId } from "./config.ts";
import { generateAgentMarkdown } from "./agent-markdown.ts";
import type { CustomAgent } from "./types.ts";
import { GITHUB_AGENT_ID, GITHUB_AGENT_LEGACY_ID } from "./built-in-agents.ts";

export function globalAgentPath(agentID: string, home = process.env.HOME || process.env.USERPROFILE || "."): string {
  validateAgentId(agentID);
  return join(home, ".config", "opencode", "agent", `${agentID}.md`);
}

export function materializeGlobalAgent(agent: CustomAgent, confirm: () => boolean, home?: string): string {
  if (!confirm()) throw new Error("Global agent materialization was not confirmed");
  const target = globalAgentPath(agent.id, home);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${randomBytes(6).toString("hex")}`;
  try { writeFileSync(temporary, generateAgentMarkdown(agent), { mode: 0o600 }); renameSync(temporary, target); } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  return target;
}

export type MaterializedAgentRenameResult =
  | { kind: "migrated"; path: string }
  | { kind: "unchanged"; path: string }
  | { kind: "not-materialized"; path: string };

function removeIfPresent(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // Cleanup is best effort; the original migration error remains authoritative.
  }
}

export function renameMaterializedAgentResult(oldId: string, newId: string, agent: CustomAgent, home?: string): MaterializedAgentRenameResult {
  validateAgentId(oldId);
  validateAgentId(newId);
  if (oldId === newId) return { kind: "unchanged", path: globalAgentPath(newId, home) };
  const oldPath = globalAgentPath(oldId, home);
  const newPath = globalAgentPath(newId, home);
  if (existsSync(newPath)) throw new Error(`Materialized agent already exists: ${newId}`);
  if (!existsSync(oldPath)) return { kind: "not-materialized", path: newPath };

  mkdirSync(dirname(newPath), { recursive: true });
  const temporary = `${newPath}.tmp-${randomBytes(6).toString("hex")}`;
  let promoted = false;
  try {
    writeFileSync(temporary, generateAgentMarkdown({ ...agent, id: newId }), { mode: 0o600 });
    copyFileSync(temporary, newPath, constants.COPYFILE_EXCL);
    promoted = true;
    unlinkSync(oldPath);
    return { kind: "migrated", path: newPath };
  } catch (error) {
    if (promoted) removeIfPresent(newPath);
    throw error;
  } finally {
    removeIfPresent(temporary);
  }
}

export function renameMaterializedAgent(oldId: string, newId: string, agent: CustomAgent, home?: string): string {
  return renameMaterializedAgentResult(oldId, newId, agent, home).path;
}

/** Migrates only the fixed OpenCode agent filenames; callers cannot select another target path. */
export function migrateGitHubMaterializedAgent(home?: string, promote: (from: string, to: string) => void = renameSync): MaterializedAgentRenameResult {
  const legacyPath = globalAgentPath(GITHUB_AGENT_LEGACY_ID, home);
  const canonicalPath = globalAgentPath(GITHUB_AGENT_ID, home);
  if (!existsSync(legacyPath)) return { kind: existsSync(canonicalPath) ? "unchanged" : "not-materialized", path: canonicalPath };
  const previous = readFileSync(legacyPath);
  const mode = statSync(legacyPath).mode & 0o777;
  const temporary = `${canonicalPath}.tmp-${randomBytes(6).toString("hex")}`;
  const backup = `${legacyPath}.legacy.bak`;
  try {
    if (existsSync(canonicalPath)) {
      if (!existsSync(backup)) copyFileSync(legacyPath, backup, constants.COPYFILE_EXCL);
      unlinkSync(legacyPath);
      return { kind: "unchanged", path: canonicalPath };
    }
    mkdirSync(dirname(canonicalPath), { recursive: true });
    writeFileSync(temporary, previous.toString("utf8").replaceAll(GITHUB_AGENT_LEGACY_ID, GITHUB_AGENT_ID), { mode });
    promote(temporary, canonicalPath);
    copyFileSync(legacyPath, backup, constants.COPYFILE_EXCL);
    unlinkSync(legacyPath);
    return { kind: "migrated", path: canonicalPath };
  } catch (error) {
    removeIfPresent(canonicalPath);
    throw error;
  } finally {
    removeIfPresent(temporary);
  }
}

export function listRuntimeModels(state: unknown): string[] {
  if (!state || typeof state !== "object") return [];
  const providers = (state as Record<string, unknown>).provider;
  if (!Array.isArray(providers)) return [];
  return providers.flatMap((provider) => {
    if (!provider || typeof provider !== "object") return [];
    const item = provider as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : typeof item.name === "string" ? item.name : "";
    const models = item.models && typeof item.models === "object" ? Object.keys(item.models as object) : [];
    return id ? models.map((model) => `${id}/${model}`) : [];
  });
}
