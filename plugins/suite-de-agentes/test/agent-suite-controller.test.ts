import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentSuiteController } from "../src/tui/agent-suite-controller.ts";
import { globalAgentPath, materializeGlobalAgent } from "../src/core/agents.ts";
import { loadSuiteConfig, saveSuiteConfig } from "../src/core/persistence.ts";
import type { CreateDraft } from "../src/tui/agent-suite-create.ts";
import type { AgentCatalogRow } from "../src/core/types.ts";
import { ConsentLedger } from "../src/core/grants.ts";

const row: AgentCatalogRow = { id: "custom", membership: "custom", enabled: false, skills: ["testing"], consent: "explicit-current-turn" };
const draft: CreateDraft = { id: "new-agent", description: "New agent", skills: ["testing"], operations: "Review", model: "openai/gpt-5", effort: "high" };

describe("Agent Suite controller adapter", () => {
  it("exposes a defensive snapshot and keeps operations behind the adapter boundary", async () => {
    const controller = createAgentSuiteController([row]);
    const snapshot = controller.snapshot();
    snapshot.rows.find((item) => item.id === row.id)?.skills.push("mutated");
    expect(controller.snapshot().rows.find((item) => item.id === row.id)?.skills).toEqual(["testing"]);
    await controller.setSkills(row.id, ["github"]);
    await controller.setOperations(row.id, "Updated");
    await controller.createAgent(draft);
    expect(controller.snapshot().rows.some((item) => item.id === draft.id)).toBe(true);
  });

  it("supports explicit operation method names for every mutation", () => {
    const controller = createAgentSuiteController();
    expect(Object.keys(controller)).toEqual(["snapshot", "refresh", "createAgent", "deleteAgent", "deactivateAgent", "reactivateAgent", "restoreBuiltIn", "activeGrants", "revokeGrant", "materialize", "setModel", "setEffort", "setModelAndEffort", "setSkills", "setOperations", "patchAgent", "operations"]);
  });

  it("builds the initial snapshot from persisted and runtime agents", () => {
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    writeFileSync(path, JSON.stringify({ version: 1, customAgents: { "smoke-custom": { id: "smoke-custom", description: "Smoke custom", model: "openai/gpt-5", prompt: "Smoke", permissions: { read: "allow" }, skills: [] } }, modelAssignments: {}, variantAssignments: {} }));
    const controller = createAgentSuiteController([], "1.1.0", { path, runtime: { general: { model: "openai/gpt-5" }, "smoke-custom": { model: "openai/gpt-5" } } });
    const visibleIds = controller.snapshot().rows.map(({ id }) => id);
    expect(visibleIds).toEqual(["build", "compaction", "explore", "general", "plan", "smoke-custom", "summary", "title"]);
    expect(visibleIds.join(" ")).not.toContain("agent-github");
    expect(visibleIds.join(" ")).not.toContain("agent-notebooklm");
  });

  it("refreshes the catalog after an external orchestrator changes the suite config", () => {
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    const controller = createAgentSuiteController([], "1.1.0", { path, runtime: {} });

    saveSuiteConfig(path, {
      version: 1,
      customAgents: { "externally-managed": { id: "externally-managed", description: "Managed elsewhere", model: "openai/gpt-5", prompt: "External", permissions: { read: "allow" }, skills: [] } },
      modelAssignments: {},
      variantAssignments: {},
    });
    controller.refresh();

    expect(controller.snapshot().rows).toEqual(expect.arrayContaining([expect.objectContaining({ id: "externally-managed", description: "Managed elsewhere" })]));
  });

  it("persists a created model and effort through assignments across reload", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    const controller = createAgentSuiteController([], "1.1.0", { path, runtime: {} });

    await controller.createAgent(draft);

    expect(controller.snapshot().rows).toEqual(expect.arrayContaining([expect.objectContaining({ id: draft.id, model: draft.model, variant: draft.effort })]));
    expect(loadSuiteConfig(path)).toMatchObject({ modelAssignments: { [draft.id]: draft.model }, variantAssignments: { [draft.id]: draft.effort } });

    const reloaded = createAgentSuiteController([], "1.1.0", { path, runtime: {} });
    expect(reloaded.snapshot().rows).toEqual(expect.arrayContaining([expect.objectContaining({ id: draft.id, model: draft.model, variant: draft.effort })]));
  });

  it("persists model and effort with one controller mutation", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    const controller = createAgentSuiteController([], "1.1.0", { path, runtime: { general: { model: "openai/gpt-5" } } });

    await controller.setModelAndEffort("general", "anthropic/sonnet", "high");

    expect(loadSuiteConfig(path)).toMatchObject({ modelAssignments: { general: "anthropic/sonnet" }, variantAssignments: { general: "high" } });
    expect(controller.snapshot().rows).toEqual(expect.arrayContaining([expect.objectContaining({ id: "general", model: "anthropic/sonnet", variant: "high" })]));
  });

  it("assigns a nested model with default effort to a built-in agent", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    saveSuiteConfig(path, {
      version: 1,
      customAgents: {},
      modelAssignments: { general: "opencode/x-preview-f-free" },
      variantAssignments: { general: "low" },
    });
    const controller = createAgentSuiteController([], "1.1.0", { path, runtime: { general: { model: "opencode/x-preview-f-free" } } });

    await controller.setModelAndEffort("general", "cliproxyapi/google-1/gemini-3.7-flash-high", "");

    expect(loadSuiteConfig(path)).toMatchObject({
      modelAssignments: { general: "cliproxyapi/google-1/gemini-3.7-flash-high" },
      variantAssignments: {},
    });
    const updated = controller.snapshot().rows.find((row) => row.id === "general");
    expect(updated).toMatchObject({ id: "general", model: "cliproxyapi/google-1/gemini-3.7-flash-high" });
    expect(updated).toMatchObject({ variant: "medium" });
  });

  it("commits a custom patch, persists it, migrates its materialized file, and rebuilds", async () => {
    const home = mkdtempSync(join(tmpdir(), "agent-suite-controller-home-"));
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    const agent = { id: "old-agent", description: "Old", model: "openai/x", prompt: "Do work.", permissions: { read: "allow" as const }, skills: ["testing"] };
    saveSuiteConfig(path, { version: 1, customAgents: { "old-agent": agent }, modelAssignments: { "old-agent": "openai/assigned" }, variantAssignments: { "old-agent": "high" } });
    materializeGlobalAgent(agent, () => true, home);
    const controller = createAgentSuiteController([], "1.1.0", { path, home, runtime: { "old-agent": { model: agent.model } } });

    await controller.patchAgent!("old-agent", { newId: "new-agent", description: "Updated", skills: ["linting"] });

    expect(loadSuiteConfig(path)).toEqual({
      version: 1,
      customAgents: { "new-agent": { ...agent, id: "new-agent", description: "Updated", skills: ["linting"] } },
      modelAssignments: { "new-agent": "openai/assigned" },
      variantAssignments: { "new-agent": "high" },
    });
    expect(controller.snapshot().rows.some((row) => row.id === "new-agent")).toBe(true);
    expect(controller.snapshot().rows.some((row) => row.id === "old-agent")).toBe(false);
    expect(existsSync(globalAgentPath("old-agent", home))).toBe(false);
    expect(readFileSync(globalAgentPath("new-agent", home), "utf8")).toContain("name: new-agent");
  });

  it("persists one external patch for description, skills, operations, model, and effort", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    const agent = { id: "review-agent", description: "Old", model: "openai/old", prompt: "Old operations", permissions: { read: "allow" as const }, skills: [] };
    saveSuiteConfig(path, { version: 1, customAgents: { [agent.id]: agent }, modelAssignments: {}, variantAssignments: {} });
    const controller = createAgentSuiteController([], "1.1.0", { path, runtime: { [agent.id]: { model: agent.model } } });

    await controller.patchAgent(agent.id, { description: "Improved", skills: ["testing"], operations: "Review safely", model: "anthropic/sonnet", effort: "high" });

    expect(loadSuiteConfig(path)).toMatchObject({
      customAgents: { [agent.id]: { description: "Improved", skills: ["testing"], prompt: "Review safely" } },
      modelAssignments: { [agent.id]: "anthropic/sonnet" },
      variantAssignments: { [agent.id]: "high" },
    });
  });

  it("rolls back persisted identity and materialized files when migration fails", async () => {
    const home = mkdtempSync(join(tmpdir(), "agent-suite-controller-home-"));
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    const persistedAgent = { id: "old-agent", description: "Old", model: "openai/x", prompt: "Do work.", permissions: { read: "allow" as const }, skills: [] };
    const controllerAgent = { ...persistedAgent, prompt: "" };
    saveSuiteConfig(path, { version: 1, customAgents: { "old-agent": controllerAgent }, modelAssignments: {}, variantAssignments: {} });
    materializeGlobalAgent(persistedAgent, () => true, home);
    const controller = createAgentSuiteController([], "1.1.0", { path, home, runtime: { "old-agent": { model: persistedAgent.model } } });

    await expect(controller.patchAgent!("old-agent", { newId: "new-agent" })).rejects.toThrow(/requires model and prompt/i);

    expect(loadSuiteConfig(path).customAgents).toEqual({ "old-agent": controllerAgent });
    expect(controller.snapshot().rows.some((row) => row.id === "old-agent")).toBe(true);
    expect(controller.snapshot().rows.some((row) => row.id === "new-agent")).toBe(false);
    expect(existsSync(globalAgentPath("old-agent", home))).toBe(true);
    expect(existsSync(globalAgentPath("new-agent", home))).toBe(false);
  });

  it("does not leave both registry identities active after a failed migration", async () => {
    const home = mkdtempSync(join(tmpdir(), "agent-suite-controller-home-"));
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    const agent = { id: "old-agent", description: "Old", model: "openai/x", prompt: "Do work.", permissions: { read: "allow" as const }, skills: [] };
    saveSuiteConfig(path, { version: 1, customAgents: { "old-agent": agent }, modelAssignments: {}, variantAssignments: {} });
    materializeGlobalAgent(agent, () => true, home);
    const controller = createAgentSuiteController([], "1.1.0", { path, home, runtime: { "old-agent": { model: agent.model } } });

    await expect(controller.patchAgent!("old-agent", { newId: "new-agent", operations: "" })).rejects.toThrow(/requires model and prompt/i);

    const saved = loadSuiteConfig(path);
    expect(Object.keys(saved.customAgents)).toEqual(["old-agent"]);
    expect(existsSync(globalAgentPath("old-agent", home))).toBe(true);
    expect(existsSync(globalAgentPath("new-agent", home))).toBe(false);
  });

  it("rejects renaming into a canonical seed member without migrating files", async () => {
    const home = mkdtempSync(join(tmpdir(), "agent-suite-controller-home-"));
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    const agent = { id: "old-agent", description: "Old", model: "openai/x", prompt: "Do work.", permissions: { read: "allow" as const }, skills: [] };
    saveSuiteConfig(path, { version: 1, customAgents: { "old-agent": agent }, modelAssignments: {}, variantAssignments: {} });
    materializeGlobalAgent(agent, () => true, home);
    const originalFile = readFileSync(globalAgentPath("old-agent", home), "utf8");
    const controller = createAgentSuiteController([], "1.1.0", { path, home, runtime: { "old-agent": { model: agent.model } } });

    await expect(controller.patchAgent!("old-agent", { newId: "general" })).rejects.toThrow(/collision|seed|duplicate/i);

    expect(loadSuiteConfig(path).customAgents).toEqual({ "old-agent": agent });
    expect(controller.snapshot().rows.some((row) => row.id === "general")).toBe(true);
    expect(readFileSync(globalAgentPath("old-agent", home), "utf8")).toBe(originalFile);
  });

  it("rejects assignment-map destination collisions before persisting or migrating", async () => {
    const home = mkdtempSync(join(tmpdir(), "agent-suite-controller-home-"));
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    const agent = { id: "old-agent", description: "Old", model: "openai/x", prompt: "Do work.", permissions: { read: "allow" as const }, skills: [] };
    saveSuiteConfig(path, { version: 1, customAgents: { "old-agent": agent }, modelAssignments: { "reserved-agent": "openai/reserved" }, variantAssignments: {} });
    materializeGlobalAgent(agent, () => true, home);
    const before = readFileSync(path, "utf8");
    const controller = createAgentSuiteController([], "1.1.0", { path, home, runtime: { "old-agent": { model: agent.model } } });

    await expect(controller.patchAgent("old-agent", { newId: "reserved-agent" })).rejects.toThrow(/collision|colisi[oó]n/i);

    expect(readFileSync(path, "utf8")).toBe(before);
    expect(existsSync(globalAgentPath("old-agent", home))).toBe(true);
    expect(existsSync(globalAgentPath("reserved-agent", home))).toBe(false);
  });

  it("edits base fields without allowing identity rename and keeps assignments authoritative", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    saveSuiteConfig(path, {
      version: 1,
      customAgents: {},
      modelAssignments: { general: "openai/assigned" },
      variantAssignments: { general: "high" },
    });
    const controller = createAgentSuiteController([], "1.1.0", {
      path,
      runtime: { general: { model: "openai/runtime", variant: "runtime", description: "Runtime" } },
    });

    await controller.patchAgent("general", { description: "Edited base", skills: ["testing"], operations: "Operate safely." });

    const general = controller.snapshot().rows.find((item) => item.id === "general");
    expect(general).toMatchObject({ id: "general", description: "Edited base", skills: ["testing"], model: "openai/assigned", variant: "high" });
    expect(controller.operations?.("general")).toBe("Operate safely.");
    await expect(controller.patchAgent("general", { newId: "renamed-general" })).rejects.toThrow(/protected|proteg|rename|renombr/i);
    expect(controller.snapshot().rows.some((item) => item.id === "renamed-general")).toBe(false);
  });

  it("deactivates a base agent into Desactivados and reactivates it without losing overrides or assignments", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    saveSuiteConfig(path, {
      version: 1,
      customAgents: {},
      modelAssignments: { general: "openai/assigned" },
      variantAssignments: { general: "high" },
      baseOverrides: { general: { description: "Edited base", skills: ["testing"], operations: "Operate safely." } },
    });
    const controller = createAgentSuiteController([], "1.1.0", { path, runtime: { general: { model: "openai/runtime", description: "Runtime" } } });

    await controller.deactivateAgent!("general");

    expect(controller.snapshot().rows.some((item) => item.id === "general")).toBe(false);
    expect(controller.snapshot().disabledRows).toEqual([expect.objectContaining({ id: "general", disabled: true, enabled: false, description: "Edited base", skills: ["testing"], model: "openai/assigned", variant: "high" })]);
    expect(loadSuiteConfig(path).disabledAgents).toEqual(["general"]);

    await controller.reactivateAgent!("general");

    expect(controller.snapshot().rows).toEqual(expect.arrayContaining([expect.objectContaining({ id: "general", description: "Edited base", skills: ["testing"], model: "openai/assigned", variant: "high" })]));
    expect(controller.snapshot().disabledRows).toEqual([]);
    expect(loadSuiteConfig(path).disabledAgents).toEqual([]);
  });

  it("never physically deletes a seed agent", async () => {
    const controller = createAgentSuiteController([], "1.1.0", { runtime: { general: { model: "openai/gpt-5" } } });

    await expect(controller.deleteAgent("general")).rejects.toThrow(/base|seed|delete|eliminar/i);
    expect(controller.snapshot().rows.some((item) => item.id === "general")).toBe(true);
  });

  it("restores only a built-in baseline and requires an advanced override before disabling an internal agent", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    saveSuiteConfig(path, {
      version: 1,
      customAgents: {},
      modelAssignments: { explore: "anthropic/sonnet", build: "openai/assigned" },
      variantAssignments: { explore: "high" },
      builtInOverrides: { explore: { description: "Edited", skills: ["testing"], operations: "Edited operations" } },
    });
    const controller = createAgentSuiteController([], "1.1.0", { path, runtime: { build: { model: "openai/runtime" }, explore: { model: "openai/runtime" }, compaction: { model: "openai/runtime" } } });

    await controller.restoreBuiltIn!("explore");
    expect(loadSuiteConfig(path)).toMatchObject({ builtInOverrides: {}, modelAssignments: { build: "openai/assigned" } });
    expect(loadSuiteConfig(path).modelAssignments).not.toHaveProperty("explore");
    await expect(controller.deactivateAgent!("compaction")).rejects.toThrow(/advanced|anulaci[oó]n/i);
    expect(controller.snapshot().rows.find((item) => item.id === "compaction")).toMatchObject({ enabled: true });
  });

  it("lists and immediately revokes the active grants injected for the current TUI session", async () => {
    const ledger = new ConsentLedger();
    const grant = ledger.grant({ sessionID: "session-1", requester: "build", target: "explore", purpose: "codebase search", operation: "task" });
    const controller = createAgentSuiteController([], "1.1.0", { runtime: { general: { model: "openai/gpt-5" } }, ledger, sessionID: "session-1" });

    expect(controller.activeGrants?.()).toEqual([expect.objectContaining({ id: grant.id, requester: "build", target: "explore", duration: "current-session" })]);
    await controller.revokeGrant!(grant.id);
    expect(controller.activeGrants?.()).toEqual([]);
  });

  it("deletes a custom registry entry and its materialized file", async () => {
    const home = mkdtempSync(join(tmpdir(), "agent-suite-controller-home-"));
    const path = join(mkdtempSync(join(tmpdir(), "agent-suite-controller-")), "suites.json");
    const agent = { id: "old-agent", description: "Old", model: "openai/x", prompt: "Do work.", permissions: { read: "allow" as const }, skills: [] };
    saveSuiteConfig(path, { version: 1, customAgents: { "old-agent": agent }, modelAssignments: { "old-agent": "openai/assigned" }, variantAssignments: { "old-agent": "high" } });
    materializeGlobalAgent(agent, () => true, home);
    const controller = createAgentSuiteController([], "1.1.0", { path, home, runtime: { "old-agent": { model: agent.model } } });

    await controller.deleteAgent("old-agent");

    expect(loadSuiteConfig(path).customAgents).toEqual({});
    expect(loadSuiteConfig(path).modelAssignments).toEqual({});
    expect(loadSuiteConfig(path).variantAssignments).toEqual({});
    expect(existsSync(globalAgentPath("old-agent", home))).toBe(false);
  });
});
