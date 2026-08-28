import type { PermissionValue, TaskGateDecision, TaskGateInput } from "./types.ts";
import { normalizeAgentId } from "./built-in-agents.ts";
export { ConsentLedger } from "./grants.ts";

export const SDD_AGENT_ALLOWLIST = [
  "sdd-init", "sdd-explore", "sdd-onboard", "sdd-propose", "sdd-spec",
  "sdd-design", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive",
] as const;

const SDD_FALLBACK_AGENT_ALLOWLIST = [
  "sdd-init-fallback", "sdd-explore-fallback", "sdd-onboard-fallback", "sdd-propose-fallback", "sdd-spec-fallback",
  "sdd-design-fallback", "sdd-tasks-fallback", "sdd-apply-fallback", "sdd-verify-fallback", "sdd-archive-fallback",
] as const;

const REVIEW_AGENT_ALLOWLIST = [
  "review-readability", "review-readability-fallback",
  "review-refuter", "review-refuter-fallback",
  "review-reliability", "review-reliability-fallback",
  "review-resilience", "review-resilience-fallback",
  "review-risk", "review-risk-fallback",
] as const;

const JUDGMENT_DAY_AGENT_ALLOWLIST = [
  "jd-fix-agent", "jd-fix-agent-fallback",
  "jd-judge-a", "jd-judge-a-fallback",
  "jd-judge-b", "jd-judge-b-fallback",
] as const;

/** Exact names owned by the internal Gentle-AI orchestration system. */
export const INTERNAL_AGENT_ALLOWLIST = [
  ...SDD_AGENT_ALLOWLIST,
  ...SDD_FALLBACK_AGENT_ALLOWLIST,
  ...REVIEW_AGENT_ALLOWLIST,
  ...JUDGMENT_DAY_AGENT_ALLOWLIST,
] as const;
export const SDD_ORCHESTRATOR = "gentle-orchestrator";
const INTERNAL_MEMORY_AGENTS = new Set(["compaction", "title", "summary"]);
const READ_ONLY_GIT_COMMANDS = [
  /^git status(?: --short)?$/,
  /^git diff(?: --cached)?$/,
  /^git log(?: -\d+)?$/,
  /^git show HEAD$/,
  /^git branch --show-current$/,
];

export function internalAgentPermissions(id: string): Record<string, PermissionValue> {
  if (!INTERNAL_MEMORY_AGENTS.has(id)) return { "*": "deny" };
  return { "*": "deny", read: "allow", edit: "deny", task: "deny", bash: "deny", memory: "allow", audit: "allow" };
}

export function decideInternalCommand(id: string, command: string): TaskGateDecision {
  if (!INTERNAL_MEMORY_AGENTS.has(id)) return { allowed: false, reason: "Internal command access is unavailable." };
  return READ_ONLY_GIT_COMMANDS.some((pattern) => pattern.test(command.trim()))
    ? { allowed: true, reason: "read-only command allowlist" }
    : { allowed: false, reason: "Command is not in the read-only allowlist." };
}

export type InternalMemoryCapture = { sessionID: string; kind: "compaction" | "title" | "summary"; content: string };

export function createInternalMemoryAudit(write: (entry: InternalMemoryCapture) => Promise<void>) {
  const seen = new Set<string>();
  return {
    async capture(sessionID: string, kind: InternalMemoryCapture["kind"], content: string): Promise<{ status: "captured" | "duplicate" | "unavailable" }> {
      const fingerprint = `${sessionID}:${kind}:${content}`;
      if (seen.has(fingerprint)) return { status: "duplicate" };
      try {
        await write({ sessionID, kind, content });
        seen.add(fingerprint);
        return { status: "captured" };
      } catch {
        return { status: "unavailable" };
      }
    },
  };
}

export function isAuthorizedInternalAgent(target: string): boolean {
  return (INTERNAL_AGENT_ALLOWLIST as readonly string[]).includes(target);
}

export function decideTaskGate(input: TaskGateInput & { disabledAgents?: readonly string[]; knownAgents?: readonly string[] }): TaskGateDecision {
  const target = normalizeAgentId(input.target);
  const knownAgents = input.knownAgents?.map(normalizeAgentId);
  if (input.disabledAgents?.map(normalizeAgentId).includes(target)) return { allowed: false, reason: `Disabled agent '${target}' cannot be dispatched.` };
  if (input.sessionAgent !== SDD_ORCHESTRATOR) return { allowed: true, reason: "suite policy is scoped to gentle-orchestrator" };
  if (isAuthorizedInternalAgent(target)) return { allowed: true, reason: "exact internal allowlist" };
  if (knownAgents && knownAgents.includes(target)) {
    return { allowed: true, reason: "registered suite agent direct dispatch" };
  }
  if (input.ledger?.has(input.sessionID, input.sessionAgent, target)) return { allowed: true, reason: "active session grant" };
  return { allowed: false, reason: `Blocked agent '${target}': target is unknown or unregistered.` };
}

export function transformTaskPermission(
  disabledAgents: readonly string[] = [],
  registeredAgents: readonly string[] = [],
): Record<string, PermissionValue> {
  const disabled = new Set(disabledAgents.map(normalizeAgentId));
  const registered = registeredAgents.map(normalizeAgentId).filter((agent) => !disabled.has(agent));
  return {
    "*": "deny",
    ...Object.fromEntries(
      INTERNAL_AGENT_ALLOWLIST.filter((agent) => !disabled.has(agent)).map(
        (agent): [string, PermissionValue] => [agent, agent.endsWith("-fallback") ? "ask" : "allow"]
      )
    ),
    "general": "deny",
    ...Object.fromEntries(
      registered
        .filter((agent) => !isAuthorizedInternalAgent(agent) && agent !== SDD_ORCHESTRATOR)
        .map((agent): [string, PermissionValue] => [agent, agent.endsWith("-fallback") ? "ask" : "allow"])
    ),
  };
}
