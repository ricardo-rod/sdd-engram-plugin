import type {
  AgentFamily,
  AssignmentField,
  CatalogGroup,
  CatalogEntry,
  ConfigurableProfileTarget,
  DialogCatalogRow,
  PersistibleAgentKey,
  ProfileData,
  RuntimeAgentInventoryItem,
} from "./types";
import {
  isEditablePrimaryAgent,
  isFallbackEligibleSddAgent,
  isPrimarySddAgent,
  RESERVED_RUNTIME_AGENT_NAMES,
} from "./utils";

const CATALOG_AGENT_GROUPS = [
  ["sdd-ORCHETATOR"],
  [
    "sdd-propose",
    "sdd-design",
    "sdd-apply",
    "sdd-verify",
    "sdd-spec",
    "sdd-onboard",
    "sdd-explore",
    "sdd-init",
    "sdd-tasks",
    "sdd-archive",
  ],
  ["jd-judge-a", "jd-judge-b", "jd-fix-agent"],
  [
    "review-readability",
    "review-reliability",
    "review-resilience",
    "review-validator",
    "review-refuter",
    "review-risk",
    "model-audit",
  ],
  ["gentle-ai-windows-validator", "compaction", "summary", "title"],
] as const satisfies readonly (readonly PersistibleAgentKey[])[];

export const CATALOG_GROUPS = [
  {
    id: "orchestrator",
    labelEs: "Orquestador",
    agents: CATALOG_AGENT_GROUPS[0],
  },
  {
    id: "sdd-core",
    labelEs: "Núcleo SDD",
    agents: CATALOG_AGENT_GROUPS[1],
  },
  {
    id: "judgment-day",
    labelEs: "Judgment Day",
    agents: CATALOG_AGENT_GROUPS[2],
  },
  {
    id: "reviewers",
    labelEs: "Revisores",
    agents: CATALOG_AGENT_GROUPS[3],
  },
  {
    id: "auxiliaries",
    labelEs: "Auxiliares",
    agents: CATALOG_AGENT_GROUPS[4],
  },
] as const satisfies readonly CatalogGroup[];

export const PERSISTIBLE_AGENT_KEYS: readonly PersistibleAgentKey[] = CATALOG_GROUPS.flatMap(
  (group) => group.agents,
);

export const VISIBLE_CATALOG_ROWS: readonly DialogCatalogRow[] = CATALOG_GROUPS.flatMap(
  (group): DialogCatalogRow[] => group.agents.map((key) => ({ kind: "agent" as const, key })),
);

const RUNTIME_SYNC_EXCLUDED_KEYS = new Set<PersistibleAgentKey>([
  "sdd-ORCHETATOR",
  "compaction",
  "summary",
  "title",
]);

const FALLBACK_EXCLUDED_CATALOG_KEYS = new Set<PersistibleAgentKey>([
  "compaction",
  "summary",
  "title",
]);

export const RUNTIME_SYNC_AGENT_KEYS: readonly PersistibleAgentKey[] = PERSISTIBLE_AGENT_KEYS.filter(
  isRuntimeSyncCatalogAgent,
);

export function isRuntimeSyncCatalogAgent(key: string): boolean {
  return !RUNTIME_SYNC_EXCLUDED_KEYS.has(key as PersistibleAgentKey);
}

export function isFallbackCatalogAgent(key: string): boolean {
  return !FALLBACK_EXCLUDED_CATALOG_KEYS.has(key as PersistibleAgentKey);
}

export const CANONICAL_PRIMARY_ORDER: readonly string[] = [
  "gentle-orchestrator",
  "sdd-init",
  "sdd-explore",
  "sdd-propose",
  "sdd-spec",
  "sdd-design",
  "sdd-tasks",
  "sdd-apply",
  "sdd-verify",
  "sdd-archive",
  "sdd-onboard",
  "jd-judge-a",
  "jd-judge-b",
  "jd-fix-agent",
  "review-risk",
  "review-readability",
  "review-reliability",
  "review-resilience",
  "review-refuter",
  "review-validator",
  "model-audit",
] as const;

/** Canonical managed primaries retained for fallback synchronization only. */
export const FALLBACK_SYNC_BASE_ORDER: readonly string[] = CANONICAL_PRIMARY_ORDER.filter(isFallbackEligibleSddAgent);

export const CANONICAL_FALLBACK_ORDER: readonly string[] = [
  "jd-fix-agent-fallback",
  "jd-judge-a-fallback",
  "jd-judge-b-fallback",
  "review-readability-fallback",
  "review-refuter-fallback",
  "review-reliability-fallback",
  "review-resilience-fallback",
  "review-risk-fallback",
  "review-validator-fallback",
  "sdd-apply-fallback",
  "sdd-archive-fallback",
  "sdd-design-fallback",
  "sdd-explore-fallback",
  "sdd-init-fallback",
  "sdd-onboard-fallback",
  "sdd-propose-fallback",
  "sdd-spec-fallback",
  "sdd-tasks-fallback",
  "sdd-verify-fallback",
] as const;

/** Known names used only for deterministic presentation metadata. */
export const KNOWN_PRESENTATION_ORDER: readonly string[] = [
  ...CANONICAL_PRIMARY_ORDER,
  ...CANONICAL_FALLBACK_ORDER,
] as const;

/** Compatibility export for callers that still need the old fallback sync set. */
export const BASE_CANONICAL_ORDER = KNOWN_PRESENTATION_ORDER;

export const FALLBACK_MANAGED_COUNT = CANONICAL_FALLBACK_ORDER.length;

const FAMILY_ORDER: readonly AgentFamily[] = [
  "Orchestrator",
  "SDD",
  "JD",
  "Review",
  "Tools",
  "Fallbacks",
  "Custom",
];

