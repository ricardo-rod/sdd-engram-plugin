import { ConsentLedger, registerMessageGrant } from "../core/grants.ts";
import { messageText, parseCanonicalConsent } from "../core/grants.ts";
import { decideTaskGate, SDD_ORCHESTRATOR, transformTaskPermission } from "../core/policy.ts";
import { defaultSuitePath, loadSuiteConfig } from "../core/persistence.ts";
import type { Config as PluginConfig, Plugin, PluginInput, PluginModule } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";
import type { Part } from "@opencode-ai/sdk";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { GITHUB_AGENT_ID, GITHUB_AGENT_LEGACY_ID, normalizeAgentId } from "../core/built-in-agents.ts";

type RuntimePermission = NonNullable<PluginConfig["permission"]> & {
  task?: Record<string, "allow" | "deny" | "ask">;
};

type RuntimeAgentConfig = {
  permission?: RuntimePermission;
  [key: string]: unknown;
};

type RuntimePluginConfig = PluginConfig & {
  permission?: RuntimePermission;
  agent?: Record<string, RuntimeAgentConfig | undefined>;
};

function applyRuntimeTaskPermission(
  config: PluginConfig,
  disabledAgents: readonly string[] = [],
  registeredAgents: readonly string[] = [],
): void {
  const runtimeConfig = config as RuntimePluginConfig;
  const taskPermission = transformTaskPermission(disabledAgents, registeredAgents);
  runtimeConfig.permission = {
    ...(runtimeConfig.permission ?? {}),
    task: taskPermission,
  };

  const orchestrator = runtimeConfig.agent?.[SDD_ORCHESTRATOR];
  if (!orchestrator || typeof orchestrator !== "object") return;
  const permission = orchestrator.permission;
  orchestrator.permission = {
    ...(permission && typeof permission === "object" ? permission : {}),
    task: taskPermission,
  };
}

function normalizeRuntimeAgentEntries(config: PluginConfig): void {
  const agents = (config as RuntimePluginConfig).agent;
  if (!agents?.[GITHUB_AGENT_LEGACY_ID]) return;
  const legacy = agents[GITHUB_AGENT_LEGACY_ID];
  const canonical = agents[GITHUB_AGENT_ID];
  agents[GITHUB_AGENT_ID] = { ...(legacy ?? {}), ...(canonical ?? {}) };
  delete agents[GITHUB_AGENT_LEGACY_ID];
}

export function applyRuntimeModelAssignments(config: PluginConfig, assignments: Record<string, string>, variants: Record<string, string> = {}): void {
  const runtimeConfig = config as RuntimePluginConfig;
  for (const [agentID, model] of Object.entries(assignments)) {
    const agent = runtimeConfig.agent?.[normalizeAgentId(agentID)];
    if (!agent || typeof agent !== "object") continue;
    agent.model = model;
    const variant = variants[agentID];
    if (variant === undefined) delete agent.variant;
    else agent.variant = variant;
  }
}

export function applyRuntimeBuiltInOverrides(config: PluginConfig, overrides: Record<string, { description?: string; skills?: string[]; operations?: string }>): void {
  const runtimeConfig = config as RuntimePluginConfig;
  for (const [agentID, override] of Object.entries(overrides)) {
    const agent = runtimeConfig.agent?.[normalizeAgentId(agentID)];
    if (!agent || typeof agent !== "object") continue;
    if (override.description !== undefined) agent.description = override.description;
    if (override.skills !== undefined) agent.skills = [...override.skills];
    if (override.operations !== undefined) agent.prompt = override.operations;
  }
}

export function applyRuntimeDisabledAgents(config: PluginConfig, disabledAgents: readonly string[]): void {
  const runtimeConfig = config as RuntimePluginConfig;
  for (const agentID of disabledAgents) {
    const canonicalID = normalizeAgentId(agentID);
    if (runtimeConfig.agent && Object.prototype.hasOwnProperty.call(runtimeConfig.agent, canonicalID)) delete runtimeConfig.agent[canonicalID];
  }
}

