import { validateAgentId, validateSkillId } from "./config.ts";

export type SkillFile = { path: string; content: string };
export type SkillPackage = { id: string; source: "remote" | "generated"; files: readonly SkillFile[] };
export type IntegrationPlan = Readonly<{ pkg: Readonly<SkillPackage>; agentId: string; assignment: Readonly<{ agentId: string; skillId: string }>; paths: readonly string[] }>;

const DENIED_CONTENT = [/\brm\s+(?:-[^\n]*r[^\n]*f|--recursive)/i, /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sh|bash|zsh)\b/i, /\b(?:sh|bash|zsh)\s+-c\b/i, /\b(?:powershell|pwsh)\b[^\n]*-(?:command|enc)/i, /\b(?:child_process\.)?(?:exec|spawn|execSync|spawnSync)\s*\(/i];

function validatePath(path: string): void {
  if (typeof path !== "string" || !path || path.includes("\\") || path.startsWith("/") || /^[a-z]:/i.test(path) || path.startsWith("//") || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Invalid skill package path.");
}

function validateFrontmatter(id: string, content: string): void {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error("Invalid skill frontmatter.");
  const fields = Object.fromEntries(match[1].split(/\r?\n/).map((line) => line.match(/^([a-z][a-z-]*):\s*(.+)$/)?.slice(1) ?? []).filter((entry) => entry.length === 2));
  if (fields.name !== id || typeof fields.description !== "string" || !fields.description.trim()) throw new Error("Invalid skill frontmatter.");
}

export function validateSkillPackage(value: SkillPackage): SkillPackage {
  if (!value || typeof value !== "object" || (value.source !== "remote" && value.source !== "generated") || !Array.isArray(value.files)) throw new Error("Invalid skill package.");
  const id = validateSkillId(value.id); const paths = new Set<string>();
  for (const file of value.files) {
    validatePath(file?.path);
    if (typeof file.content !== "string" || !file.content) throw new Error("Invalid skill package file.");
    if (paths.has(file.path)) throw new Error("Duplicate skill package path.");
    paths.add(file.path);
    if (DENIED_CONTENT.some((pattern) => pattern.test(file.content))) throw new Error("Skill package failed security validation.");
  }
  const manifest = value.files.find((file) => file.path === "SKILL.md");
  if (!manifest) throw new Error("Skill package must include SKILL.md.");
  validateFrontmatter(id, manifest.content);
  return { id, source: value.source, files: value.files.map((file) => ({ path: file.path, content: file.content })) };
}

export function buildIntegrationPlan(pkg: SkillPackage, agentId: string): IntegrationPlan {
  const validated = validateSkillPackage(pkg); const target = validateAgentId(agentId);
  const files = Object.freeze(validated.files.map((file) => Object.freeze({ ...file })));
  const frozenPackage = Object.freeze({ ...validated, files }); const paths = Object.freeze(files.map((file) => file.path));
  return Object.freeze({ pkg: frozenPackage, agentId: target, assignment: Object.freeze({ agentId: target, skillId: frozenPackage.id }), paths });
}
