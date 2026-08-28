/** @jsxImportSource @opentui/solid */
/**
 * Shared Types for SDD Model Select Plugin
 */

/**
 * Represents the currently active profile's configuration
 */
export type ActiveProfileState = {
  modelId: string;
  contextLimit: number | null;
  providerName: string;
  modelName: string;
  profileName?: string;
  reasoningEffort?: string;
};

export type BadgeDisplayMode = "model" | "profile";

export type DialogSize = "medium" | "large" | "xlarge";
export type AgentFamily = "Orchestrator" | "SDD" | "JD" | "Review" | "Tools" | "Fallbacks" | "Custom";
export type AssignmentField = "model" | "fallback";
export type RuntimeAgentClass = "reserved" | "primary" | "fallback";

export type PersistibleAgentKey =
  | "sdd-ORCHETATOR"
  | "sdd-propose"
  | "sdd-design"
  | "sdd-apply"
  | "sdd-verify"
  | "sdd-spec"
  | "sdd-onboard"
  | "sdd-explore"
  | "sdd-init"
  | "sdd-tasks"
  | "sdd-archive"
  | "jd-judge-a"
  | "jd-judge-b"
  | "jd-fix-agent"
  | "review-readability"
  | "review-reliability"
  | "review-resilience"
  | "review-validator"
  | "review-refuter"
  | "review-risk"
  | "model-audit"
  | "gentle-ai-windows-validator"
  | "compaction"
  | "summary"
  | "title";

export type CatalogGroup = {
  id: string;
  labelEs: string;
  agents: readonly PersistibleAgentKey[];
};

export type DialogCatalogRow = { kind: "agent"; key: PersistibleAgentKey };

export type AgentOrderMetadata = {
  family: AgentFamily;
  knownIndex: number | null;
};

export type RuntimeAgentInventoryItem = {
  runtimeName: string;
  profileKey: string;
  field: AssignmentField;
  classification: RuntimeAgentClass;
  order: AgentOrderMetadata;
  managedSdd: boolean;
  fallbackEligible: boolean;
};

/** A runtime-derived primary profile field eligible for profile-wide configuration. */
export type ConfigurableProfileTarget = Pick<RuntimeAgentInventoryItem, "profileKey" | "field">;

export type CatalogEntry = {
  displayName: string;
  profileKey: string;
  field: AssignmentField;
  family: AgentFamily;
  base: boolean;
  isFallback: boolean;
  orderIndex: number;
};

/**
 * Mapping of profile names to their model identifiers
 */
export type ProfileModels = Record<string, string>;

/**
 * Mapping of fallback model overrides by base SDD agent name
 */
export type ProfileFallbackModels = Record<string, string>;

export type ProfileAgentConfig = {
  reasoningEffort?: string;
};

/**
 * Agent-name keyed reasoning configuration. Fallback effort is stored using
 * the runtime fallback agent key (`${primary}-fallback`) to keep it separate
 * from the primary agent's reasoning configuration.
 */
export type ProfileConfigs = Record<string, ProfileAgentConfig>;

/**
 * Full profile payload persisted to disk
 */
export type ProfileData = {
  models: ProfileModels;
  fallback?: ProfileFallbackModels;
  configs?: ProfileConfigs;
};

export const BULK_ASSIGNMENT_TARGET = {
  PRIMARY: "primary",
  FALLBACK: "fallback",
  BOTH: "both",
} as const;

export type BulkAssignmentTarget = (typeof BULK_ASSIGNMENT_TARGET)[keyof typeof BULK_ASSIGNMENT_TARGET];

export const BULK_ASSIGNMENT_MODE = {
  FILL_ONLY: "fill-only",
  OVERWRITE: "overwrite",
} as const;

export type BulkAssignmentMode = (typeof BULK_ASSIGNMENT_MODE)[keyof typeof BULK_ASSIGNMENT_MODE];

export type BulkAssignmentOperation = {
  target: BulkAssignmentTarget;
  mode: BulkAssignmentMode;
};

export const PROFILE_VERSION_SOURCE = {
  BULK: "bulk",
  PHASE: "phase",
} as const;

export type ProfileVersionSource = (typeof PROFILE_VERSION_SOURCE)[keyof typeof PROFILE_VERSION_SOURCE];

export const PROFILE_PHASE_MODEL_FIELD = {
  PRIMARY: "primary",
  FALLBACK: "fallback",
} as const;

export type ProfilePhaseModelField = (typeof PROFILE_PHASE_MODEL_FIELD)[keyof typeof PROFILE_PHASE_MODEL_FIELD];

export type PendingModelSelection = {
  agentName: string;
  field: ProfilePhaseModelField;
  modelId: string;
};

export type StagedModelSelection = {
  pending: PendingModelSelection;
  modelChanged: boolean;
  requestReasoningEffort: boolean;
};

export type BulkProfileVersionOperation = BulkAssignmentOperation & {
  source: typeof PROFILE_VERSION_SOURCE.BULK;
  changedPhases?: number;
};

export type PhaseProfileVersionOperation = {
  source: typeof PROFILE_VERSION_SOURCE.PHASE;
  phase: string;
  field: ProfilePhaseModelField;
  modelId: string;
  changedPhases: 1;
};

export type ProfileVersionOperation = BulkProfileVersionOperation | PhaseProfileVersionOperation;

export type BulkProfilePhaseAssignmentResult = {
  profile: ProfileData;
  modelsAssigned: number;
  fallbackAssigned: number;
  changed: boolean;
};

export type ProfileVersionPreview = {
  models: ProfileModels;
  fallback: ProfileFallbackModels;
  configs?: ProfileConfigs;
};

export type ProfileVersion = {
  version: 1;
  id: string;
  profileFile: string;
  createdAt: string;
  source: ProfileVersionSource;
  operation: ProfileVersionOperation;
  operationSummary: string;
  beforeRaw: string;
  preview: ProfileVersionPreview;
};

export type UpdateProfilePhaseModelResult = {
  profile: ProfileData;
  changed: boolean;
  version?: ProfileVersion;
  versionId?: string;
  context?: ModelMutationContext;
};

export type BulkProfileOverwriteResult = {
  profile: ProfileData;
  modelsAssigned: number;
  effortsAssigned: number;
  changed: boolean;
};

export type ProfileWriteOptions = {
  preserveProviderDefaultReasoning?: boolean;
};

export type ProfileVersionMetadata = Omit<ProfileVersion, "beforeRaw">;

export type ModelMutationEffortPolicy = "interactive-clear" | "bulk-compatible-prune" | "none";

export type ModelMutationContext = {
  providers: unknown[];
  runtimePrimaryNames?: readonly string[];
  effortPolicy: ModelMutationEffortPolicy;
};

export type ProfileWriteTransaction = {
  profile: ProfileData;
  changed: boolean;
  version?: ProfileVersion;
  versionId?: string;
  context: ModelMutationContext;
};

/**
 * Represents the persistent state of profiles
 */
export type ProfileState = {
  activeProfile?: string;
  updatedAt?: string;
};

/**
 * Represents an observation from the Engram memory system
 */
export type EngramObservation = {
  id: number;
  type: string;
  title?: string;
  topic_key?: string;
  content?: string;
  project: string;
  scope?: string;
  updated_at?: string;
  created_at?: string;
};

/**
 * Represents a selectable profile option in a menu
 */
export type ProfileOption = {
  title: string;
  value: string;
};

/**
 * Navigation separator category string
 */
export const NAV_CATEGORY = "─────────────";