export interface AgentSuiteServerOptions {
  knownAgents?: () => string[];
  sessionAgent?: (sessionID: string) => string | undefined | Promise<string | undefined>;
  ledger?: ConsentLedger;
  disabledAgents?: () => readonly string[];
  securityState?: () => { disabledAgents: readonly string[]; available: boolean };
}

interface ChatMessageInput { sessionID: string; agent?: string; messageID?: string; }
interface ChatMessageOutput { message?: { id?: string; agent?: string }; parts: Part[]; }
interface ToolBeforeInput { tool: string; sessionID: string; callID: string; }
interface ToolBeforeOutput { args: Record<string, unknown>; }

export function createAgentSuiteServer(options: AgentSuiteServerOptions = {}) {
  const ledger = options.ledger ?? new ConsentLedger();
  const knownAgents = options.knownAgents ?? (() => []);
  const currentTurns = new Map<string, { messageID: string; agent?: string }>();
  const readSecurityState = () => options.securityState?.() ?? { disabledAgents: options.disabledAgents?.() ?? [], available: true };
  return {
    "chat.message": async (input: ChatMessageInput, output: ChatMessageOutput) => {
      const messageID = input.messageID ?? output.message?.id;
      if (!messageID) {
        currentTurns.delete(input.sessionID);
        return;
      }
       const sessionAgent = input.agent ?? output.message?.agent ?? await options.sessionAgent?.(input.sessionID);
       currentTurns.set(input.sessionID, { messageID, agent: sessionAgent });
      const state = readSecurityState();
       const disabled = new Set(state.disabledAgents);
      const known = state.available ? knownAgents().filter((agent) => !disabled.has(agent)) : [];
      registerMessageGrant(ledger, { sessionID: input.sessionID, messageID, parts: output.parts }, known, sessionAgent);
      if (sessionAgent === SDD_ORCHESTRATOR) {
        const text = messageText({ sessionID: input.sessionID, messageID, parts: output.parts });
        const existing = new Set(output.parts.flatMap((part) => part.type === "agent" ? [part.name] : []));
        for (const agent of parseCanonicalConsent(text, known)) {
          if (existing.has(agent)) continue;
          output.parts.push({
            id: `prt_agent_suite_${randomBytes(8).toString("hex")}`,
            sessionID: input.sessionID,
            messageID,
            type: "agent",
            name: agent,
            source: { value: `usa también agente: ${agent}`, start: 0, end: `usa también agente: ${agent}`.length },
          });
        }
      }
    },
    "tool.execute.before": async (input: ToolBeforeInput, output: ToolBeforeOutput) => {
      if (input.tool !== "task") return;
      const state = readSecurityState();
      if (!state.available) throw new Error("Suite de Agentes: suite config unavailable");
      const disabledAgents = state.disabledAgents;
      const turn = currentTurns.get(input.sessionID);
      if (!turn) throw new Error("Suite de Agentes: cannot resolve the current turn for this task");
      const sessionAgent = turn.agent ?? await options.sessionAgent?.(input.sessionID);
      if (!sessionAgent) throw new Error("Suite de Agentes: cannot resolve the session agent for the current turn");
      const target = typeof output.args.subagent_type === "string" ? output.args.subagent_type : "";
      if (!target && sessionAgent === SDD_ORCHESTRATOR) throw new Error("Suite de Agentes: task target subagent_type is missing");
       const decision = decideTaskGate({ sessionAgent, target, sessionID: input.sessionID, messageID: turn.messageID, ledger, disabledAgents, knownAgents: [SDD_ORCHESTRATOR, ...knownAgents().filter((agent) => !disabledAgents.includes(agent))] });
       if (!decision.allowed) throw new Error(`Suite de Agentes: ${decision.reason}`);
    },
    "tool.execute.after": async () => undefined,
    "command.execute.before": async (input: { command: string; sessionID: string; arguments: string }, output: { parts: Part[] }) => {
      if (input.command === "agent-suite-grants") {
        const grants = ledger.list(input.sessionID);
        output.parts.push({ type: "text", text: grants.length ? grants.map((grant) => `${grant.id} ${grant.requester} -> ${grant.target} (${grant.purpose}; ${grant.duration})`).join("\n") : "No active session grants." } as Part);
      }
      if (input.command === "agent-suite-revoke") ledger.revokeTarget(input.sessionID, input.arguments.trim());
    },
    event: async (input: { event: Event }) => {
      if (input.event.type === "session.deleted") {
        const sessionID = input.event.properties.info.id;
        if (sessionID) { ledger.clearSession(sessionID); currentTurns.delete(sessionID); }
      }
    },
    grantConsent: (input: Parameters<ConsentLedger["grant"]>[0]) => ledger.grant(input),
    listGrants: (sessionID?: string) => ledger.list(sessionID),
  };
}

