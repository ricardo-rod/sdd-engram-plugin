import { describe, it, expect } from "vitest";
import {
  BASE_CANONICAL_ORDER,
  CATALOG_GROUPS,
  FALLBACK_SYNC_BASE_ORDER,
  FALLBACK_MANAGED_COUNT,
  PERSISTIBLE_AGENT_KEYS,
  RUNTIME_SYNC_AGENT_KEYS,
  VISIBLE_CATALOG_ROWS,
  isFallbackCatalogAgent,
  isRuntimeSyncCatalogAgent,
  isValidAgentKey,
  deriveFallbackProfileKey,
  classifyFamily,
  buildCatalogSections,
  collectConfigurableProfileTargets,
  collectRuntimeAgentInventory,
} from "./catalog";
import { isCatalogVisibleAgent, isEditablePrimaryAgent } from "./utils";

const EXPECTED_FALLBACK_ORDER: readonly string[] = [
  "jd-fix-agent-fallback",
  "jd-judge-a-fallback",
  "jd-judge-b-fallback",
  "review-readability-fallback",
  "review-refuter-fallback",
  "review-reliability-fallback",
  "review-resilience-fallback",
  "review-risk-fallback",
  "review-validator-fallback",
  "sdd-apply-fallback",
  "sdd-archive-fallback",
  "sdd-design-fallback",
  "sdd-explore-fallback",
  "sdd-init-fallback",
  "sdd-onboard-fallback",
  "sdd-propose-fallback",
  "sdd-spec-fallback",
  "sdd-tasks-fallback",
  "sdd-verify-fallback",
] as const;

const EXPECTED_CATALOG_GROUPS: readonly (readonly string[])[] = [
  ["sdd-ORCHETATOR"],
  [
    "sdd-propose",
    "sdd-design",
    "sdd-apply",
    "sdd-verify",
    "sdd-spec",
    "sdd-onboard",
    "sdd-explore",
    "sdd-init",
    "sdd-tasks",
    "sdd-archive",
  ],
  ["jd-judge-a", "jd-judge-b", "jd-fix-agent"],
  [
    "review-readability",
    "review-reliability",
    "review-resilience",
    "review-validator",
    "review-refuter",
    "review-risk",
    "model-audit",
  ],
  ["gentle-ai-windows-validator", "compaction", "summary", "title"],
] as const;

const EXPECTED_RUNTIME_SYNC_KEYS = [
  ...EXPECTED_CATALOG_GROUPS.flat(),
].filter((name) => !["sdd-ORCHETATOR", "compaction", "summary", "title"].includes(name));

