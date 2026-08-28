import type { AgentCatalogRow, BuiltInOverride, BuiltInRuntimeAgent, CustomAgent } from "./types.ts";
import { CANONICAL_BUILT_IN_AGENTS, getBuiltInDefinition, mergeCanonicalAgent, normalizeAgentId, restoreBuiltInBaseline } from "./built-in-agents.ts";

export const SUITE_DE_AGENTES_SEED = ["general", "build", "plan", "explore", "compaction", "title", "summary"] as const;

export function restoreBuiltInAgentOverride(
  id: string,
  overrides: Record<string, BuiltInOverride> = {},
): Record<string, BuiltInOverride> {
  return restoreBuiltInBaseline(id, overrides);
}

export function buildSuiteDeAgentesCatalog(
  runtime: Record<string, BuiltInRuntimeAgent>,
  custom: Record<string, CustomAgent>,
  seed: readonly string[] = SUITE_DE_AGENTES_SEED,
  modelAssignments: Record<string, string> = {},
  variantAssignments: Record<string, string> = {},
  builtInOverrides: Record<string, BuiltInOverride> = {},
  disabledAgents: readonly string[] = [],
): AgentCatalogRow[] {
  function normalizedRecords<T>(records: Record<string, T>): Record<string, T> {
    const normalized: Record<string, T> = {};
    for (const [id, value] of Object.entries(records)) {
      const canonicalID = normalizeAgentId(id);
      if (normalized[canonicalID] === undefined || canonicalID === id) normalized[canonicalID] = value;
    }
    return normalized;
  }
  function normalizedObjectRecords<T extends object>(records: Record<string, T>): Record<string, T> {
    const normalized: Record<string, T> = {};
    for (const [id, value] of Object.entries(records)) {
      const canonicalID = normalizeAgentId(id);
      normalized[canonicalID] = canonicalID === id
        ? mergeCanonicalAgent(value, normalized[canonicalID])!
        : mergeCanonicalAgent(normalized[canonicalID], value)!;
    }
    return normalized;
  }
  const seedIDs = new Set(seed.map(normalizeAgentId));
  const disabledIDs = new Set(disabledAgents.map(normalizeAgentId));
  const memberIDs = new Set([...seed, ...Object.keys(custom)].map(normalizeAgentId));
  const normalizedRuntime = normalizedObjectRecords(runtime);
  const normalizedCustom = normalizedObjectRecords(custom);
  const normalizedModels = normalizedRecords(modelAssignments);
  const normalizedVariants = normalizedRecords(variantAssignments);
  const normalizedOverrides = normalizedObjectRecords(builtInOverrides);
  return [...memberIDs].map((id): AgentCatalogRow => {
    const runtimeAgent = normalizedRuntime[id];
    const customAgent = normalizedCustom[id];
    const definition = getBuiltInDefinition(id);
    const override = normalizedOverrides[id] ?? {};
    const row: AgentCatalogRow = {
      id,
      membership: seedIDs.has(id) ? "seed" : "custom",
      enabled: runtimeAgent !== undefined && !disabledIDs.has(id),
      disabled: disabledIDs.has(id),
      skills: override.skills ? [...override.skills] : customAgent ? [...customAgent.skills] : runtimeAgent?.skills ? [...runtimeAgent.skills] : definition ? [...definition.baseline.skills] : [],
      consent: "explicit-current-turn",
    };
    const model = normalizedModels[id] ?? runtimeAgent?.model ?? customAgent?.model ?? definition?.baseline.model;
    const description = override.description ?? runtimeAgent?.description ?? customAgent?.description ?? definition?.baseline.description;
    const variant = normalizedVariants[id] ?? runtimeAgent?.variant ?? definition?.baseline.effort;
    const operations = override.operations ?? customAgent?.prompt ?? runtimeAgent?.prompt ?? definition?.baseline.operations;
    if (model !== undefined) row.model = model;
    if (description !== undefined) row.description = description;
    if (variant !== undefined) row.variant = variant;
    if (operations !== undefined) row.operations = operations;
    return row;
  }).sort((a, b) => a.id.localeCompare(b.id));
}
