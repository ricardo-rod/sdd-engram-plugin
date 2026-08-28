import { validateSkillId } from "./config.ts";

export type SkillSource = "installed" | "remote";
export type SkillCandidate = { id: string; name: string; description: string; source: SkillSource; registry?: "skills.sh" | "github" };
export type SkillRecommendation = { candidate: SkillCandidate; rationale: string } | { source: "generate"; rationale: string };
export type SkillConflict = { id: string; existing: string; incoming: string; actions: readonly ["replace", "keep", "rename"] };
export type SkillVariant = { id: string; label: string; baseId: string };
export type SkillConflictAction = SkillConflict["actions"][number];

function matches(skill: SkillCandidate, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  return !normalized || `${skill.id} ${skill.name} ${skill.description}`.toLocaleLowerCase().includes(normalized);
}

function availableId(base: string, existing: readonly string[]): string {
  const known = new Set(existing);
  if (!known.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!known.has(candidate)) return candidate;
  }
}

export function filterSkills(skills: readonly SkillCandidate[], query: string): SkillCandidate[] {
  return skills.filter((skill) => matches(skill, query));
}

export function recommendSkill(request: string, installed: readonly SkillCandidate[], remote: readonly SkillCandidate[]): SkillRecommendation {
  const installedMatch = filterSkills(installed, request)[0];
  if (installedMatch) return { candidate: installedMatch, rationale: `Installed skill matches “${request}”.` };
  const remoteMatch = filterSkills(remote, request).sort((left, right) => (left.registry === "skills.sh" ? 0 : 1) - (right.registry === "skills.sh" ? 0 : 1) || left.id.localeCompare(right.id))[0];
  if (remoteMatch) return { candidate: remoteMatch, rationale: `Verified ${remoteMatch.registry ?? "remote"} skill matches “${request}”.` };
  return { source: "generate", rationale: `No installed or verified remote skill matches “${request}”.` };
}

export function conflictForSkill(existing: SkillCandidate, incoming: SkillCandidate): SkillConflict | undefined {
  return existing.id === incoming.id ? { id: incoming.id, existing: existing.description, incoming: incoming.description, actions: ["replace", "keep", "rename"] } : undefined;
}

export function resolveSkillConflict(action: SkillConflictAction, existing: SkillCandidate, incoming: SkillCandidate, knownIds: readonly string[]): SkillCandidate {
  if (action === "keep") return existing;
  if (action === "replace") return incoming;
  const id = renameSkill(incoming.id, knownIds);
  return { ...incoming, id, name: id };
}

export function renameSkill(label: string, existing: readonly string[]): string {
  const base = label.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "skill";
  return availableId(validateSkillId(base), existing);
}

export function variantForSkill(existing: SkillCandidate, incoming: SkillCandidate, knownIds: readonly string[]): SkillVariant | undefined {
  if (existing.id !== incoming.id || existing.description === incoming.description) return undefined;
  const id = availableId(`${existing.id}-variant`, knownIds);
  const suffix = id.slice(`${existing.id}-variant`.length).replace(/^-/, "");
  return { id, label: `${existing.name} variant${suffix ? ` ${suffix}` : ""}`, baseId: existing.id };
}
