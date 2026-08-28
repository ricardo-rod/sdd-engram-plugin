import { describe, expect, it } from "vitest";
import { parseSuiteConfig, patchCustomAgent, setAgentModelAssignment, validateAgentId, validateModelId, validateSkillId, validateVariantId } from "../src/core/config.ts";
import { restoreBuiltInBaseline } from "../src/core/built-in-agents.ts";
import { normalizeAgentId } from "../src/core/built-in-agents.ts";

const customAgent = {
  id: "local-helper",
  description: "A local helper",
  model: "openai/gpt-5.6-luna",
  prompt: "Help locally",
  permissions: { "*:read": "allow" as const },
  skills: ["testing"],
};

describe("suite config", () => {
  it("patches a custom agent without mutating input and re-keys assignments in the v1 shape", () => {
    const config = parseSuiteConfig({
      version: 1,
      customAgents: {
        "local-helper": customAgent,
        "other-agent": { ...customAgent, id: "other-agent" },
      },
      modelAssignments: { "local-helper": "openai/assigned", "other-agent": "openai/other" },
      variantAssignments: { "local-helper": "high", "other-agent": "low" },
    });

    const patched = patchCustomAgent(config, "local-helper", {
      newId: "renamed-helper",
      description: "Updated helper",
      skills: ["testing", "linting"],
      operations: "Help better locally",
    });

    expect(patched).toEqual({
      version: 1,
      customAgents: {
        "renamed-helper": {
          ...customAgent,
          id: "renamed-helper",
          description: "Updated helper",
          skills: ["testing", "linting"],
          prompt: "Help better locally",
        },
        "other-agent": { ...customAgent, id: "other-agent" },
      },
      modelAssignments: { "renamed-helper": "openai/assigned", "other-agent": "openai/other" },
      variantAssignments: { "renamed-helper": "high", "other-agent": "low" },
    });
    expect(config).toEqual(parseSuiteConfig({
      version: 1,
      customAgents: {
        "local-helper": customAgent,
        "other-agent": { ...customAgent, id: "other-agent" },
      },
      modelAssignments: { "local-helper": "openai/assigned", "other-agent": "openai/other" },
      variantAssignments: { "local-helper": "high", "other-agent": "low" },
    }));
  });

  it("rejects invalid and colliding patch IDs before changing the registry", () => {
    const config = parseSuiteConfig({ version: 1, customAgents: { "local-helper": customAgent }, modelAssignments: {}, variantAssignments: {} });
    const before = structuredClone(config);
    expect(() => patchCustomAgent(config, "local-helper", { newId: "../escape" })).toThrow(/invalid|identificador|id/i);
    expect(() => patchCustomAgent(config, "local-helper", { newId: "general" })).toThrow(/collision|colisi[oó]n|seed|existe|exists/i);
    expect(() => patchCustomAgent(config, "local-helper", { newId: "local-helper" })).not.toThrow();
    expect(config).toEqual(before);
  });

  it("rejects patch IDs reserved by either assignment map", () => {
    const config = parseSuiteConfig({
      version: 1,
      customAgents: { "local-helper": customAgent },
      modelAssignments: { "model-reserved": "openai/reserved" },
      variantAssignments: { "variant-reserved": "high" },
    });

    expect(() => patchCustomAgent(config, "local-helper", { newId: "model-reserved" })).toThrow(/collision|colisi[oó]n|assignment|asignaci[oó]n/i);
    expect(() => patchCustomAgent(config, "local-helper", { newId: "variant-reserved" })).toThrow(/collision|colisi[oó]n|assignment|asignaci[oó]n/i);
    expect(config.customAgents["local-helper"]).toEqual(customAgent);
  });

  it("validates skill IDs using the same safe slug rules", () => {
    expect(validateSkillId("testing")).toBe("testing");
    expect(validateSkillId("linting-tools")).toBe("linting-tools");
    expect(() => validateSkillId("")).toThrow(/skill|habilidad|invalid/i);
    expect(() => validateSkillId("bad value")).toThrow(/skill|habilidad|invalid/i);
    expect(() => validateSkillId("../escape")).toThrow(/skill|habilidad|invalid/i);
  });

  it("parses the minimal registry without suite or profile state", () => {
    expect(() => validateAgentId("../escape")).toThrow();
    expect(parseSuiteConfig({ version: 1, customAgents: {} })).toEqual({ version: 1, customAgents: {}, modelAssignments: {}, variantAssignments: {} });
    expect(parseSuiteConfig({ version: 1, customAgents: { "local-helper": customAgent } })).toEqual({
      version: 1,
      customAgents: { "local-helper": customAgent },
      modelAssignments: {},
      variantAssignments: {},
    });
  });

  it("preserves an ignored legacy coordinator field without making it a plugin feature", () => {
    const existing = parseSuiteConfig({ version: 1, customAgents: {}, modelAssignments: {}, variantAssignments: {} });
    const configured = parseSuiteConfig({
      version: 1,
      customAgents: {},
      modelAssignments: {},
      variantAssignments: {},
      coordinator: { provider: "anthropic", model: "claude-sonnet-4-5", effort: "extra-high" },
    });

    expect(existing).not.toHaveProperty("coordinator");
    expect(configured.coordinator).toEqual({ provider: "anthropic", model: "claude-sonnet-4-5", effort: "extra-high" });
  });

  it("parses independent per-agent model assignments and rejects invalid IDs", () => {
    const parsed = parseSuiteConfig({
      version: 1,
      customAgents: {},
      modelAssignments: {
        general: "openai/gpt-5.6-luna",
        "agent-especialit-github": "anthropic/claude-sonnet",
      },
      variantAssignments: {
        general: "high",
      },
    });

    expect(parsed.modelAssignments).toEqual({
      general: "openai/gpt-5.6-luna",
      "agent-github": "anthropic/claude-sonnet",
    });
    expect(parsed.variantAssignments).toEqual({ general: "high" });
    expect(() => parseSuiteConfig({ version: 1, customAgents: {}, modelAssignments: { "../escape": "openai/x" } })).toThrow();
    expect(() => parseSuiteConfig({ version: 1, customAgents: {}, modelAssignments: { general: "invalid-model" } })).toThrow(/model/i);
    expect(() => validateVariantId("bad value")).toThrow(/variant/i);
    expect(() => validateVariantId("unsafe:key")).toThrow(/variant/i);
    expect(() => parseSuiteConfig({ version: 1, customAgents: {}, variantAssignments: { general: "../escape" } })).toThrow(/variant/i);
  });

  it("accepts nested provider model paths while rejecting whitespace and traversal", () => {
    expect(validateModelId("cliproxyapi/cuenta-2/gpt-5.6-sol")).toBe("cliproxyapi/cuenta-2/gpt-5.6-sol");
    expect(validateModelId("cliproxyapi/tokenrouter-1/qwen/qwen3.8-max-free")).toBe("cliproxyapi/tokenrouter-1/qwen/qwen3.8-max-free");
    expect(() => validateModelId("cliproxyapi/GPT_cuenta.2: 5.6-SOL")).toThrow(/model/i);
    expect(() => validateModelId("cliproxyapi/../escape")).toThrow(/model/i);
    expect(() => validateModelId("cliproxyapi//gpt-5")).toThrow(/model/i);
  });

  it("changes one assignment without replacing the other agents", () => {
    const config = parseSuiteConfig({
      version: 1,
      customAgents: {},
      modelAssignments: { general: "openai/old", "agent-github": "openai/keep" },
      variantAssignments: { general: "high", "agent-github": "medium" },
    });

    expect(setAgentModelAssignment(config, "general", "openai/new")).toEqual({
      version: 1,
      customAgents: {},
      modelAssignments: { general: "openai/new", "agent-github": "openai/keep" },
      variantAssignments: { "agent-github": "medium" },
    });

    expect(setAgentModelAssignment(config, "general", "openai/new", "low").variantAssignments).toEqual({
      general: "low",
      "agent-github": "medium",
    });
  });

  it("clears a prior effort when assigning a nested model with default effort", () => {
    const config = parseSuiteConfig({
      version: 1,
      customAgents: {},
      modelAssignments: { "agent-github": "opencode/x-preview-f-free" },
      variantAssignments: { "agent-github": "low" },
    });

    expect(setAgentModelAssignment(config, "agent-especialit-github", "cliproxyapi/google-1/gemini-3.7-flash-high")).toEqual({
      version: 1,
      customAgents: {},
      modelAssignments: { "agent-github": "cliproxyapi/google-1/gemini-3.7-flash-high" },
      variantAssignments: {},
    });
  });

  it("rejects invalid and seed-duplicate custom identifiers", () => {
    expect(() => parseSuiteConfig({ version: 1, customAgents: { "../escape": customAgent } })).toThrow();
    expect(() => parseSuiteConfig({ version: 1, customAgents: { general: { ...customAgent, id: "general" } } })).toThrow(/duplicate|duplic|seed|Suite/i);
  });

  it("rejects non-empty legacy assignments in Spanish", () => {
    const legacy = {
      version: 1,
      activeSuite: "default",
      suites: { default: { agents: { general: "openai/gpt-5.6-luna" } } },
      customAgents: {},
    };
    expect(() => parseSuiteConfig(legacy)).toThrow(/asignaciones|migraci[oó]n/i);
  });

  it("accepts the current empty legacy shape as the minimal registry", () => {
    expect(parseSuiteConfig({
      version: 1,
      activeSuite: "default",
      suites: { default: { agents: {} } },
      customAgents: {},
    })).toEqual({ version: 1, customAgents: {}, modelAssignments: {}, variantAssignments: {} });
  });

  it("normalizes validated base overrides and disabled agent ids without changing legacy output", () => {
    expect(parseSuiteConfig({
      version: 1,
      customAgents: { "local-helper": customAgent },
      modelAssignments: { general: "openai/assigned" },
      variantAssignments: { general: "high" },
      builtInOverrides: {
        general: { description: "A safer general agent", skills: ["testing"], operations: "Use the requested tools." },
      },
      disabledAgents: ["general", "general"],
    })).toEqual({
      version: 1,
      customAgents: { "local-helper": customAgent },
      modelAssignments: { general: "openai/assigned" },
      variantAssignments: { general: "high" },
      builtInOverrides: {
        general: { description: "A safer general agent", skills: ["testing"], operations: "Use the requested tools." },
      },
      disabledAgents: ["general"],
    });
  });

  it("validates override ownership and rejects prototype-pollution keys", () => {
    expect(() => parseSuiteConfig({
      version: 1,
      customAgents: { "local-helper": customAgent },
      baseOverrides: { "local-helper": { description: "not a base agent" } },
    })).toThrow(/base|seed|sistema|agent/i);
    expect(() => parseSuiteConfig({
      version: 1,
      customAgents: {},
      disabledAgents: ["__proto__"],
    })).toThrow(/id|identificador|invalid/i);
    expect(() => parseSuiteConfig({
      version: 1,
      customAgents: {},
      baseOverrides: { general: { skills: ["bad value"] } },
    })).toThrow(/skill|habilidad|invalid/i);
  });

  it("migrates legacy base overrides to validated built-in overrides without losing custom settings", () => {
    const config = parseSuiteConfig({
      version: 1,
      customAgents: { "local-helper": customAgent },
      modelAssignments: { "local-helper": "openai/assigned" },
      variantAssignments: {},
      baseOverrides: {
        build: { description: "Compilador personalizado", skills: ["testing"], operations: "Compila con cuidado." },
      },
      disabledAgents: ["build"],
      advancedOverrides: { allowInternalDisable: true },
    });

    expect(config).toMatchObject({
      customAgents: { "local-helper": customAgent },
      modelAssignments: { "local-helper": "openai/assigned" },
      builtInOverrides: {
        build: { description: "Compilador personalizado", skills: ["testing"], operations: "Compila con cuidado." },
      },
      disabledAgents: ["build"],
      advancedOverrides: { allowInternalDisable: true },
    });
    expect(config).not.toHaveProperty("baseOverrides");
  });

  it("accepts valid built-in settings but rejects unknown or malformed built-in configuration before persistence", () => {
    const valid = parseSuiteConfig({
      version: 1,
      customAgents: {},
      builtInOverrides: { plan: { model: "openai/gpt-5.6-luna", effort: "high", skills: ["planning"] } },
      disabledAgents: ["plan"],
      advancedOverrides: { allowInternalDisable: false },
    });

    expect(valid.builtInOverrides?.plan).toEqual({ model: "openai/gpt-5.6-luna", effort: "high", skills: ["planning"] });
    expect(() => parseSuiteConfig({ version: 1, customAgents: {}, builtInOverrides: { "invalid-agent": { effort: "high" } } })).toThrow(/built-in|integrado|override/i);
    expect(() => parseSuiteConfig({ version: 1, customAgents: {}, disabledAgents: ["invalid-agent"] })).toThrow(/disabled|deshabilitado|unknown/i);
    expect(() => parseSuiteConfig({ version: 1, customAgents: {}, advancedOverrides: { allowInternalDisable: "yes" } })).toThrow(/advanced|avanzad/i);
  });

  it("restores only the selected built-in override and preserves every other override", () => {
    expect(restoreBuiltInBaseline("explore", {
      explore: { model: "openai/custom", operations: "Custom operation" },
      build: { effort: "high" },
    })).toEqual({ build: { effort: "high" } });
    expect(() => restoreBuiltInBaseline("invalid-agent")).toThrow(/built-in|integrado|unknown/i);
  });

  it("normalizes built-in overrides in persisted configuration with canonical fields winning", () => {
    const parsed = parseSuiteConfig({
      version: 1,
      customAgents: {},
      modelAssignments: {
        general: "openai/assigned-general",
        explore: "openai/assigned-explore",
      },
      variantAssignments: { general: "low" },
      baseOverrides: { general: { description: "Legacy description", operations: "Legacy operation" } },
      builtInOverrides: { general: { description: "Canonical description" } },
      disabledAgents: ["explore"],
    });

    expect(parsed.modelAssignments).toEqual({
      general: "openai/assigned-general",
      explore: "openai/assigned-explore",
    });
    expect(parsed.variantAssignments).toEqual({ general: "low" });
    expect(parsed.builtInOverrides).toEqual({
      general: { description: "Canonical description", operations: "Legacy operation" },
    });
    expect(parsed.disabledAgents).toEqual(["explore"]);
  });

  it("rejects a custom identity duplicating a canonical seed member", () => {
    expect(() => parseSuiteConfig({
      version: 1,
      customAgents: {
        general: { ...customAgent, id: "general" },
      },
    })).toThrow(/duplicate|seed|canonical/i);
  });
});
