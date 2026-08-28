import { describe, expect, it } from "vitest";
import {
  applyProfileReasoningEffort,
  buildReasoningEditState,
  DEFAULT_REASONING_EFFORT_LABEL,
  PROVIDER_DEFAULT_REASONING_EFFORT,
  getReasoningEffortOptions,
  normalizeProfileConfigs,
  pruneProfileReasoningEffort,
  resolveReasoningEffortSelection,
  updateProfileReasoningEffort,
} from "./profile-reasoning";
import { getOrchestratorPolicy } from "./orchestrator";

describe("profile reasoning helpers", () => {
  describe("buildReasoningEditState", () => {
    const providers = [
      {
        id: "openai",
        models: {
          "gpt-5": {
            capabilities: { reasoning: true },
            variants: {
              default: { reasoningEffort: "low" },
              high: { reasoningEffort: "high" },
              duplicate: { reasoningEffort: "low" },
            },
          },
          "gpt-4.1": {
            capabilities: { reasoning: false },
            variants: {
              default: {},
            },
          },
        },
      },
    ];

    it("returns selectable with unique options when metadata supports reasoning", () => {
      const state = buildReasoningEditState(providers as any, "sdd-apply", "openai/gpt-5", "low");

      expect(state).toEqual({
        kind: "selectable",
        agentName: "sdd-apply",
        modelId: "openai/gpt-5",
        options: ["high", "low"],
        current: "low",
      });
    });

    it("returns missing-model when no model is assigned", () => {
      const state = buildReasoningEditState(providers as any, "sdd-apply", undefined, "low");
      expect(state).toEqual({ kind: "missing-model", agentName: "sdd-apply" });
    });

    it("offers provider default when model disables reasoning or lacks effort variants", () => {
      const disabled = buildReasoningEditState(providers as any, "sdd-apply", "openai/gpt-4.1");
      expect(disabled).toEqual({
        kind: "provider-default",
        agentName: "sdd-apply",
        modelId: "openai/gpt-4.1",
        options: [PROVIDER_DEFAULT_REASONING_EFFORT],
        optionLabel: DEFAULT_REASONING_EFFORT_LABEL,
      });

      const noMetadata = buildReasoningEditState(providers as any, "sdd-apply", "openai/unknown");
      expect(noMetadata).toEqual({
        kind: "provider-default",
        agentName: "sdd-apply",
        modelId: "openai/unknown",
        options: [PROVIDER_DEFAULT_REASONING_EFFORT],
        optionLabel: DEFAULT_REASONING_EFFORT_LABEL,
      });
    });

    it("resolves provider default without producing a persisted literal", () => {
      expect(resolveReasoningEffortSelection(providers as any, "openai/gpt-4.1", PROVIDER_DEFAULT_REASONING_EFFORT)).toEqual({
        kind: "provider-default",
        value: undefined,
        option: PROVIDER_DEFAULT_REASONING_EFFORT,
        label: DEFAULT_REASONING_EFFORT_LABEL,
      });
      expect(resolveReasoningEffortSelection(providers as any, "openai/gpt-4.1", DEFAULT_REASONING_EFFORT_LABEL)).toEqual({
        kind: "provider-default",
        value: undefined,
        option: PROVIDER_DEFAULT_REASONING_EFFORT,
        label: DEFAULT_REASONING_EFFORT_LABEL,
      });
    });

    it("rejects custom effort when the selected model exposes only provider default", () => {
      expect(() => resolveReasoningEffortSelection(providers as any, "openai/gpt-4.1", "high"))
        .toThrow("not available");
    });

    it("does not expose provider-default tokens as a saved current effort", () => {
      expect(buildReasoningEditState(
        providers as any,
        "sdd-apply",
        "openai/gpt-5",
        PROVIDER_DEFAULT_REASONING_EFFORT,
      )).toEqual({
        kind: "selectable",
        agentName: "sdd-apply",
        modelId: "openai/gpt-5",
        options: ["high", "low"],
      });
    });
  });

  describe("normalizeProfileConfigs", () => {
    it("keeps only primary agents with trimmed reasoning effort", () => {
      const normalized = normalizeProfileConfigs({
        "sdd-apply": { reasoningEffort: " high " },
        "sdd-apply-fallback": { reasoningEffort: "low" },
        "sdd-init": { unknown: "x", reasoningEffort: "" },
      } as any);

      expect(normalized).toEqual({
        "sdd-apply": { reasoningEffort: "high" },
      });
    });

    it("returns undefined for empty or invalid config maps", () => {
      expect(normalizeProfileConfigs(undefined)).toBeUndefined();
      expect(normalizeProfileConfigs({ "sdd-apply": { reasoningEffort: "   " } } as any)).toBeUndefined();
    });

    it("normalizes provider-default labels and tokens to an absent persisted value", () => {
      expect(normalizeProfileConfigs({
        "sdd-apply": { reasoningEffort: PROVIDER_DEFAULT_REASONING_EFFORT },
        "sdd-spec": { reasoningEffort: DEFAULT_REASONING_EFFORT_LABEL },
      } as any)).toBeUndefined();
    });

    it("canonicalizes orchestrator aliases to gentle-orchestrator in updated runtime policy", () => {
      const policy = getOrchestratorPolicy(["gentle-orchestrator", "sdd-init"]);
      const normalized = normalizeProfileConfigs({
        "sdd-orchestrator": { reasoningEffort: "high" },
      } as any, policy);

      expect(normalized).toEqual({ "gentle-orchestrator": { reasoningEffort: "high" } });
    });

    it("canonicalizes orchestrator aliases to sdd-orchestrator in legacy runtime policy", () => {
      const policy = getOrchestratorPolicy(["sdd-orchestrator", "sdd-init"]);
      const normalized = normalizeProfileConfigs({
        "gentle-orchestrator": { reasoningEffort: "low" },
      } as any, policy);

      expect(normalized).toEqual({ "sdd-orchestrator": { reasoningEffort: "low" } });
    });

    it("accepts editable custom primaries while rejecting reserved and fallback owners", () => {
      const normalized = normalizeProfileConfigs({
        "security-auditor": { reasoningEffort: " high " },
        "sdd-orchestrator": { reasoningEffort: "high" },
        "security-auditor-fallback": { reasoningEffort: "low" },
      });

      expect(normalized).toEqual({
        "security-auditor": { reasoningEffort: "high" },
      });
    });

    it("preserves a valid fallback effort only when its eligible owner has a fallback model", () => {
      const normalized = normalizeProfileConfigs(
        {
          "sdd-init": { reasoningEffort: "high" },
          "sdd-init-fallback": { reasoningEffort: "low" },
        },
        undefined,
        false,
        { "sdd-init": "openai/gpt-5" },
      );

      expect(normalized).toEqual({
        "sdd-init": { reasoningEffort: "high" },
        "sdd-init-fallback": { reasoningEffort: "low" },
      });
    });

    it("prunes orphan and reserved fallback efforts while retaining provider-default for valid fallback owners", () => {
      const normalized = normalizeProfileConfigs(
        {
          "sdd-init-fallback": { reasoningEffort: PROVIDER_DEFAULT_REASONING_EFFORT },
          "unknown-fallback": { reasoningEffort: "high" },
          "summary-fallback": { reasoningEffort: "low" },
        },
        undefined,
        true,
        { "sdd-init": "anthropic/claude-3-5-sonnet" },
      );

      expect(normalized).toEqual({
        "sdd-init-fallback": { reasoningEffort: PROVIDER_DEFAULT_REASONING_EFFORT },
      });
    });
  });

  describe("updateProfileReasoningEffort", () => {
    it("sets one primary agent reasoning effort without changing models/fallback", () => {
      const profile = {
        models: { "sdd-apply": "openai/gpt-5" },
        fallback: { "sdd-apply": "openai/gpt-4.1" },
      } as any;

      const updated = updateProfileReasoningEffort(profile, "sdd-apply", " medium ");
      expect(updated).toEqual({
        models: { "sdd-apply": "openai/gpt-5" },
        fallback: { "sdd-apply": "openai/gpt-4.1" },
        configs: { "sdd-apply": { reasoningEffort: "medium" } },
      });
    });

    it("removes entry when value is blank and drops empty configs", () => {
      const updated = updateProfileReasoningEffort({
        models: { "sdd-apply": "openai/gpt-5" },
        configs: { "sdd-apply": { reasoningEffort: "high" } },
      } as any, "sdd-apply", "   ");

      expect(updated).toEqual({ models: { "sdd-apply": "openai/gpt-5" } });
    });

    it("maps provider default and its display label to absence instead of persisting either literal", () => {
      const profile = {
        models: { "sdd-apply": "openai/gpt-5" },
        configs: { "sdd-apply": { reasoningEffort: "high" } },
      } as any;

      expect(updateProfileReasoningEffort(profile, "sdd-apply", PROVIDER_DEFAULT_REASONING_EFFORT)).toEqual({
        models: { "sdd-apply": "openai/gpt-5" },
      });
      expect(updateProfileReasoningEffort(profile, "sdd-apply", DEFAULT_REASONING_EFFORT_LABEL)).toEqual({
        models: { "sdd-apply": "openai/gpt-5" },
      });
    });

    it("updates custom primary effort but leaves reserved and fallback agents unchanged", () => {
      const profile = {
        models: {
          "security-auditor": "openai/gpt-5",
          "sdd-orchestrator": "openai/gpt-5",
        },
        configs: {
          "sdd-orchestrator": { reasoningEffort: "high" },
          "security-auditor-fallback": { reasoningEffort: "low" },
        },
      } as any;

      expect(updateProfileReasoningEffort(profile, "security-auditor", "medium")).toEqual({
        models: {
          "security-auditor": "openai/gpt-5",
          "sdd-orchestrator": "openai/gpt-5",
        },
        configs: { "security-auditor": { reasoningEffort: "medium" } },
      });
      expect(updateProfileReasoningEffort(profile, "sdd-orchestrator", "low")).toBe(profile);
      expect(updateProfileReasoningEffort(profile, "security-auditor-fallback", "low")).toBe(profile);
    });
  });

  describe("reasoning model compatibility", () => {
    const providers = [
      {
        id: "openai",
        models: {
          "gpt-5": {
            capabilities: { reasoning: true },
            variants: {
              low: { reasoningEffort: "low" },
              high: { reasoningEffort: "high" },
            },
          },
          "gpt-4.1": { capabilities: { reasoning: false } },
        },
      },
    ];

    it("exposes supported options and prunes incompatible or unsupported saved effort", () => {
      expect(getReasoningEffortOptions(providers as any, "openai/gpt-5")).toEqual(["high", "low"]);
      expect(getReasoningEffortOptions(providers as any, "openai/gpt-4.1")).toEqual([]);

      const compatible = pruneProfileReasoningEffort(
        { models: { "security-auditor": "openai/gpt-5" }, configs: { "security-auditor": { reasoningEffort: "high" } } },
        "security-auditor",
        "openai/gpt-5",
        providers as any,
      );
      expect(compatible.configs?.["security-auditor"]?.reasoningEffort).toBe("high");

      const incompatible = pruneProfileReasoningEffort(
        { models: { "security-auditor": "openai/gpt-5" }, configs: { "security-auditor": { reasoningEffort: "max" } } },
        "security-auditor",
        "openai/gpt-5",
        providers as any,
      );
      expect(incompatible.configs).toBeUndefined();

      const unsupported = pruneProfileReasoningEffort(
        { models: { "security-auditor": "openai/gpt-5" }, configs: { "security-auditor": { reasoningEffort: "high" } } },
        "security-auditor",
        "openai/gpt-4.1",
        providers as any,
      );
      expect(unsupported.configs).toBeUndefined();
    });

    it("prunes a legacy orchestrator effort when the runtime policy identifies its alias", () => {
      const policy = getOrchestratorPolicy(["sdd-orchestrator"]);
      const pruned = (pruneProfileReasoningEffort as any)(
        {
          models: { "sdd-orchestrator": "openai/gpt-5" },
          configs: { "sdd-orchestrator": { reasoningEffort: "max" } },
        },
        "sdd-orchestrator",
        "openai/gpt-5",
        providers as any,
        policy,
      );

      expect(pruned.configs).toBeUndefined();
    });
  });

  describe("applyProfileReasoningEffort", () => {
    const providers = [
      {
        id: "openai",
        models: {
          "gpt-5": {
            capabilities: { reasoning: true },
            variants: {
              low: { reasoningEffort: "low" },
              high: { reasoningEffort: "high" },
            },
          },
        },
      },
    ];

    it("applies only valid primary reasoning values", () => {
      const next = applyProfileReasoningEffort({
        agent: {
          "sdd-apply": { model: "openai/gpt-5", options: {} },
          "sdd-apply-fallback": { model: "openai/gpt-4.1" },
        },
      }, {
        models: { "sdd-apply": "openai/gpt-5" },
        configs: {
          "sdd-apply": { reasoningEffort: "high" },
          "sdd-apply-fallback": { reasoningEffort: "low" },
        },
      } as any, providers as any);

      expect(next.config.agent["sdd-apply"].reasoningEffort).toBe("high");
      expect(next.config.agent["sdd-apply"].options.reasoningEffort).toBe("high");
      expect(next.config.agent["sdd-apply-fallback"].reasoningEffort).toBeUndefined();
      expect(next.appliedAgents).toEqual(["sdd-apply"]);
      expect(next.clearedAgents).toEqual([]);
      expect(next.warnings).toEqual([]);
    });

    it("skips stale or unverifiable values and emits warnings", () => {
      const stale = applyProfileReasoningEffort({
        agent: {
          "sdd-apply": { model: "openai/gpt-5", reasoningEffort: "low", options: { reasoningEffort: "low" } },
        },
      }, {
        models: { "sdd-apply": "openai/gpt-5" },
        configs: { "sdd-apply": { reasoningEffort: "medium" } },
      } as any, providers as any);

      expect(stale.appliedAgents).toEqual([]);
      expect(stale.clearedAgents).toEqual(["sdd-apply"]);
      expect(stale.config.agent["sdd-apply"].reasoningEffort).toBeUndefined();
      expect(stale.config.agent["sdd-apply"].options.reasoningEffort).toBeUndefined();
      expect(stale.warnings[0]).toContain("incompatible");

      const missingMetadata = applyProfileReasoningEffort({
        agent: {
          "sdd-apply": { model: "anthropic/sonnet", reasoningEffort: "high", options: { reasoningEffort: "high" } },
        },
      }, {
        models: { "sdd-apply": "anthropic/sonnet" },
        configs: { "sdd-apply": { reasoningEffort: "high" } },
      } as any, providers as any);

      expect(missingMetadata.appliedAgents).toEqual([]);
      expect(missingMetadata.clearedAgents).toEqual(["sdd-apply"]);
      expect(missingMetadata.config.agent["sdd-apply"].reasoningEffort).toBeUndefined();
      expect(missingMetadata.config.agent["sdd-apply"].options.reasoningEffort).toBeUndefined();
      expect(missingMetadata.warnings[0]).toContain("metadata");
    });

    it("applies orchestrator reasoning effort using updated runtime canonical alias", () => {
      const policy = getOrchestratorPolicy(["gentle-orchestrator", "sdd-init"]);
      const next = applyProfileReasoningEffort({
        agent: {
          "gentle-orchestrator": { model: "openai/gpt-5" },
        },
      }, {
        models: { "sdd-orchestrator": "openai/gpt-5" },
        configs: { "sdd-orchestrator": { reasoningEffort: "high" } },
      } as any, providers as any, policy);

      expect(next.config.agent["gentle-orchestrator"].reasoningEffort).toBe("high");
      expect(next.config.agent["sdd-orchestrator"]).toBeUndefined();
      expect(next.appliedAgents).toEqual(["gentle-orchestrator"]);
      expect(next.clearedAgents).toEqual([]);
    });

    it("applies orchestrator reasoning effort using legacy runtime canonical alias", () => {
      const policy = getOrchestratorPolicy(["sdd-orchestrator", "sdd-init"]);
      const next = applyProfileReasoningEffort({
        agent: {
          "sdd-orchestrator": { model: "openai/gpt-5" },
        },
      }, {
        models: { "gentle-orchestrator": "openai/gpt-5" },
        configs: { "gentle-orchestrator": { reasoningEffort: "low" } },
      } as any, providers as any, policy);

      expect(next.config.agent["sdd-orchestrator"].reasoningEffort).toBe("low");
      expect(next.config.agent["gentle-orchestrator"]).toBeUndefined();
      expect(next.appliedAgents).toEqual(["sdd-orchestrator"]);
      expect(next.clearedAgents).toEqual([]);
    });

    it("clears stale reasoning effort for scoped primary agents when profile configs are absent", () => {
      const next = applyProfileReasoningEffort({
        agent: {
          "sdd-init": { model: "openai/gpt-5", reasoningEffort: "high", options: { reasoningEffort: "high" } },
          "sdd-apply": { model: "openai/gpt-5", reasoningEffort: "low", options: { reasoningEffort: "low" } },
          "sdd-plan": { model: "openai/gpt-5", reasoningEffort: "medium" },
        },
      }, {
        models: {
          "sdd-init": "openai/gpt-5",
          "sdd-apply": "openai/gpt-5",
        },
      } as any, providers as any);

      expect(next.config.agent["sdd-init"].reasoningEffort).toBeUndefined();
      expect(next.config.agent["sdd-init"].options.reasoningEffort).toBeUndefined();
      expect(next.config.agent["sdd-apply"].reasoningEffort).toBeUndefined();
      expect(next.config.agent["sdd-apply"].options.reasoningEffort).toBeUndefined();
      expect(next.config.agent["sdd-plan"].reasoningEffort).toBe("medium");
      expect(next.appliedAgents).toEqual([]);
      expect(next.clearedAgents.sort()).toEqual(["sdd-apply", "sdd-init"]);
      expect(next.warnings).toEqual([]);
    });

    it("clears stale orchestrator reasoning effort using updated runtime canonical alias when configs are absent", () => {
      const policy = getOrchestratorPolicy(["gentle-orchestrator", "sdd-init"]);
      const next = applyProfileReasoningEffort({
        agent: {
          "gentle-orchestrator": { model: "openai/gpt-5", reasoningEffort: "high", options: { reasoningEffort: "high" } },
        },
      }, {
        models: {
          "sdd-orchestrator": "openai/gpt-5",
        },
      } as any, providers as any, policy);

      expect(next.config.agent["gentle-orchestrator"].reasoningEffort).toBeUndefined();
      expect(next.config.agent["gentle-orchestrator"].options.reasoningEffort).toBeUndefined();
      expect(next.config.agent["sdd-orchestrator"]).toBeUndefined();
      expect(next.appliedAgents).toEqual([]);
      expect(next.clearedAgents).toEqual(["gentle-orchestrator"]);
      expect(next.warnings).toEqual([]);
    });

    it("persists auxiliary model reasoning without creating fallback configuration", () => {
      const next = applyProfileReasoningEffort({
        agent: {
          compaction: { model: "openai/gpt-5" },
          summary: { model: "openai/gpt-5" },
          title: { model: "openai/gpt-5" },
        },
      }, {
        models: {
          compaction: "openai/gpt-5",
          summary: "openai/gpt-5",
          title: "openai/gpt-5",
        },
        configs: {
          compaction: { reasoningEffort: "low" },
          summary: { reasoningEffort: "high" },
          title: { reasoningEffort: "low" },
        },
      } as any, providers as any);

      expect(next.config.agent.compaction.reasoningEffort).toBe("low");
      expect(next.config.agent.summary.reasoningEffort).toBe("high");
      expect(next.config.agent.title.reasoningEffort).toBe("low");
      expect(next.config.agent["compaction-fallback"]).toBeUndefined();
      expect(next.appliedAgents).toEqual(["compaction", "summary", "title"]);
    });

    it("applies supported reasoning to a runtime custom primary and ignores inactive or ineligible entries", () => {
      const next = applyProfileReasoningEffort({
        agent: {
          "security-auditor": { model: "openai/gpt-5" },
          "security-auditor-fallback": { model: "openai/gpt-5" },
          "sdd-orchestrator": { model: "openai/gpt-5" },
        },
      }, {
        models: {
          "security-auditor": "openai/gpt-5",
          "inactive-auditor": "openai/gpt-5",
          "sdd-orchestrator": "openai/gpt-5",
        },
        configs: {
          "security-auditor": { reasoningEffort: "high" },
          "inactive-auditor": { reasoningEffort: "low" },
          "security-auditor-fallback": { reasoningEffort: "high" },
          "sdd-orchestrator": { reasoningEffort: "low" },
        },
      } as any, [
        {
          id: "openai",
          models: {
            "gpt-5": {
              capabilities: { reasoning: true },
              variants: {
                low: { reasoningEffort: "low" },
                high: { reasoningEffort: "high" },
              },
            },
          },
        },
      ] as any);

      expect(next.config.agent["security-auditor"].reasoningEffort).toBe("high");
      expect(next.config.agent["security-auditor-fallback"].reasoningEffort).toBeUndefined();
      expect(next.config.agent["sdd-orchestrator"].reasoningEffort).toBeUndefined();
      expect(next.appliedAgents).toEqual(["security-auditor"]);
      expect(next.warnings).toEqual([]);
    });
  });
});