describe("catalog SSOT & validation", () => {
  describe("grouped catalog views (Unit 1)", () => {
    it("defines five ordered groups with every approved agent in exact sequence", () => {
      expect(CATALOG_GROUPS).toHaveLength(5);
      expect(CATALOG_GROUPS.map((group) => [...group.agents])).toEqual(EXPECTED_CATALOG_GROUPS);
      expect(PERSISTIBLE_AGENT_KEYS).toHaveLength(25);
      expect(PERSISTIBLE_AGENT_KEYS).toEqual(EXPECTED_CATALOG_GROUPS.flat());
    });

    it("emits only real agent rows without synthetic separator tokens", () => {
      expect(VISIBLE_CATALOG_ROWS).toEqual(PERSISTIBLE_AGENT_KEYS.map((key) => ({ kind: "agent", key })));
      expect(VISIBLE_CATALOG_ROWS).toHaveLength(25);
      expect(VISIBLE_CATALOG_ROWS.every((row) => row.kind === "agent")).toBe(true);
      expect(PERSISTIBLE_AGENT_KEYS).not.toContain("judgment-day");
      expect(PERSISTIBLE_AGENT_KEYS).not.toContain("readability");
      expect(isCatalogVisibleAgent("judgment-day")).toBe(false);
      expect(isCatalogVisibleAgent("review-readability")).toBe(true);
      expect(RUNTIME_SYNC_AGENT_KEYS).toEqual(EXPECTED_RUNTIME_SYNC_KEYS);
      expect(RUNTIME_SYNC_AGENT_KEYS).not.toContain("sdd-ORCHETATOR");
    });

    it("keeps auxiliaries model-and-level editable while excluding internal auxiliaries from fallback eligibility", () => {
      expect(isRuntimeSyncCatalogAgent("gentle-ai-windows-validator")).toBe(true);
      expect(["compaction", "summary", "title"].every((key) => !isRuntimeSyncCatalogAgent(key))).toBe(true);
      expect(["gentle-ai-windows-validator", "compaction", "summary", "title"].every(isEditablePrimaryAgent)).toBe(true);
      expect(["compaction", "summary", "title"].every((key) => !isFallbackCatalogAgent(key))).toBe(true);
      expect(isFallbackCatalogAgent("gentle-ai-windows-validator")).toBe(true);
      expect(isFallbackCatalogAgent("model-audit")).toBe(true);
    });
  });

  describe("BASE_CANONICAL_ORDER & counts (T01, T13, T16)", () => {
    it("has 40 total entries with 21 primaries and 19 fallbacks in exact sequence", () => {
      expect(BASE_CANONICAL_ORDER).toHaveLength(40);
      expect(FALLBACK_MANAGED_COUNT).toBe(19);

      const fallbacks = BASE_CANONICAL_ORDER.filter((name) => deriveFallbackProfileKey(name) !== null);
      expect(fallbacks).toHaveLength(19);
      expect(fallbacks).toEqual(EXPECTED_FALLBACK_ORDER);

      const primaries = BASE_CANONICAL_ORDER.filter((name) => deriveFallbackProfileKey(name) === null);
      expect(primaries).toHaveLength(21);
      expect(primaries[0]).toBe("gentle-orchestrator");
      expect(primaries).toContain("model-audit");
      expect(FALLBACK_SYNC_BASE_ORDER).toHaveLength(19);
      expect(FALLBACK_SYNC_BASE_ORDER).not.toContain("model-audit");
      expect(FALLBACK_SYNC_BASE_ORDER).not.toContain("gentle-orchestrator");
    });
  });

  describe("fallback bulk target projection", () => {
    it("projects the exact canonical 19 fallbacks even when they are absent from runtime config", () => {
      const targets = collectConfigurableProfileTargets({
        agent: {
          "sdd-apply-fallback": {},
          "sdd-future-fallback": {},
          "model-audit-fallback": {},
          compaction: {},
          summary: {},
          title: {},
        },
      }, "fallback");

      expect(targets).toEqual(EXPECTED_FALLBACK_ORDER.map((fallbackName) => ({
        field: "fallback",
        profileKey: fallbackName.slice(0, -"-fallback".length),
      })));
    });
  });

  describe("isValidAgentKey (T03, T24)", () => {
    it("validates valid agent key bounds and formats", () => {
      expect(isValidAgentKey("a")).toBe(true);
      expect(isValidAgentKey("a".repeat(64))).toBe(true);
      expect(isValidAgentKey("sdd-init")).toBe(true);
      expect(isValidAgentKey("my_agent.v1-test")).toBe(true);
    });

    it("rejects invalid keys, empty string, oversized, prototype pollution and invalid chars", () => {
      expect(isValidAgentKey("")).toBe(false);
      expect(isValidAgentKey("a".repeat(65))).toBe(false);
      expect(isValidAgentKey("__proto__")).toBe(false);
      expect(isValidAgentKey("constructor")).toBe(false);
      expect(isValidAgentKey("prototype")).toBe(false);
      expect(isValidAgentKey("a/b")).toBe(false);
      expect(isValidAgentKey("a b")).toBe(false);
      expect(isValidAgentKey(null)).toBe(false);
      expect(isValidAgentKey(undefined)).toBe(false);
      expect(isValidAgentKey(123)).toBe(false);
    });
  });

  describe("deriveFallbackProfileKey (T15, T16, T23, T32, T35, T36)", () => {
    it("derives primary key from valid base and future fallback agents", () => {
      expect(deriveFallbackProfileKey("sdd-apply-fallback")).toBe("sdd-apply");
      expect(deriveFallbackProfileKey("jd-judge-a-fallback")).toBe("jd-judge-a");
      expect(deriveFallbackProfileKey("review-risk-fallback")).toBe("review-risk");
      expect(deriveFallbackProfileKey("sdd-future-fallback")).toBe("sdd-future");
    });

    it("returns null for primaries, double fallbacks, model-audit, and ineligible keys", () => {
      expect(deriveFallbackProfileKey("sdd-init")).toBe(null);
      expect(deriveFallbackProfileKey("gentle-orchestrator")).toBe(null);
      expect(deriveFallbackProfileKey("sdd-apply-fallback-fallback")).toBe(null);
      expect(deriveFallbackProfileKey("model-audit-fallback")).toBe(null);
      expect(deriveFallbackProfileKey("weird-fallback")).toBe(null);
      expect(deriveFallbackProfileKey("")).toBe(null);
    });
  });

  describe("classifyFamily (T12)", () => {
    it("classifies agents into their respective visual families", () => {
      expect(classifyFamily({ displayName: "gentle-orchestrator", isFallback: false, base: true })).toBe("Orchestrator");
      expect(classifyFamily({ displayName: "sdd-init", isFallback: false, base: true })).toBe("SDD");
      expect(classifyFamily({ displayName: "jd-fix-agent", isFallback: false, base: true })).toBe("JD");
      expect(classifyFamily({ displayName: "review-risk", isFallback: false, base: true })).toBe("Review");
      expect(classifyFamily({ displayName: "model-audit", isFallback: false, base: true })).toBe("Tools");
      expect(classifyFamily({ displayName: "sdd-apply-fallback", isFallback: true, base: true })).toBe("Fallbacks");
      expect(classifyFamily({ displayName: "tester-fallback", isFallback: false, base: false })).toBe("Fallbacks");
      expect(classifyFamily({ displayName: "my-custom-agent", isFallback: false, base: false })).toBe("Custom");
    });
  });

  describe("buildCatalogSections (T01, T02, T03, T12, T13, T32, T33, T35, T36)", () => {
    it("does not seed inactive base entries when config and profile are empty", () => {
      const sections = buildCatalogSections({}, { models: {} });
      let total = 0;
      for (const entries of sections.values()) {
        total += entries.length;
      }
      expect(total).toBe(0);
      expect([...sections.values()].every((entries) => entries.length === 0)).toBe(true);
    });

    it("includes only runtime keys and applies known presentation order among present entries", () => {
      const sections = buildCatalogSections({
        agent: {
          "custom-eval": {},
          "sdd-init": {},
          "gentle-orchestrator": {},
          "review-risk": {},
        },
      }, { models: {} });

      expect(sections.get("Orchestrator")!.map((entry) => entry.displayName)).toEqual(["gentle-orchestrator"]);
      expect(sections.get("SDD")!.map((entry) => entry.displayName)).toEqual(["sdd-init"]);
      expect(sections.get("Review")!.map((entry) => entry.displayName)).toEqual(["review-risk"]);
      expect(sections.get("Custom")!.map((entry) => entry.displayName)).toEqual(["custom-eval"]);
      expect([...sections.values()].flat()).toHaveLength(4);
    });

    it("excludes reserved runtime roles and keeps runtime-only tools conditional", () => {
      const reserved = [
        "build", "plan", "general", "explore", "compaction", "summary", "title",
        "gentle-reviewer", "gentle-worker", "sdd-orchestrator",
      ];
      const sections = buildCatalogSections({
        agent: Object.fromEntries([...reserved, "model-audit", "gentle-ai-windows-validator"].map((name) => [name, {}])),
      }, { models: {} });

      expect([...sections.values()].flat().map((entry) => entry.displayName)).toEqual([
        "model-audit", "gentle-ai-windows-validator",
      ]);
      expect(sections.get("Tools")!.map((entry) => entry.displayName)).toEqual([
        "model-audit", "gentle-ai-windows-validator",
      ]);
    });

    it("keeps fallback suffixes isolated even when the primary name is unknown", () => {
      const sections = buildCatalogSections({
        agent: {
          "tester-fallback": {},
          "security-scanner": {},
        },
      }, { models: {} });

      expect(sections.get("Fallbacks")!.map((entry) => entry.displayName)).toEqual(["tester-fallback"]);
      expect(sections.get("Fallbacks")![0].isFallback).toBe(true);
      expect(sections.get("Custom")!.map((entry) => entry.displayName)).toEqual(["security-scanner"]);
      expect(sections.get("Custom")!.some((entry) => entry.displayName === "tester-fallback")).toBe(false);
    });

    it("does not expose profile-only keys while preserving them for persistence", () => {
      const sections = buildCatalogSections({ agent: { "sdd-init": {} } }, {
        models: { "sdd-init": "m1", "inactive-agent": "m2" },
      });

      expect([...sections.values()].flat().map((entry) => entry.displayName)).toEqual(["sdd-init"]);
      expect((sections.get("SDD") || []).map((entry) => entry.profileKey)).toEqual(["sdd-init"]);
    });

    it("does not synthesize a fallback from a profile-only fallback override", () => {
      const sections = buildCatalogSections({ agent: {} }, {
        models: {},
        fallback: { "sdd-apply": "fallback-model" },
      });

      expect([...sections.values()].flat()).toEqual([]);
    });

    it("classifies runtime custom and tool entries safely", () => {
      const inventory = collectRuntimeAgentInventory({
        agent: {
          "model-audit": {},
          "gentle-ai-windows-validator": {},
          "security-scanner": {},
          "tester-fallback": {},
        },
      });

       expect(inventory.map((entry: any) => [entry.runtimeName, entry.classification, entry.order.family])).toEqual([
         ["model-audit", "primary", "Tools"],
         ["gentle-ai-windows-validator", "primary", "Tools"],
         ["tester-fallback", "fallback", "Fallbacks"],
         ["security-scanner", "primary", "Custom"],
       ]);
    });

    it("keeps runtime-only custom entries alphabetically after known entries", () => {
      const config = {
        agent: {
          "sdd-init": { model: "base-init" },
          "sdd-future-z": { model: "future-z" },
          "sdd-future-a": { model: "future-a" },
          "my-agent": { model: "custom-1" },
          __proto__: { model: "polluted" },
        },
      };
       const sections = buildCatalogSections(config, { models: { "sdd-init": "profile-init" } });

      const sddEntries = sections.get("SDD")!;
       expect(sddEntries).toHaveLength(1);
       expect(sddEntries[0].displayName).toBe("sdd-init");

       const customEntries = sections.get("Custom")!;
       expect(customEntries).toHaveLength(3);
       expect(customEntries.map((entry) => entry.displayName)).toEqual(["my-agent", "sdd-future-a", "sdd-future-z"]);
    });

    it("handles explicit future pair in runtime with correct field and profileKey (T32)", () => {
      const config = {
        agent: {
          "sdd-future": { model: "m1" },
          "sdd-future-fallback": { model: "m2" },
        },
      };
      const sections = buildCatalogSections(config, { models: {} });

      const sddEntries = sections.get("SDD")!;
      const futureEntry = sddEntries.find((e) => e.displayName === "sdd-future");
       expect(futureEntry).toBeUndefined();

       const fallbackEntries = sections.get("Fallbacks")!;
       const futureFallbackEntry = fallbackEntries.find((e) => e.displayName === "sdd-future-fallback");
      expect(futureFallbackEntry).toBeDefined();
      expect(futureFallbackEntry?.field).toBe("fallback");
      expect(futureFallbackEntry?.profileKey).toBe("sdd-future");
       expect(futureFallbackEntry?.base).toBe(false);
       expect(futureFallbackEntry?.isFallback).toBe(true);

       expect(sections.get("Custom")!.map((entry) => entry.displayName)).toEqual(["sdd-future"]);
    });

    it("does not synthesize fallback when only primary is present (T33)", () => {
      const config = {
        agent: {
          "sdd-future": { model: "m1" },
        },
      };
      const sections = buildCatalogSections(config, { models: {} });

      const fallbackEntries = sections.get("Fallbacks")!;
       expect(fallbackEntries).toHaveLength(0);
      expect(fallbackEntries.some((e) => e.displayName === "sdd-future-fallback")).toBe(false);
    });

    it("classifies every valid fallback suffix as Fallbacks, including unknown names", () => {
      const config = {
        agent: {
          "weird-fallback": { model: "m1" },
          "model-audit-fallback": { model: "m2" },
        },
      };
      const sections = buildCatalogSections(config, { models: {} });

      const fallbackEntries = sections.get("Fallbacks")!;
       expect(fallbackEntries.map((e) => e.displayName)).toEqual(["model-audit-fallback", "weird-fallback"]);

       const customEntries = sections.get("Custom")!;
       expect(customEntries).toHaveLength(0);
     });
  });
});
