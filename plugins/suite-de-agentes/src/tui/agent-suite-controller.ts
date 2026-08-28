import type { AgentCatalogRow, CustomAgent, SessionGrant, SuiteConfig } from "../core/types.ts";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildSuiteDeAgentesCatalog, SUITE_DE_AGENTES_SEED } from "../core/suites.ts";
import { patchBaseAgent, patchCustomAgent, setAgentModelAssignment, type AgentPatch } from "../core/config.ts";
import { loadSuiteConfig, saveSuiteConfig } from "../core/persistence.ts";
import { globalAgentPath, materializeGlobalAgent, renameMaterializedAgentResult } from "../core/agents.ts";
import type { CreateDraft } from "./agent-suite-create.ts";
import { isInternalBuiltInAgent, restoreBuiltInBaseline } from "../core/built-in-agents.ts";
import { ConsentLedger } from "../core/grants.ts";

export interface AgentSuiteController {
  snapshot(): { rows: AgentCatalogRow[]; disabledRows?: AgentCatalogRow[]; version: string };
  refresh(): void;
  createAgent(draft: CreateDraft): Promise<void>;
  deleteAgent(id: string): Promise<void>;
  deactivateAgent?(id: string): Promise<void>;
  reactivateAgent?(id: string): Promise<void>;
  restoreBuiltIn?(id: string): Promise<void>;
  activeGrants?(): SessionGrant[];
  revokeGrant?(id: string): Promise<void>;
  materialize(id: string): Promise<void>;
  setModel(id: string, model: string): Promise<void>;
  setEffort(id: string, variant: string): Promise<void>;
  setModelAndEffort(id: string, model: string, effort: string): Promise<void>;
  setSkills(id: string, skills: string[]): Promise<void>;
  setOperations(id: string, prompt: string): Promise<void>;
  patchAgent(id: string, patch: AgentPatch): Promise<void>;
  operations?(id: string): string | undefined;
}

export async function applyBuiltInAgentAction(
  controller: Pick<AgentSuiteController, "restoreBuiltIn" | "deactivateAgent">,
  action: "restore" | "disable",
  id: string,
): Promise<void> {
  if (action === "restore") return controller.restoreBuiltIn?.(id);
  return controller.deactivateAgent?.(id);
}

type ControllerOptions = {
  path?: string;
  runtime?: Record<string, { model?: string; variant?: string; description?: string; prompt?: string; skills?: string[] }>;
  custom?: Record<string, CustomAgent>;
  seed?: readonly string[];
  home?: string;
  ledger?: ConsentLedger;
  sessionID?: string;
};

