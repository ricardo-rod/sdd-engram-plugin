import { describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { globalAgentPath, materializeGlobalAgent, migrateGitHubMaterializedAgent, renameMaterializedAgent, renameMaterializedAgentResult } from "../src/core/agents.ts";

describe("agent materialization", () => {
  it("requires confirmation and writes only a validated global markdown path", () => {
    const home = mkdtempSync(join(tmpdir(), "agent-suite-home-"));
    const agent = { id: "safe-agent", description: "Safe", model: "openai/x", variant: "high", prompt: "Do work.", permissions: { read: "allow" as const }, skills: ["skill-one"] };
    expect(() => materializeGlobalAgent(agent, () => false, home)).toThrow("not confirmed");
    const path = materializeGlobalAgent(agent, () => true, home);
    expect(path).toBe(globalAgentPath("safe-agent", home));
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("skill: allow");
    expect(readFileSync(path, "utf8")).toContain("variant: high");
  });

  it("renames materialized content by writing the new file before removing the old file", () => {
    const home = mkdtempSync(join(tmpdir(), "agent-suite-home-"));
    const agent = { id: "old-agent", description: "Old", model: "openai/x", prompt: "Do work.", permissions: { read: "allow" as const }, skills: [] };
    materializeGlobalAgent(agent, () => true, home);

    const newPath = renameMaterializedAgent("old-agent", "new-agent", { ...agent, id: "new-agent", description: "New" }, home);

    expect(newPath).toBe(globalAgentPath("new-agent", home));
    expect(existsSync(globalAgentPath("old-agent", home))).toBe(false);
    expect(readFileSync(newPath, "utf8")).toContain("name: new-agent");
    expect(readFileSync(newPath, "utf8")).toContain("description: \"New\"");
  });

  it("rejects a materialized destination collision without removing the old file", () => {
    const home = mkdtempSync(join(tmpdir(), "agent-suite-home-"));
    const oldAgent = { id: "old-agent", description: "Old", model: "openai/x", prompt: "Do work.", permissions: { read: "allow" as const }, skills: [] };
    const newAgent = { ...oldAgent, id: "new-agent" };
    materializeGlobalAgent(oldAgent, () => true, home);
    materializeGlobalAgent(newAgent, () => true, home);
    const destinationBefore = readFileSync(globalAgentPath("new-agent", home), "utf8");

    expect(() => renameMaterializedAgentResult("old-agent", "new-agent", newAgent, home)).toThrow(/already exists|existe|collision|colisi[oó]n/i);
    expect(existsSync(globalAgentPath("old-agent", home))).toBe(true);
    expect(existsSync(globalAgentPath("new-agent", home))).toBe(true);
    expect(readFileSync(globalAgentPath("new-agent", home), "utf8")).toBe(destinationBefore);
  });

  it("reports a missing source as a non-materialized migration without creating a destination", () => {
    const home = mkdtempSync(join(tmpdir(), "agent-suite-home-"));
    const agent = { id: "new-agent", description: "New", model: "openai/x", prompt: "Do work.", permissions: { read: "allow" as const }, skills: [] };

    expect(renameMaterializedAgentResult("old-agent", "new-agent", agent, home)).toEqual({
      kind: "not-materialized",
      path: globalAgentPath("new-agent", home),
    });
    expect(existsSync(globalAgentPath("old-agent", home))).toBe(false);
    expect(existsSync(globalAgentPath("new-agent", home))).toBe(false);
  });

  it("cleans up a failed generated write and preserves the old materialized file", () => {
    const home = mkdtempSync(join(tmpdir(), "agent-suite-home-"));
    const oldAgent = { id: "old-agent", description: "Old", model: "openai/x", prompt: "Do work.", permissions: { read: "allow" as const }, skills: [] };
    materializeGlobalAgent(oldAgent, () => true, home);

    expect(() => renameMaterializedAgent("old-agent", "new-agent", { ...oldAgent, id: "new-agent", prompt: "" }, home)).toThrow(/requires model and prompt/i);
    expect(existsSync(globalAgentPath("old-agent", home))).toBe(true);
    expect(existsSync(globalAgentPath("new-agent", home))).toBe(false);
  });

  it("migrates legacy GitHub markdown atomically, preserves manual content and archives only after promotion", () => {
    const home = mkdtempSync(join(tmpdir(), "agent-suite-home-"));
    const legacyPath = globalAgentPath("agent-especialit-github", home);
    const legacyBytes = "---\nname: agent-especialit-github\ndescription: Manual description\n---\nManual instructions stay intact.\n";
    materializeGlobalAgent({ id: "agent-especialit-github", description: "Legacy", model: "openai/x", prompt: "Old", permissions: {}, skills: [] }, () => true, home);
    writeFileSync(legacyPath, legacyBytes);
    chmodSync(legacyPath, 0o640);
    const originalMode = statSync(legacyPath).mode & 0o777;

    const migrated = migrateGitHubMaterializedAgent(home);
    const canonicalPath = globalAgentPath("agent-github", home);

    expect(migrated).toEqual({ kind: "migrated", path: canonicalPath });
    expect(readFileSync(canonicalPath, "utf8")).toContain("Manual instructions stay intact.");
    expect(readFileSync(canonicalPath, "utf8")).toContain("name: agent-github");
    expect(readFileSync(canonicalPath, "utf8")).not.toContain("agent-especialit-github");
    expect(statSync(canonicalPath).mode & 0o777).toBe(originalMode);
    expect(readFileSync(`${legacyPath}.legacy.bak`, "utf8")).toBe(legacyBytes);
    expect(migrateGitHubMaterializedAgent(home)).toEqual({ kind: "unchanged", path: canonicalPath });
  });

  it("archives a coexisting legacy file without replacing the canonical customization", () => {
    const home = mkdtempSync(join(tmpdir(), "agent-suite-home-"));
    const legacyPath = globalAgentPath("agent-especialit-github", home);
    const canonicalPath = globalAgentPath("agent-github", home);
    const legacyBytes = "---\nname: agent-especialit-github\ndescription: Legacy fallback\n---\nLegacy instructions.\n";
    const canonicalBytes = "---\nname: agent-github\ndescription: Canonical customization\n---\nCanonical instructions.\n";
    materializeGlobalAgent({ id: "agent-especialit-github", description: "Legacy", model: "openai/x", prompt: "Old", permissions: {}, skills: [] }, () => true, home);
    materializeGlobalAgent({ id: "agent-github", description: "Canonical", model: "openai/x", prompt: "New", permissions: {}, skills: [] }, () => true, home);
    writeFileSync(legacyPath, legacyBytes);
    writeFileSync(canonicalPath, canonicalBytes);

    expect(migrateGitHubMaterializedAgent(home)).toEqual({ kind: "unchanged", path: canonicalPath });
    expect(readFileSync(canonicalPath, "utf8")).toBe(canonicalBytes);
    expect(existsSync(legacyPath)).toBe(false);
    expect(readFileSync(`${legacyPath}.legacy.bak`, "utf8")).toBe(legacyBytes);
    expect(migrateGitHubMaterializedAgent(home)).toEqual({ kind: "unchanged", path: canonicalPath });
  });

  it("restores legacy bytes and mode when canonical promotion fails", () => {
    const home = mkdtempSync(join(tmpdir(), "agent-suite-home-"));
    const legacyPath = globalAgentPath("agent-especialit-github", home);
    materializeGlobalAgent({ id: "agent-especialit-github", description: "Legacy", model: "openai/x", prompt: "Old", permissions: {}, skills: [] }, () => true, home);
    const bytes = readFileSync(legacyPath, "utf8");
    chmodSync(legacyPath, 0o640);
    const originalMode = statSync(legacyPath).mode & 0o777;

    expect(() => migrateGitHubMaterializedAgent(home, () => { throw new Error("interrupted"); })).toThrow("interrupted");
    expect(readFileSync(legacyPath, "utf8")).toBe(bytes);
    expect(statSync(legacyPath).mode & 0o777).toBe(originalMode);
    expect(existsSync(globalAgentPath("agent-github", home))).toBe(false);
    expect(existsSync(`${legacyPath}.legacy.bak`)).toBe(false);
  });
});
