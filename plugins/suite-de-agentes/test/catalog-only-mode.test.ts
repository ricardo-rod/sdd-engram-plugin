import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { applyModelAssignment } from "../src/tui/agent-suite-app.tsx";
import {
  CATALOG_ONLY_SCREEN_KINDS,
  initialNavState,
  reduceNav,
  type NavState,
} from "../src/tui/agent-suite-nav.ts";
import { agentInfoActions } from "../src/tui/screens/agent-info.tsx";
import {
  providerModelOptions,
  providerSelectionOptions,
  type RuntimeModelProvider,
} from "../src/tui/screens/model-select.tsx";
import { buildSuiteDeAgentesCatalog } from "../src/core/suites.ts";

const providers: readonly RuntimeModelProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    models: {
      sonnet: { id: "sonnet", name: "Claude Sonnet", variants: { low: {}, high: {} } },
      haiku: { id: "haiku", name: "Claude Haiku", variants: { low: {} } },
    },
  },
  {
    id: "openai",
    name: "OpenAI",
    models: {
      "gpt-5": { id: "gpt-5", name: "GPT-5", variants: { medium: {}, high: {} } },
    },
  },
];

describe("catalog-only agent suite mode", () => {
  it("opens directly on the catalog and exposes only read/model-assignment screens", () => {
    expect(initialNavState().stack).toEqual([{ kind: "catalog", page: 0, focus: 0, query: "", searchFocused: false }]);
    expect(CATALOG_ONLY_SCREEN_KINDS).toEqual(["catalog", "info", "provider", "model", "effort"]);
    expect(initialNavState().stack[0]?.kind).not.toBe("landing");
  });

  it("populates the catalog with all required built-in agents and configured agents with metadata", () => {
    const catalog = buildSuiteDeAgentesCatalog(
      {},
      {
        "custom-researcher": {
          id: "custom-researcher",
          description: "Research specialist for codebase analysis",
          skills: ["research"],
          prompt: "Analyze codebase safely.",
          model: "anthropic/claude-3-5-sonnet",
          permissions: {},
        },
      }
    );

    const ids = catalog.map((r) => r.id);
    for (const required of ["build", "plan", "general", "explore", "compaction", "title", "summary", "custom-researcher"]) {
      expect(ids, `Catalog must contain agent '${required}'`).toContain(required);
      const row = catalog.find((r) => r.id === required)!;
      expect(row.description, `Agent '${required}' must have a description`).toBeDefined();
      expect(row.description!.length).toBeGreaterThan(0);
    }
  });

  it("keeps agent details read-only with one assignment action", () => {
    expect(agentInfoActions()).toEqual(["Cambiar modelo y esfuerzo", "Volver"]);
  });

  it("routes catalog details through provider, model, and effort", () => {
    const catalog = initialNavState();
    const info = reduceNav(catalog, { type: "ACTIVATE_AGENT", agentId: "general" });
    const provider = reduceNav(info, { type: "OPEN_MODEL_ASSIGNMENT" });
    const model = reduceNav(provider, { type: "SELECT_PROVIDER", provider: "anthropic" });
    const effort = reduceNav(model, { type: "SELECT_MODEL", model: "anthropic/sonnet" });

    expect(info.stack.at(-1)).toEqual({ kind: "info", agentId: "general", focus: 0 });
    expect(provider.stack.at(-1)).toEqual({ kind: "provider", agentId: "general", focus: 0 });
    expect(model.stack.at(-1)).toEqual({ kind: "model", agentId: "general", provider: "anthropic", focus: 0 });
    expect(effort.stack.at(-1)).toEqual({ kind: "effort", agentId: "general", model: "anthropic/sonnet", focus: 0 });
  });

  it("groups models under the selected provider", () => {
    expect(providerSelectionOptions(providers)).toEqual([
      { title: "Anthropic", value: "anthropic" },
      { title: "OpenAI", value: "openai" },
    ]);
    expect(providerModelOptions(providers, "anthropic")).toEqual([
      { title: "Claude Sonnet", value: "anthropic/sonnet" },
      { title: "Claude Haiku", value: "anthropic/haiku" },
    ]);
    expect(providerModelOptions(providers, "openai")).toEqual([
      { title: "GPT-5", value: "openai/gpt-5" },
    ]);
  });

  it("persists model and effort as one controller mutation", async () => {
    const setModelAndEffort = vi.fn(async () => undefined);
    const refresh = vi.fn();
    const dispatch = vi.fn();
    const controller = { setModelAndEffort, refresh } as never;

    await applyModelAssignment(controller, "general", "anthropic/sonnet", "high", dispatch);

    expect(setModelAndEffort).toHaveBeenCalledTimes(1);
    expect(setModelAndEffort).toHaveBeenCalledWith("general", "anthropic/sonnet", "high");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "ASSIGNMENT_SAVED" });
  });

  it("returns from saved effort to the same read-only details", () => {
    const state: NavState = {
      stack: [
        { kind: "catalog", page: 0, focus: 0, query: "", searchFocused: false },
        { kind: "info", agentId: "general", focus: 0 },
        { kind: "provider", agentId: "general", focus: 0 },
        { kind: "model", agentId: "general", provider: "anthropic", focus: 0 },
        { kind: "effort", agentId: "general", model: "anthropic/sonnet", focus: 0 },
      ],
      busy: false,
      closing: false,
    };

    expect(reduceNav(state, { type: "ASSIGNMENT_SAVED" }).stack.at(-1)).toEqual({ kind: "info", agentId: "general", focus: 0 });
  });

  it("keeps create, lifecycle, editing, deletion, and AI flows out of the catalog TUI", () => {
    const appSource = readFileSync(new URL("../src/tui/agent-suite-app.tsx", import.meta.url), "utf8");
    const navSource = readFileSync(new URL("../src/tui/agent-suite-nav.ts", import.meta.url), "utf8");
    const controllerSource = readFileSync(new URL("../src/tui/agent-suite-controller.ts", import.meta.url), "utf8");
    const coreIndexSource = readFileSync(new URL("../src/core/index.ts", import.meta.url), "utf8");

    for (const forbidden of ["createAgent", "deleteAgent", "patchAgent", "deactivateAgent", "reactivateAgent", "materialize", "coordinator", "interview", "skill-picker", "setModel(", "setEffort("]) {
      expect(appSource).not.toContain(forbidden);
    }
    for (const forbidden of ["landing", "modify", "delete", "coordinator", "ai-interview", "skill-picker", "CREATE_START", "OPEN_MODIFY", "REQUEST_DELETE"]) {
      expect(navSource).not.toContain(forbidden);
    }
    for (const forbidden of ["coordinator", "setCoordinator", "ingestPendingSkills", "PendingSkill"]) {
      expect(controllerSource).not.toContain(forbidden);
    }
    for (const forbidden of ["coordinator.ts", "Interview", "PendingSkill"]) {
      expect(coreIndexSource).not.toContain(forbidden);
    }
  });
});