async function resolveSessionAgent(input: PluginInput, sessionID: string): Promise<string | undefined> {
  try {
    const response = await input.client.session.messages({ path: { id: sessionID }, query: { limit: 20 } });
    const messages = response.data ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const info = messages[index]?.info;
      if (info?.role === "user") return info.agent;
    }
  } catch { return undefined; }
  return undefined;
}

export const serverPlugin: Plugin = async (input) => {
  const registeredAgents = new Set<string>();
  let disabledAgents: string[] = [];
  let suiteConfigLoaded = false;
  let suiteFileExisted = false;
  const liveDisabledAgents = () => {
    try {
      const path = defaultSuitePath();
      const exists = existsSync(path);
      if (!exists) {
        if (suiteFileExisted) throw new Error("Suite config is unavailable");
        return disabledAgents;
      }
      disabledAgents = [...(loadSuiteConfig(path).disabledAgents ?? [])];
      suiteConfigLoaded = true;
      suiteFileExisted = true;
      return disabledAgents;
    } catch (error) {
      if (error instanceof Error && /suite config unavailable/i.test(error.message)) throw error;
      if (existsSync(defaultSuitePath())) throw new Error("Suite de Agentes: suite config unavailable");
      return disabledAgents;
    }
  };
  const securityState = () => {
    try {
      return { disabledAgents: liveDisabledAgents(), available: true };
    } catch {
      return { disabledAgents, available: false };
    }
  };
  const hooks = createAgentSuiteServer({
    knownAgents: () => [...registeredAgents],
    sessionAgent: (sessionID) => resolveSessionAgent(input, sessionID),
    disabledAgents: liveDisabledAgents,
    securityState,
  });
  return {
    ...hooks,
    config: async (config: PluginConfig) => {
      normalizeRuntimeAgentEntries(config);
      const configuredAgents = Object.keys(config.agent ?? {});
      try {
        const suitePath = defaultSuitePath();
        const suite = loadSuiteConfig(suitePath);
        disabledAgents = [...(suite.disabledAgents ?? [])];
        suiteConfigLoaded = true;
        if (existsSync(suitePath)) suiteFileExisted = true;
        applyRuntimeDisabledAgents(config, disabledAgents);
        applyRuntimeBuiltInOverrides(config, suite.builtInOverrides ?? {});
        applyRuntimeTaskPermission(config, disabledAgents, configuredAgents);
        applyRuntimeModelAssignments(config, suite.modelAssignments, suite.variantAssignments);
      } catch {
        suiteConfigLoaded = false;
        applyRuntimeTaskPermission(config, disabledAgents, configuredAgents); /* TUI reports malformed suite config. */
      }
      registeredAgents.clear();
      for (const agentID of configuredAgents) registeredAgents.add(normalizeAgentId(agentID));
    },
  };
};
const plugin: PluginModule = { id: "agent-suite", server: serverPlugin };
export default plugin;
export { ConsentLedger };