const KNOWN_PRESENTATION_INDEX = new Map(
  KNOWN_PRESENTATION_ORDER.map((name, index) => [name, index] as const)
);

export function isValidAgentKey(k: unknown): boolean {
  if (typeof k !== "string") return false;
  if (k.length < 1 || k.length > 64) return false;
  if (k === "__proto__" || k === "constructor" || k === "prototype") return false;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(k)) return false;
  return true;
}

export function deriveFallbackProfileKey(displayName: string): string | null {
  if (typeof displayName !== "string") return null;
  if (!isValidAgentKey(displayName)) return null;
  if (!displayName.endsWith("-fallback")) return null;
  const primary = displayName.slice(0, -9);
  if (!isValidAgentKey(primary)) return null;
  if (!isFallbackEligibleSddAgent(primary)) return null;
  return primary;
}

export function classifyFamily(e: { displayName: string; isFallback: boolean; base: boolean }): AgentFamily {
  if (e.isFallback || e.displayName.endsWith("-fallback")) return "Fallbacks";
  if (e.displayName === "gentle-orchestrator") return "Orchestrator";
  if (e.displayName === "model-audit" || e.displayName === "gentle-ai-windows-validator") return "Tools";
  if (!e.base) return "Custom";
  if (e.displayName.startsWith("sdd-")) return "SDD";
  if (e.displayName.startsWith("jd-")) return "JD";
  if (e.displayName.startsWith("review-")) return "Review";
  return "Custom";
}

function isRuntimeConfigRecord(config: unknown): config is { agent?: Record<string, unknown> } {
  return Boolean(config && typeof config === "object" && !Array.isArray(config));
}

function getKnownIndex(name: string): number | null {
  return KNOWN_PRESENTATION_INDEX.get(name) ?? null;
}

function isRuntimeFallbackName(name: string): boolean {
  return name.endsWith("-fallback");
}

function runtimeProfileKey(name: string, isFallback: boolean): string {
  return isFallback ? name.slice(0, -9) : name;
}

function classifyRuntimeFamily(name: string, isFallback: boolean, knownIndex: number | null): AgentFamily {
  return classifyFamily({
    displayName: name,
    isFallback,
    base: knownIndex !== null,
  });
}

export function classifyRuntimeAgent(name: string): RuntimeAgentInventoryItem | null {
  if (!isValidAgentKey(name) || RESERVED_RUNTIME_AGENT_NAMES.has(name)) return null;

  const isFallback = isRuntimeFallbackName(name);
  if (!isFallback && !isEditablePrimaryAgent(name)) return null;
  const knownIndex = getKnownIndex(name);
  const family = classifyRuntimeFamily(name, isFallback, knownIndex);
  const primaryName = runtimeProfileKey(name, isFallback);

  return {
    runtimeName: name,
    profileKey: primaryName,
    field: isFallback ? "fallback" : "model",
    classification: isFallback ? "fallback" : "primary",
    order: { family, knownIndex },
    managedSdd: !isFallback && isPrimarySddAgent(name),
    fallbackEligible: !isFallback && isFallbackEligibleSddAgent(name),
  };
}

function compareInventory(a: RuntimeAgentInventoryItem, b: RuntimeAgentInventoryItem): number {
  const familyDifference = FAMILY_ORDER.indexOf(a.order.family) - FAMILY_ORDER.indexOf(b.order.family);
  if (familyDifference !== 0) return familyDifference;

  if (a.order.knownIndex !== null && b.order.knownIndex !== null) {
    return a.order.knownIndex - b.order.knownIndex;
  }
  if (a.order.knownIndex !== null) return -1;
  if (b.order.knownIndex !== null) return 1;
  return a.runtimeName.localeCompare(b.runtimeName);
}

export function collectRuntimeAgentInventory(config: unknown): RuntimeAgentInventoryItem[] {
  const agentConfig = isRuntimeConfigRecord(config) &&
    config.agent &&
    typeof config.agent === "object" &&
    !Array.isArray(config.agent)
    ? config.agent
    : {};

  return Object.keys(agentConfig)
    .map(classifyRuntimeAgent)
    .filter((entry): entry is RuntimeAgentInventoryItem => entry !== null)
    .sort(compareInventory);
}

/** Projects runtime definitions into target-aware profile fields eligible for a bulk overwrite. */
export function collectConfigurableProfileTargets(
  config: unknown,
  target: "primary" | "fallback" = "primary",
): ConfigurableProfileTarget[] {
  if (target === "fallback") {
    return CANONICAL_FALLBACK_ORDER
      .map(deriveFallbackProfileKey)
      .filter((profileKey): profileKey is string => profileKey !== null)
      .map((profileKey) => ({ field: "fallback" as const, profileKey }));
  }

  const seen = new Set<string>();
  return collectRuntimeAgentInventory(config)
    .filter((entry) => entry.classification === "primary" && entry.field === "model")
    .filter((entry) => {
      const key = `${entry.field}:${entry.profileKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ field, profileKey }) => ({ field, profileKey }));
}

export function buildCatalogSections(config: unknown, _profileData?: ProfileData | null): Map<AgentFamily, CatalogEntry[]> {
  const map = new Map<AgentFamily, CatalogEntry[]>(FAMILY_ORDER.map((family) => [family, []]));

  for (const item of collectRuntimeAgentInventory(config)) {
    const entry: CatalogEntry = {
      displayName: item.runtimeName,
      profileKey: item.profileKey,
      field: item.field as AssignmentField,
      family: item.order.family,
      base: item.order.knownIndex !== null,
      isFallback: item.classification === "fallback",
      orderIndex: item.order.knownIndex ?? Number.POSITIVE_INFINITY,
    };
    map.get(entry.family)!.push(entry);
  }

  return map;
}
