import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildIntegrationPlan } from "../src/core/skill-package.ts";
import { globalSkillPath, installSkill } from "../src/core/skill-install.ts";

const pkg = { id: "safe-skill", source: "remote" as const, files: [{ path: "SKILL.md", content: "---\nname: safe-skill\ndescription: Safe checks\n---\n# New\n" }, { path: "references/check.md", content: "new reference" }] };
const plan = () => buildIntegrationPlan(pkg, "active-agent");
const home = () => join(tmpdir(), `skill-install-${crypto.randomUUID()}`);

describe("safe global skill installation", () => {
  it("writes only ~/.config/opencode/skills/{id}/SKILL.md after approval, validation, then scoped assignment", async () => {
    const root = home(); const events: string[] = []; const auditPath = join(root, "audit.jsonl");
    expect(globalSkillPath("safe-skill", root)).toBe(join(root, ".config", "opencode", "skills", "safe-skill", "SKILL.md"));
    await expect(installSkill(plan(), { home: root, auditPath, approved: true, validate: async () => { events.push("validate"); }, assign: async (agent, skill) => { events.push(`${agent}:${skill}`); } })).resolves.toMatchObject({ path: globalSkillPath("safe-skill", root) });
    expect(readFileSync(globalSkillPath("safe-skill", root), "utf8")).toContain("# New");
    expect(events).toEqual(["validate", "active-agent:safe-skill"]);
    expect(readFileSync(auditPath, "utf8")).toContain('"outcome":"success"');
    await expect(installSkill(plan(), { home: root })).rejects.toThrow(/approval/i);
  });

  it("journals every existing file and restores bytes without assigning when post-install validation fails; audit stays append-only and redacted", async () => {
    const root = home(); const target = globalSkillPath("safe-skill", root); const reference = join(root, ".config", "opencode", "skills", "safe-skill", "references", "check.md");
    mkdirSync(join(root, ".config", "opencode", "skills", "safe-skill"), { recursive: true }); writeFileSync(target, "old skill");
    const auditPath = join(root, "audit.jsonl"); let assigned = false;
    await expect(installSkill(plan(), { home: root, auditPath, approved: true, validate: async () => { throw new Error("post-install failed"); }, assign: async () => { assigned = true; } })).rejects.toThrow(/post-install/i);
    expect([readFileSync(target, "utf8"), existsSync(reference), assigned, existsSync(target)]).toEqual(["old skill", false, false, true]);
    const audit = readFileSync(auditPath, "utf8"); expect(audit).toContain('"outcome":"failure"'); expect(audit).not.toContain("# New");
  });

  it("rejects a symbolic-link escape before it can write outside the approved skill directory", async () => {
    const root = home(); const outside = home(); const references = join(root, ".config", "opencode", "skills", "safe-skill", "references");
    mkdirSync(join(root, ".config", "opencode", "skills", "safe-skill"), { recursive: true }); mkdirSync(outside, { recursive: true }); symlinkSync(outside, references, "junction");
    await expect(installSkill(plan(), { home: root, approved: true, validate: async () => undefined, assign: async () => undefined })).rejects.toThrow(/symbolic/i);
    expect(existsSync(join(outside, "check.md"))).toBe(false);
  });
});
