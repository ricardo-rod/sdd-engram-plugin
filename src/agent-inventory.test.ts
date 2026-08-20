import { describe, expect, it } from "vitest";
import {
  AGENT_FAMILY,
  CONFIGURABLE_BUILTIN_AGENTS,
  EXCLUDED_BUILTIN_AGENTS,
  KNOWN_BUILTIN_AGENTS,
  buildAgentInventory,
  classifyAgentName,
  type AgentFamily,
} from "./agent-inventory";

describe("agent inventory", () => {
  it.each([
    ["sdd-apply", AGENT_FAMILY.SDD, true],
    ["sdd-orchestrator", AGENT_FAMILY.SDD, false],
    ["gentle-orchestrator", AGENT_FAMILY.SDD, false],
    ["jd-judge-a", AGENT_FAMILY.JUDGMENT_DAY, true],
    ["review-risk", AGENT_FAMILY.REVIEW, true],
  ] as const)("classifies managed agent %s", (name, family, fallbackEligible) => {
    expect(classifyAgentName(name)).toEqual({
      family,
      configurable: true,
      fallbackEligible,
    });
  });

  it.each([
    "sdd-apply-fallback",
    "jd-judge-a-fallback",
    "review-risk-fallback",
  ])("classifies managed fallback %s", (name) => {
    expect(classifyAgentName(name)).toEqual({
      family: AGENT_FAMILY.FALLBACK,
      configurable: true,
      fallbackEligible: false,
    });
  });

  it("defines the exact configurable and excluded built-in sets", () => {
    expect(CONFIGURABLE_BUILTIN_AGENTS).toEqual([
      "general",
      "explore",
      "compaction",
      "summary",
      "title",
    ]);
    expect(EXCLUDED_BUILTIN_AGENTS).toEqual(["plan", "build"]);
    expect(KNOWN_BUILTIN_AGENTS).toHaveLength(7);

    for (const name of CONFIGURABLE_BUILTIN_AGENTS) {
      expect(classifyAgentName(name)).toEqual({
        family: AGENT_FAMILY.BUILTIN,
        configurable: true,
        fallbackEligible: false,
      });
    }
    for (const name of EXCLUDED_BUILTIN_AGENTS) {
      expect(classifyAgentName(name)).toEqual({
        family: AGENT_FAMILY.BUILTIN,
        configurable: false,
        fallbackEligible: false,
      });
    }
  });

  it("classifies an unknown loaded agent as configurable custom", () => {
    expect(classifyAgentName("gentle-ai-windows-validator")).toEqual({
      family: AGENT_FAMILY.CUSTOM,
      configurable: true,
      fallbackEligible: false,
    });
  });

  it("unifies loaded and profile agents without adding absent known agents", () => {
    const inventory = buildAgentInventory({
      loadedAgentNames: [
        "sdd-orchestrator",
        "gentle-orchestrator",
        "review-risk",
        "general",
        "plan",
        "gentle-ai-windows-validator",
      ],
      profileAgentNames: ["gentle-orchestrator", "sdd-spec", "summary"],
    });
    const byName = Object.fromEntries(inventory.map((entry) => [entry.name, entry]));

    expect(inventory).toHaveLength(7);
    expect(byName["gentle-orchestrator"]).toMatchObject({
      aliases: ["sdd-orchestrator", "gentle-orchestrator"],
      loaded: true,
      profilePresent: true,
      family: AGENT_FAMILY.SDD,
      configurable: true,
      fallbackEligible: false,
    });
    expect(byName["review-risk"]).toMatchObject({ loaded: true, profilePresent: false, fallbackEligible: true });
    expect(byName["sdd-spec"]).toMatchObject({ loaded: false, profilePresent: true, fallbackEligible: true });
    expect(byName.summary).toMatchObject({ loaded: false, profilePresent: true, configurable: true });
    expect(byName.plan).toMatchObject({ family: AGENT_FAMILY.BUILTIN, configurable: false });
    expect(byName["gentle-ai-windows-validator"]).toMatchObject({
      family: AGENT_FAMILY.CUSTOM,
      loaded: true,
      profilePresent: false,
      configurable: true,
    });
    expect(Object.keys(byName)).not.toEqual(expect.arrayContaining(["explore", "compaction", "title", "build"]));
  });

  it("preserves the legacy orchestrator canonical name when it is the only alias", () => {
    expect(buildAgentInventory({ loadedAgentNames: ["sdd-orchestrator"] })).toEqual([
      expect.objectContaining({
        name: "sdd-orchestrator",
        aliases: ["sdd-orchestrator"],
        loaded: true,
        profilePresent: false,
      }),
    ]);
  });

  it("publishes every required family", () => {
    const families: AgentFamily[] = Object.values(AGENT_FAMILY);
    expect(families).toEqual(["sdd", "judgment-day", "review", "fallback", "builtin", "custom"]);
  });
});
