export type PermissionValue = "allow" | "deny" | "ask";
export type AgentPermissions = Record<string, PermissionValue>;

export interface CustomAgent {
  id: string;
  description: string;
  model: string;
  variant?: string;
  prompt: string;
  permissions: AgentPermissions;
  skills: string[];
  materializeGlobal?: boolean;
}

export interface BaseAgentOverride {
  description?: string;
  skills?: string[];
  operations?: string;
}

export type BuiltInClassification = "public" | "internal";
export type BuiltInCuration = "curated" | "pending-curation";

export interface BuiltInBaseline {
  description: string;
  model: string;
  effort: string;
  operations: string;
  skills: readonly string[];
}

export interface BuiltInDefinition {
  id: string;
  displayName: string;
  classification: BuiltInClassification;
  curation: BuiltInCuration;
  baseline: BuiltInBaseline;
  warnings?: readonly string[];
}

export interface BuiltInOverride extends BaseAgentOverride {
  model?: string;
  effort?: string;
}

export interface AdvancedOverrides {
  allowInternalDisable?: boolean;
}

export interface BuiltInRuntimeAgent {
  model?: string;
  variant?: string;
  description?: string;
  skills?: string[];
  prompt?: string;
}

export interface SuiteConfig {
  version: 1;
  customAgents: Record<string, CustomAgent>;
  modelAssignments: Record<string, string>;
  variantAssignments: Record<string, string>;
  builtInOverrides?: Record<string, BuiltInOverride>;
  disabledAgents?: string[];
  advancedOverrides?: AdvancedOverrides;
  /** Preserved only while reading and writing legacy configuration files. */
  coordinator?: unknown;
}

export interface AgentCatalogRow {
  id: string;
  membership: "seed" | "custom";
  enabled: boolean;
  model?: string;
  skills: string[];
  consent: "explicit-current-turn";
  description?: string;
  variant?: string;
  disabled?: boolean;
  operations?: string;
}

export interface RuntimeMessage { sessionID: string; messageID: string; role?: string; parts?: unknown[]; text?: string; }
export interface SessionGrant {
  id: string;
  sessionID: string;
  requester: string;
  target: string;
  purpose: string;
  operation: string;
  duration: "current-session";
}
export interface TaskGateInput {
  sessionAgent?: string;
  target: string;
  sessionID: string;
  messageID: string;
  knownAgents?: readonly string[];
  ledger?: { has(sessionID: string, requester: string, target: string): boolean };
}
export interface TaskGateDecision { allowed: boolean; reason?: string; }
