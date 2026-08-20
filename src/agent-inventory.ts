import { getOrchestratorPolicy } from "./orchestrator";
import {
  isFallbackEligibleSddAgent,
  isManagedSddAgent,
  isSddFallbackAgent,
} from "./utils";

export const AGENT_FAMILY = {
  SDD: "sdd",
  JUDGMENT_DAY: "judgment-day",
  REVIEW: "review",
  FALLBACK: "fallback",
  BUILTIN: "builtin",
  CUSTOM: "custom",
} as const;

export type AgentFamily = typeof AGENT_FAMILY[keyof typeof AGENT_FAMILY];

export const CONFIGURABLE_BUILTIN_AGENTS = [
  "general",
  "explore",
  "compaction",
  "summary",
  "title",
] as const;

export const EXCLUDED_BUILTIN_AGENTS = ["plan", "build"] as const;

export const KNOWN_BUILTIN_AGENTS = [
  ...CONFIGURABLE_BUILTIN_AGENTS,
  ...EXCLUDED_BUILTIN_AGENTS,
] as const;

const configurableBuiltins = new Set<string>(CONFIGURABLE_BUILTIN_AGENTS);
const knownBuiltins = new Set<string>(KNOWN_BUILTIN_AGENTS);

export type AgentClassification = {
  family: AgentFamily;
  configurable: boolean;
  fallbackEligible: boolean;
};

export type AgentInventoryEntry = AgentClassification & {
  name: string;
  aliases: string[];
  loaded: boolean;
  profilePresent: boolean;
};

export type AgentInventoryInput = {
  loadedAgentNames?: readonly string[];
  profileAgentNames?: readonly string[];
  defaultAgent?: string;
};

export function classifyAgentName(agentName: string): AgentClassification {
  if (isSddFallbackAgent(agentName)) {
    return { family: AGENT_FAMILY.FALLBACK, configurable: true, fallbackEligible: false };
  }

  if (isManagedSddAgent(agentName)) {
    const family = agentName.startsWith("jd-")
      ? AGENT_FAMILY.JUDGMENT_DAY
      : agentName.startsWith("review-")
        ? AGENT_FAMILY.REVIEW
        : AGENT_FAMILY.SDD;
    return { family, configurable: true, fallbackEligible: isFallbackEligibleSddAgent(agentName) };
  }

  if (knownBuiltins.has(agentName)) {
    return {
      family: AGENT_FAMILY.BUILTIN,
      configurable: configurableBuiltins.has(agentName),
      fallbackEligible: false,
    };
  }

  return { family: AGENT_FAMILY.CUSTOM, configurable: true, fallbackEligible: false };
}

export function buildAgentInventory({
  loadedAgentNames = [],
  profileAgentNames = [],
  defaultAgent,
}: AgentInventoryInput): AgentInventoryEntry[] {
  const loaded = new Set(loadedAgentNames.filter(Boolean));
  const profilePresent = new Set(profileAgentNames.filter(Boolean));
  const observedNames = Array.from(new Set([...loaded, ...profilePresent]));
  const policy = getOrchestratorPolicy(observedNames, defaultAgent);
  const inventory = new Map<string, AgentInventoryEntry>();

  for (const observedName of observedNames) {
    const isOrchestratorAlias = policy.aliasNames.some((alias) => alias === observedName);
    const name = isOrchestratorAlias ? policy.canonicalName : observedName;
    const current = inventory.get(name);

    if (current) {
      if (!current.aliases.includes(observedName)) current.aliases.push(observedName);
      current.loaded ||= loaded.has(observedName);
      current.profilePresent ||= profilePresent.has(observedName);
      continue;
    }

    inventory.set(name, {
      name,
      aliases: [observedName],
      loaded: loaded.has(observedName),
      profilePresent: profilePresent.has(observedName),
      ...classifyAgentName(name),
    });
  }

  return Array.from(inventory.values());
}
