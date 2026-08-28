import type { BuiltInDefinition, BuiltInOverride, BuiltInRuntimeAgent } from "./types.ts";

const PUBLIC_IDS = ["general", "build", "plan", "explore"] as const;
const INTERNAL_IDS = ["compaction", "title", "summary"] as const;
const EXCLUDED_PREFIXES = ["sdd-", "review-", "jd-"];
const EXCLUDED_IDS = new Set(["gentle-orchestrator"]);

export const GITHUB_AGENT_ID = "agent-github";
export const GITHUB_AGENT_LEGACY_ID = "agent-especialit-github";

/** Maps persisted compatibility aliases to the one runtime identity. */
export function normalizeAgentId(id: string): string {
  return id === GITHUB_AGENT_LEGACY_ID ? GITHUB_AGENT_ID : id;
}

export function mergeCanonicalAgent<T extends object>(canonical?: T, legacy?: T): T | undefined {
  if (!canonical) return legacy ? { ...legacy } : undefined;
  return legacy ? { ...legacy, ...canonical } : { ...canonical };
}

function baseline(description: string, operations: string, skills: string[], model = "opencode/default", effort = "medium") {
  return Object.freeze({ description, model, effort, operations, skills: Object.freeze([...skills]) });
}

function definition(
  id: string,
  displayName: string,
  classification: "public" | "internal",
  description: string,
  operations: string,
  skills: string[],
): BuiltInDefinition {
  return Object.freeze({
    id,
    displayName,
    classification,
    curation: "curated",
    baseline: baseline(description, operations, skills),
  });
}

export const CANONICAL_BUILT_IN_AGENTS: readonly BuiltInDefinition[] = Object.freeze([
  definition("general", "General", "public", "Agente general para coordinar solicitudes de producto.", "Aclara objetivos y coordina trabajo sin sustituir especialistas.", ["planning"]),
  definition("build", "Build", "public", "Agente de implementación de cambios de código verificables.", "Implementa cambios pequeños, ejecuta pruebas y comunica evidencia.", ["testing"]),
  definition("plan", "Plan", "public", "Agente de planificación técnica y descomposición de cambios.", "Propone pasos, riesgos y límites antes de modificar código.", ["planning"]),
  definition("explore", "Explore", "public", "Agente de investigación estructural del código existente.", "Inspecciona dependencias y devuelve hallazgos respaldados por evidencia.", ["research"]),
  definition("compaction", "Compaction", "internal", "Agente interno de conservación silenciosa del contexto de sesión.", "Captura memoria durable y auditoría contextual sin editar ni delegar.", []),
  definition("title", "Title", "internal", "Agente interno para crear títulos breves de sesión.", "Genera títulos con lecturas permitidas y auditoría silenciosa, sin efectos secundarios.", []),
  definition("summary", "Summary", "internal", "Agente interno para resumir resultados durables de sesión.", "Resume contexto y registra auditoría silenciosa sin editar ni ejecutar shell libre.", []),
]);

export const CANONICAL_BUILT_IN_AGENT_IDS = Object.freeze(CANONICAL_BUILT_IN_AGENTS.map((agent) => agent.id));

const canonicalByID = new Map(CANONICAL_BUILT_IN_AGENTS.map((agent) => [agent.id, agent]));

export function getBuiltInDefinition(id: string): BuiltInDefinition | undefined {
  return canonicalByID.get(normalizeAgentId(id));
}

export function isCanonicalBuiltInAgent(id: string): boolean {
  return canonicalByID.has(normalizeAgentId(id));
}

export function isInternalBuiltInAgent(id: string): boolean {
  return (INTERNAL_IDS as readonly string[]).includes(id);
}

export function createPendingBuiltInDefinition(id: string): BuiltInDefinition {
  const displayName = id.replace(/(?:^|-)([a-z0-9])/g, (_, character: string) => character.toUpperCase());
  return Object.freeze({
    id,
    displayName,
    classification: "public",
    curation: "pending-curation",
    baseline: baseline(
      "Agente integrado detectado pendiente de curación.",
      "No se han definido operaciones curadas para este agente.",
      [],
    ),
    warnings: Object.freeze(["Este agente está pendiente de curación; no se hacen afirmaciones sobre sus capacidades."]),
  });
}

export function isDiscoverableBuiltInAgent(id: string, customIDs: readonly string[] = []): boolean {
  const normalized = normalizeAgentId(id);
  return !canonicalByID.has(normalized)
    && !EXCLUDED_IDS.has(id)
    && !customIDs.map(normalizeAgentId).includes(normalized)
    && !EXCLUDED_PREFIXES.some((prefix) => id.startsWith(prefix))
    && !id.endsWith("-fallback");
}

export function discoverBuiltInAgents(
  runtime: Record<string, BuiltInRuntimeAgent>,
  customIDs: readonly string[] = [],
): BuiltInDefinition[] {
  return Object.keys(runtime)
    .filter((id) => isDiscoverableBuiltInAgent(id, customIDs))
    .sort((left, right) => left.localeCompare(right))
    .map(createPendingBuiltInDefinition);
}

export function restoreBuiltInBaseline(
  id: string,
  overrides: Record<string, BuiltInOverride> = {},
): Record<string, BuiltInOverride> {
  if (!isCanonicalBuiltInAgent(id)) throw new Error(`Unknown built-in agent: ${id}`);
  const restored = { ...overrides };
  delete restored[id];
  return restored;
}

export const BUILT_IN_AGENT_CLASSES = Object.freeze({ public: PUBLIC_IDS, internal: INTERNAL_IDS });
