import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INTERNAL_AGENT_ALLOWLIST, transformTaskPermission } from "../src/core/policy.ts";
import { defaultSuitePath, saveSuiteConfig } from "../src/core/persistence.ts";
import defaultPlugin, { createAgentSuiteServer, serverPlugin } from "../src/server/index.ts";

describe("server adapter", () => {
  let testHome: string;

  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), "agent-suite-server-test-"));
    vi.stubEnv("HOME", testHome);
    vi.stubEnv("USERPROFILE", testHome);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows direct dispatch of registered suite agents without requiring session grant", async () => {
    const hooks = createAgentSuiteServer({ knownAgents: () => ["github-specialist"] });
    await hooks["chat.message"]({ sessionID: "s", agent: "gentle-orchestrator", messageID: "m1" }, { message: { id: "m1", agent: "gentle-orchestrator" } as never, parts: [] as never });
    await expect(hooks["tool.execute.before"]({ tool: "task", sessionID: "s", callID: "c1" }, { args: { subagent_type: "github-specialist" } })).resolves.toBeUndefined();
    await hooks["chat.message"]({ sessionID: "s", agent: "gentle-orchestrator", messageID: "m2" }, { message: { id: "m2", agent: "gentle-orchestrator" } as never, parts: [] as never });
    await expect(hooks["tool.execute.before"]({ tool: "task", sessionID: "s", callID: "c2" }, { args: { subagent_type: "github-specialist" } })).resolves.toBeUndefined();
  });

  it("normalizes configured agent input and allows registered dispatch", async () => {
    const hooks = await serverPlugin({} as never);
    await hooks.config?.({ agent: { "custom-specialist": {} } } as never);
    await hooks["chat.message"]?.({ sessionID: "custom", agent: "gentle-orchestrator", messageID: "m1" }, {
      message: { id: "m1", agent: "gentle-orchestrator" } as never,
      parts: [] as never,
    });
    await expect(hooks["tool.execute.before"]?.({ tool: "task", sessionID: "custom", callID: "allow" }, {
      args: { subagent_type: "custom-specialist" },
    })).resolves.toBeUndefined();

    const output = {
      message: { id: "m2", agent: "gentle-orchestrator" },
      parts: [{ type: "text", text: "usa también agente: custom-specialist" }],
    } as never;
    await hooks["chat.message"]?.({ sessionID: "custom", agent: "gentle-orchestrator", messageID: "m2" }, output);
    expect((output as { parts: Array<Record<string, unknown>> }).parts).toContainEqual(expect.objectContaining({ type: "agent", name: "custom-specialist" }));
  });

  it("fails closed when the current message ID or session agent cannot be resolved", async () => {
    const hooks = createAgentSuiteServer({ knownAgents: () => ["github-specialist"] });
    await hooks["chat.message"]({ sessionID: "s", agent: "gentle-orchestrator" }, { message: { agent: "gentle-orchestrator" } as never, parts: [{ type: "text", text: "usa también agente: github-specialist" }] as never });
    await expect(hooks["tool.execute.before"]({ tool: "task", sessionID: "s", callID: "c1" }, { args: { subagent_type: "github-specialist" } })).rejects.toThrow("turn");
    const unknown = createAgentSuiteServer();
    await expect(unknown["tool.execute.before"]({ tool: "task", sessionID: "missing", callID: "c1" }, { args: { subagent_type: "general" } })).rejects.toThrow("turn");
  });

  it("exports the server entry as the real OpenCode server module", () => {
    expect(defaultPlugin).toMatchObject({ id: "agent-suite", server: expect.any(Function) });
  });

  it("fails closed when the registered-agent inventory is unavailable or target is unregistered", async () => {
    const hooks = createAgentSuiteServer();
    await hooks["chat.message"]({ sessionID: "s", agent: "gentle-orchestrator", messageID: "m1" }, { message: { agent: "gentle-orchestrator" } as never, parts: [] as never });
    await expect(hooks["tool.execute.before"]({ tool: "task", sessionID: "s", callID: "c1" }, { args: { subagent_type: "general" } })).rejects.toThrow("Blocked agent");
  });

  it("uses the config inventory and message agent with the real server hook shapes", async () => {
    const hooks = await serverPlugin({} as never);
    await hooks.config?.({ agent: { general: {} }, default_agent: "gentle-orchestrator" } as never);
    await hooks["chat.message"]?.({ sessionID: "s", messageID: "m1" }, { message: { id: "m1", agent: "gentle-orchestrator" } as never, parts: [] as never });
    await expect(hooks["tool.execute.before"]?.({ tool: "task", sessionID: "s", callID: "c1" }, { args: { subagent_type: "general" } })).resolves.toBeUndefined();
    await hooks["chat.message"]?.({ sessionID: "s", messageID: "m2" }, { message: { id: "m2", agent: "gentle-orchestrator" } as never, parts: [] as never });
    await expect(hooks["tool.execute.before"]?.({ tool: "task", sessionID: "s", callID: "c2" }, { args: { subagent_type: "unknown" } })).rejects.toThrow("target is unknown");
  });

  it("allows every configured internal agent without a current-turn ledger grant", async () => {
    const hooks = await serverPlugin({} as never);
    const config = {
      model: "openai/test-model",
      share: "manual",
      permission: {
        edit: "deny",
        bash: { "*": "ask" },
        webfetch: "deny",
        task: { "*": "ask", general: "allow", "sdd-evil": "allow" },
      },
      agent: {
        "gentle-orchestrator": {
          model: "openai/orchestrator-model",
          permission: {
            edit: "deny",
            bash: "allow",
            task: { "*": "ask", "sdd-evil": "allow" },
          },
        },
        ...Object.fromEntries(INTERNAL_AGENT_ALLOWLIST.map((agent) => [agent, {}])),
      },
    };
    await hooks.config?.(config as never);

    expect(config.model).toBe("openai/test-model");
    expect(config.share).toBe("manual");
    expect(config.permission.edit).toBe("deny");
    expect(config.permission.bash).toEqual({ "*": "ask" });
    expect(config.permission.webfetch).toBe("deny");
    expect(config.permission.task).toEqual(transformTaskPermission([], Object.keys(config.agent)));
    const orchestrator = config.agent["gentle-orchestrator"] as {
      model: string;
      permission: { edit: string; bash: string; task: Record<string, string> };
    };
    expect(orchestrator.model).toBe("openai/orchestrator-model");
    expect(orchestrator.permission.edit).toBe("deny");
    expect(orchestrator.permission.bash).toBe("allow");
    expect(orchestrator.permission.task).toEqual(transformTaskPermission([], Object.keys(config.agent)));

    await hooks["chat.message"]?.({ sessionID: "internal", agent: "gentle-orchestrator", messageID: "m1" }, {
      message: { id: "m1", agent: "gentle-orchestrator" } as never,
      parts: [] as never,
    });
    for (const target of INTERNAL_AGENT_ALLOWLIST) {
      await expect(hooks["tool.execute.before"]?.({ tool: "task", sessionID: "internal", callID: target }, {
        args: { subagent_type: target },
      })).resolves.toBeUndefined();
    }
  });

  it("does not invent an orchestrator agent when the runtime config omits it", async () => {
    const hooks = await serverPlugin({} as never);
    const config = { permission: { edit: "deny" } };
    await expect(hooks.config?.(config as never)).resolves.toBeUndefined();
    expect(config.permission).toEqual({ edit: "deny", task: transformTaskPermission() });
    expect((config as { agent?: unknown }).agent).toBeUndefined();
  });

  it("blocks unregistered and lookalike agents during task dispatch", async () => {
    const hooks = await serverPlugin({} as never);
    const external = ["unregistered-agent", "sdd-evil"];
    await hooks.config?.({
      agent: Object.fromEntries([...INTERNAL_AGENT_ALLOWLIST, "general"].map((agent) => [agent, {}])),
    } as never);
    await hooks["chat.message"]?.({ sessionID: "external", agent: "gentle-orchestrator", messageID: "m1" }, {
      message: { id: "m1", agent: "gentle-orchestrator" } as never,
      parts: [] as never,
    });

    for (const target of external) {
      await expect(hooks["tool.execute.before"]?.({ tool: "task", sessionID: "external", callID: target }, {
        args: { subagent_type: target },
      })).rejects.toThrow(`Blocked agent '${target}'`);
    }
  });

  it("uses the official session messages API when the chat message omits agent", async () => {
    const input = { client: { session: { messages: async () => ({ data: [{ info: { role: "user", agent: "general" } }] }) } } };
    const hooks = await serverPlugin(input as never);
    await hooks.config?.({ agent: { general: {} } } as never);
    await hooks["chat.message"]?.({ sessionID: "s", messageID: "m1" }, { message: { id: "m1" } as never, parts: [{ type: "agent", name: "general" }] as never });
    await expect(hooks["tool.execute.before"]?.({ tool: "task", sessionID: "s", callID: "c1" }, { args: { subagent_type: "general" } })).resolves.toBeUndefined();
  });

  it("materializes canonical text consent into a valid AgentPart and keeps the grant agent-exact", async () => {
    const hooks = createAgentSuiteServer({ knownAgents: () => ["general", "explore"] });
    const output = {
      message: { id: "m1", agent: "gentle-orchestrator" },
      parts: [{ type: "text", text: "usa también agente: general" }],
    } as never;
    await hooks["chat.message"]({ sessionID: "s", messageID: "m1" }, output);
    const parts = (output as { parts: Array<Record<string, unknown>> }).parts;
    const agentPart = parts.find((part) => part.type === "agent");
    expect(agentPart).toMatchObject({ type: "agent", name: "general", sessionID: "s", messageID: "m1" });
    expect(String(agentPart?.id)).toMatch(/^prt_/);
    expect(agentPart?.source).toEqual({ value: "usa también agente: general", start: 0, end: 27 });
    await expect(hooks["tool.execute.before"]({ tool: "task", sessionID: "s", callID: "c1" }, { args: { subagent_type: "general" } })).resolves.toBeUndefined();
    await expect(hooks["tool.execute.before"]({ tool: "task", sessionID: "s", callID: "c2" }, { args: { subagent_type: "unknown" } })).rejects.toThrow("Blocked agent");
  });

  it("does not materialize an AgentPart for unknown text consent", async () => {
    const hooks = createAgentSuiteServer({ knownAgents: () => ["general"] });
    const output = { message: { id: "m1", agent: "gentle-orchestrator" }, parts: [{ type: "text", text: "usa también agente: unknown" }] } as never;
    await hooks["chat.message"]({ sessionID: "s", messageID: "m1" }, output);
    expect((output as { parts: Array<Record<string, unknown>> }).parts.some((part) => part.type === "agent")).toBe(false);
  });

  it("applies only persisted per-agent model assignments through the config hook", async () => {
    saveSuiteConfig(defaultSuitePath(), {
      version: 1,
      customAgents: {},
      modelAssignments: {
        general: "openai/assigned-general",
        explore: "openai/assigned-explore",
      },
      variantAssignments: {
        general: "high",
      },
    });
    const config = {
      permission: {},
      model: "openai/root-model",
      agent: {
        general: { model: "openai/old-general", variant: "old" },
        explore: { model: "openai/old-explore", variant: "old-explore" },
        untouched: { model: "openai/keep", variant: "keep-variant" },
      },
    };
    const hooks = await serverPlugin({} as never);
    await hooks.config?.(config as never);

    expect(config.model).toBe("openai/root-model");
    expect(config.agent.general.model).toBe("openai/assigned-general");
    expect(config.agent.general.variant).toBe("high");
    expect(config.agent.explore.model).toBe("openai/assigned-explore");
    expect(config.agent.explore.variant).toBeUndefined();
    expect(config.agent.untouched.model).toBe("openai/keep");
    expect(config.agent.untouched.variant).toBe("keep-variant");
    expect(JSON.parse(readFileSync(defaultSuitePath(), "utf8")).modelAssignments).toEqual({
      general: "openai/assigned-general",
      explore: "openai/assigned-explore",
    });
  });

  it("removes disabled agents from runtime config and applies safe base overrides", async () => {
    saveSuiteConfig(defaultSuitePath(), {
      version: 1,
      customAgents: {},
      modelAssignments: { explore: "openai/assigned-explore" },
      variantAssignments: { explore: "high" },
      baseOverrides: { explore: { description: "Edited Explore", skills: ["testing"], operations: "Use Explore safely." } },
      disabledAgents: ["general"],
    });
    const config = {
      permission: {},
      agent: {
        general: { model: "openai/general", description: "General" },
        explore: { model: "openai/explore", description: "Explore", prompt: "Old prompt" },
      },
    };
    const hooks = await serverPlugin({} as never);
    await hooks.config?.(config as never);

    expect(config.agent.general).toBeUndefined();
    expect((config.agent as Record<string, unknown>).explore).toMatchObject({
      model: "openai/assigned-explore",
      variant: "high",
      description: "Edited Explore",
      prompt: "Use Explore safely.",
      skills: ["testing"],
    });
    expect((config.permission as { task?: Record<string, string> }).task?.general).toBe("deny");

    await hooks["chat.message"]?.({ sessionID: "disabled", agent: "gentle-orchestrator", messageID: "m1" }, {
      message: { id: "m1", agent: "gentle-orchestrator" } as never,
      parts: [{ type: "text", text: "usa también agente: general" }] as never,
    });
    await expect(hooks["tool.execute.before"]?.({ tool: "task", sessionID: "disabled", callID: "c1" }, { args: { subagent_type: "general" } })).rejects.toThrow(/disabled|desactiv/i);
  });

  it("rejects explicit current-turn grants for a disabled target even when the ledger contains one", async () => {
    const hooks = createAgentSuiteServer({ knownAgents: () => ["general"], disabledAgents: () => ["general"] });
    await hooks["chat.message"]({ sessionID: "s", agent: "gentle-orchestrator", messageID: "m1" }, { message: { id: "m1", agent: "gentle-orchestrator" } as never, parts: [{ type: "text", text: "usa también agente: general" }] as never });
    await expect(hooks["tool.execute.before"]({ tool: "task", sessionID: "s", callID: "c1" }, { args: { subagent_type: "general" } })).rejects.toThrow(/disabled|desactiv/i);
  });

  it("reloads deactivation and reactivation for the live server session", async () => {
    saveSuiteConfig(defaultSuitePath(), { version: 1, customAgents: {}, modelAssignments: {}, variantAssignments: {} });
    const hooks = await serverPlugin({} as never);
    await hooks.config?.({ permission: {}, agent: { general: {} } } as never);

    const enabled = { message: { id: "m1", agent: "gentle-orchestrator" }, parts: [{ type: "text", text: "usa también agente: general" }] } as never;
    await hooks["chat.message"]?.({ sessionID: "live", messageID: "m1" }, enabled);
    expect((enabled as { parts: Array<Record<string, unknown>> }).parts).toContainEqual(expect.objectContaining({ type: "agent", name: "general" }));

    saveSuiteConfig(defaultSuitePath(), { version: 1, customAgents: {}, modelAssignments: {}, variantAssignments: {}, disabledAgents: ["general"] });
    const disabled = { message: { id: "m2", agent: "gentle-orchestrator" }, parts: [{ type: "text", text: "usa también agente: general" }] } as never;
    await hooks["chat.message"]?.({ sessionID: "live", messageID: "m2" }, disabled);
    expect((disabled as { parts: Array<Record<string, unknown>> }).parts.some((part) => part.type === "agent")).toBe(false);
    await expect(hooks["tool.execute.before"]?.({ tool: "task", sessionID: "live", callID: "c2" }, { args: { subagent_type: "general" } })).rejects.toThrow(/disabled|desactiv/i);

    saveSuiteConfig(defaultSuitePath(), { version: 1, customAgents: {}, modelAssignments: {}, variantAssignments: {} });
    const reactivated = { message: { id: "m3", agent: "gentle-orchestrator" }, parts: [{ type: "text", text: "usa también agente: general" }] } as never;
    await hooks["chat.message"]?.({ sessionID: "live", messageID: "m3" }, reactivated);
    expect((reactivated as { parts: Array<Record<string, unknown>> }).parts).toContainEqual(expect.objectContaining({ type: "agent", name: "general" }));
    await expect(hooks["tool.execute.before"]?.({ tool: "task", sessionID: "live", callID: "c3" }, { args: { subagent_type: "general" } })).resolves.toBeUndefined();
  });

  it("fails closed on a corrupt live suite reload and recovers after repair", async () => {
    saveSuiteConfig(defaultSuitePath(), { version: 1, customAgents: {}, modelAssignments: {}, variantAssignments: {} });
    const hooks = await serverPlugin({} as never);
    await hooks.config?.({ permission: {}, agent: { general: {} } } as never);
    writeFileSync(defaultSuitePath(), "{\"broken\":", "utf8");

    const corrupt = { message: { id: "m1", agent: "gentle-orchestrator" }, parts: [{ type: "text", text: "usa también agente: general" }] } as never;
    await hooks["chat.message"]?.({ sessionID: "corrupt", messageID: "m1" }, corrupt);
    expect((corrupt as { parts: Array<Record<string, unknown>> }).parts).toEqual([{ type: "text", text: "usa también agente: general" }]);
    await expect(hooks["tool.execute.before"]?.({ tool: "task", sessionID: "corrupt", callID: "c1" }, { args: { subagent_type: "general" } })).rejects.toThrow(/suite config/i);
  });

  it("expires session grants and exposes list/revoke command surfaces", async () => {
    const hooks = createAgentSuiteServer({ knownAgents: () => ["general", "explore"] });
    await hooks["chat.message"]({ sessionID: "s", agent: "general", messageID: "m1" }, { message: { id: "m1", agent: "general" } as never, parts: [] as never });
    const grant = hooks.grantConsent({ sessionID: "s", requester: "general", target: "explore", purpose: "search", operation: "task" });
    expect(hooks.listGrants("s")).toEqual([expect.objectContaining({ id: grant.id, requester: "general", target: "explore", purpose: "search", operation: "task", duration: "current-session" })]);
    await expect(hooks["tool.execute.before"]({ tool: "task", sessionID: "s", callID: "allowed" }, { args: { subagent_type: "explore" } })).resolves.toBeUndefined();
    await hooks.event({ event: { type: "session.deleted", properties: { info: { id: "s" } } } } as never);
    await expect(hooks["tool.execute.before"]({ tool: "task", sessionID: "s", callID: "expired" }, { args: { subagent_type: "explore" } })).rejects.toThrow("current turn");
    const output = { parts: [] as never[] };
    await hooks["command.execute.before"]({ command: "agent-suite-grants", sessionID: "s", arguments: "" }, output as never);
    expect(output.parts[0]).toMatchObject({ type: "text", text: "No active session grants." });
    hooks.grantConsent({ sessionID: "s", requester: "general", target: "explore", purpose: "search", operation: "task" });
    await hooks["command.execute.before"]({ command: "agent-suite-revoke", sessionID: "s", arguments: "explore" }, { parts: [] } as never);
    expect(hooks.listGrants("s")).toEqual([]);
  });
});