export function createAgentSuiteController(
  rows: readonly AgentCatalogRow[] = [],
  version = "1.0.1",
  options: ControllerOptions = {},
): AgentSuiteController {
  const seed = options.seed ?? SUITE_DE_AGENTES_SEED;
  let currentRows = rows.map((row) => ({ ...row, skills: [...row.skills] }));
  let disabledRows: AgentCatalogRow[] = [];
  const rowCustomAgents = Object.fromEntries(rows.filter((row) => row.membership === "custom").map((row) => [row.id, {
    id: row.id,
    description: row.description ?? row.id,
    model: row.model ?? "openai/gpt-5",
    variant: row.variant,
    prompt: "",
    permissions: { read: "allow" as const },
    skills: [...row.skills],
  }]));
  let config: SuiteConfig = options.path ? loadSuiteConfig(options.path) : { version: 1, customAgents: { ...rowCustomAgents, ...(options.custom ?? {}) }, modelAssignments: {}, variantAssignments: {} };
  const runtime = options.runtime ?? Object.fromEntries(currentRows.map((row) => [row.id, { model: row.model, variant: row.variant, description: row.description, prompt: row.operations, skills: row.skills }]));
  const ledger = options.ledger;
  const rebuild = () => {
    const allRows = buildSuiteDeAgentesCatalog(runtime, config.customAgents, seed, config.modelAssignments, config.variantAssignments, config.builtInOverrides, config.disabledAgents);
    currentRows = allRows.filter((row) => row.disabled !== true);
    disabledRows = allRows.filter((row) => row.disabled === true);
  };
  rebuild();
  const persist = () => { if (options.path) saveSuiteConfig(options.path, config); };
  const find = (id: string) => currentRows.find((row) => row.id === id);
  const mutation = async (operation: () => void) => { operation(); persist(); rebuild(); };
  const patchAgent = async (id: string, patch: AgentPatch) => {
    const prior = structuredClone(config);
    let patched = seed.includes(id)
      ? patchBaseAgent(config, id, patch)
      : patchCustomAgent(config, id, patch);
    if (patch.model !== undefined || patch.effort !== undefined) {
      const targetId = patch.newId ?? id;
      const model = patch.model ?? patched.modelAssignments[targetId] ?? find(id)?.model;
      if (!model) throw new Error(`Agent '${id}' requires a model before effort can be assigned.`);
      patched = setAgentModelAssignment(patched, targetId, model, patch.effort === undefined ? patched.variantAssignments[targetId] : patch.effort || undefined);
    }
    let migration: { oldId: string; newId: string; oldPath: string; newPath: string; bytes?: Buffer; mode?: number; migrated: boolean } | undefined;
    if (patch.newId !== undefined && patch.newId !== id) {
      const oldPath = globalAgentPath(id, options.home);
      migration = {
        oldId: id,
        newId: patch.newId,
        oldPath,
        newPath: globalAgentPath(patch.newId, options.home),
        ...(existsSync(oldPath) ? { bytes: readFileSync(oldPath), mode: statSync(oldPath).mode & 0o777 } : {}),
        migrated: false,
      };
    }
    try {
      config = patched;
      persist();
      if (migration) {
        const agent = config.customAgents[migration.newId];
        if (!agent) throw new Error(`Unknown custom agent: ${migration.newId}`);
        const result = renameMaterializedAgentResult(id, migration.newId, {
          ...agent,
          model: config.modelAssignments[migration.newId] ?? agent.model,
          variant: config.variantAssignments[migration.newId] ?? agent.variant,
        }, options.home);
        migration.migrated = result.kind === "migrated";
      }
      rebuild();
    } catch (error) {
      const rollbackErrors: string[] = [];
      if (migration?.migrated) {
        try {
          if (existsSync(migration.newPath)) unlinkSync(migration.newPath);
          if (migration.bytes) {
            mkdirSync(dirname(migration.oldPath), { recursive: true });
            writeFileSync(migration.oldPath, migration.bytes, { mode: migration.mode });
          }
        } catch (rollbackError) {
          rollbackErrors.push(`filesystem rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
      }
      try {
        config = prior;
        persist();
      } catch (rollbackError) {
        rollbackErrors.push(`config rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
      try { rebuild(); } catch (rollbackError) {
        rollbackErrors.push(`refresh rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
      const originalMessage = error instanceof Error ? error.message : String(error);
      throw rollbackErrors.length > 0 ? new Error(`${originalMessage}; ${rollbackErrors.join("; ")}`) : error;
    }
  };
  return {
    snapshot: () => ({
      rows: currentRows.map((row) => ({ ...row, skills: [...row.skills] })),
      disabledRows: disabledRows.map((row) => ({ ...row, skills: [...row.skills] })),
      version,
    }),
    refresh: () => {
      if (options.path) config = loadSuiteConfig(options.path);
      rebuild();
    },
    createAgent: async (draft) => mutation(() => {
      if (config.customAgents[draft.id] || seed.includes(draft.id)) throw new Error(`Agent already exists: ${draft.id}`);
      config.customAgents[draft.id] = { id: draft.id, description: draft.description, model: draft.model, prompt: draft.operations, permissions: { read: "allow", edit: "ask" }, skills: [...draft.skills] };
      config = setAgentModelAssignment(config, draft.id, draft.model, draft.effort || undefined);
    }),
    deleteAgent: async (id) => {
      if (seed.includes(id)) throw new Error(`Base agent '${id}' is protected; use deactivate instead.`);
      const prior = structuredClone(config);
      const path = globalAgentPath(id, options.home);
      const file = existsSync(path) ? { bytes: readFileSync(path), mode: statSync(path).mode & 0o777 } : undefined;
      try {
        delete config.customAgents[id];
        delete config.modelAssignments[id];
        delete config.variantAssignments[id];
        if (config.disabledAgents) config.disabledAgents = config.disabledAgents.filter((agentID) => agentID !== id);
        persist();
        if (existsSync(path)) unlinkSync(path);
        rebuild();
      } catch (error) {
        config = prior;
        try { persist(); } catch { /* Preserve the original deletion error. */ }
        if (file && !existsSync(path)) {
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, file.bytes, { mode: file.mode });
        }
        try { rebuild(); } catch { /* Preserve the original deletion error. */ }
        throw error;
      }
    },
    deactivateAgent: async (id) => mutation(() => {
      if (!seed.includes(id)) throw new Error(`Only base agents can be deactivated: ${id}`);
      if (isInternalBuiltInAgent(id) && config.advancedOverrides?.allowInternalDisable !== true) throw new Error(`Advanced override confirmation is required before disabling internal agent: ${id}`);
      config.disabledAgents = [...new Set([...(config.disabledAgents ?? []), id])];
    }),
    reactivateAgent: async (id) => mutation(() => {
      if (!seed.includes(id) && !config.customAgents[id]) throw new Error(`Unknown owned agent: ${id}`);
      config.disabledAgents = (config.disabledAgents ?? []).filter((agentID) => agentID !== id);
    }),
    restoreBuiltIn: async (id) => mutation(() => {
      if (!seed.includes(id)) throw new Error(`Only built-in agents can be restored: ${id}`);
      config = {
        ...config,
        builtInOverrides: restoreBuiltInBaseline(id, config.builtInOverrides),
        modelAssignments: Object.fromEntries(Object.entries(config.modelAssignments).filter(([agentID]) => agentID !== id)),
        variantAssignments: Object.fromEntries(Object.entries(config.variantAssignments).filter(([agentID]) => agentID !== id)),
      };
    }),
    activeGrants: () => ledger ? ledger.list(options.sessionID) : [],
    revokeGrant: async (id) => { ledger?.revoke(id); },
    materialize: async (id) => mutation(() => {
      const agent = config.customAgents[id];
      if (!agent) throw new Error(`Unknown custom agent: ${id}`);
      materializeGlobalAgent({ ...agent, model: config.modelAssignments[id] ?? agent.model, variant: config.variantAssignments[id] ?? agent.variant }, () => true);
    }),
    setModel: async (id, model) => mutation(() => { config = setAgentModelAssignment(config, id, model, config.variantAssignments[id]); }),
    setEffort: async (id, variant) => mutation(() => { config = setAgentModelAssignment(config, id, config.modelAssignments[id] ?? find(id)?.model ?? "openai/gpt-5", variant || undefined); }),
    setModelAndEffort: async (id, model, effort) => mutation(() => { config = setAgentModelAssignment(config, id, model, effort || undefined); }),
    setSkills: async (id, skills) => mutation(() => { const agent = config.customAgents[id]; if (!agent) throw new Error(`Unknown custom agent: ${id}`); agent.skills = [...skills]; }),
    setOperations: async (id, prompt) => mutation(() => { const agent = config.customAgents[id]; if (!agent) throw new Error(`Unknown custom agent: ${id}`); agent.prompt = prompt; }),
    patchAgent,
    operations: (id) => config.customAgents[id]?.prompt ?? config.builtInOverrides?.[id]?.operations,
  };
}
