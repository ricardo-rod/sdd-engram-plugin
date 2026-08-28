import { describe, expect, it, vi } from "vitest";
import { filterCatalogRows, MAX_VISIBLE_ROWS, pageCount, pageRows } from "../src/tui/agent-suite-vm.ts";
import { CATALOG_EMPTY_MESSAGE, catalogRowLabel, dispatchCatalogWheel, captureCatalogRow, catalogFocusBounds, catalogMouseActivation } from "../src/tui/screens/catalog.tsx";
import { agentInfoActions, infoActionKeys } from "../src/tui/screens/agent-info.tsx";
import { eventForKey, normalizeCatalogState } from "../src/tui/agent-suite-app.tsx";
import { sessionGrantLabel } from "../src/tui/screens/session-grants.tsx";
import { formatAgentInfo } from "../src/tui/screens/agent-info.tsx";
import { reduceNav } from "../src/tui/agent-suite-nav.ts";
import { buildSuiteDeAgentesCatalog } from "../src/core/suites.ts";
import type { KeyEvent } from "@opencode-ai/plugin/tui";

const rows = Array.from({ length: 14 }, (_, index) => ({ id: `agent-${index}`, membership: "seed" as const, enabled: true, skills: [], consent: "explicit-current-turn" as const }));

describe("Agent Suite catalog", () => {
  it("pages six visible rows and clamps page and focus bounds", () => {
    expect(MAX_VISIBLE_ROWS).toBe(6);
    expect(pageRows(rows, 0)).toHaveLength(6);
    expect(pageRows(rows, 2).map((row) => row.id)).toEqual(["agent-12", "agent-13"]);
    expect(pageCount(rows.length)).toBe(3);
    expect(catalogFocusBounds(rows, 2)).toEqual({ maxFocus: 1, maxPage: 2 });
    expect(dispatchCatalogWheel(0, "down", 2)).toBe(1);
    expect(dispatchCatalogWheel(2, "down", 2)).toBe(2);
    expect(dispatchCatalogWheel(0, "up", 2)).toBe(0);
  });

  it("formats catalog rows as names only while keeping blank and long names selectable", () => {
    const detailed = {
      ...rows[0],
      id: "Nombre de agente extraordinariamente largo para la lista",
      enabled: false,
      membership: "custom" as const,
      model: "openai/gpt-5",
      variant: "high",
    };

    expect(catalogRowLabel({ ...detailed, id: "   " })).toBe("(sin nombre)");
    expect(catalogRowLabel(detailed, 18)).toBe("Nombre de agente …");
    expect(catalogRowLabel(detailed)).not.toContain("Creado");
    expect(catalogRowLabel(detailed)).not.toContain("openai/gpt-5");
    expect(catalogRowLabel(detailed)).not.toContain("high");
    expect(CATALOG_EMPTY_MESSAGE).toBe("No hay agentes disponibles.");
    expect(catalogRowLabel({ ...detailed, disabled: true })).toContain("DESACTIVADO");
  });

  it("filters the unified catalog by agent name case-insensitively", () => {
    const mixed = [
      { ...rows[0], id: "General" },
      { ...rows[1], id: "Research", disabled: true, enabled: false },
      { ...rows[2], id: "Writer" },
    ];

    expect(filterCatalogRows(mixed, "res").map((row) => row.id)).toEqual(["Research"]);
    expect(filterCatalogRows(mixed, "").map((row) => row.id)).toEqual(["General", "Research", "Writer"]);
  });

  it("captures row identity at render time and activates only left clicks", () => {
    expect(captureCatalogRow(rows[3], 0)).toEqual({ agentId: "agent-3", index: 0 });
    expect(captureCatalogRow(rows[5], 4)).toEqual({ agentId: "agent-5", index: 4 });
    const activate = vi.fn();
    const left = { button: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as import("@opentui/core").MouseEvent;
    const right = { button: 2, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as import("@opentui/core").MouseEvent;
    expect(catalogMouseActivation(left, rows[3], 0, activate)).toBe(true);
    expect(catalogMouseActivation(right, rows[5], 4, activate)).toBe(false);
    expect(activate).toHaveBeenCalledWith({ agentId: "agent-3", index: 0 });
    expect(right.preventDefault).not.toHaveBeenCalled();
  });

  it("maps catalog paging, focus, and Enter to the captured row identity", () => {
    const catalog = { stack: [{ kind: "catalog", page: 1, focus: 2, query: "", searchFocused: false }], busy: false, closing: false } as import("../src/tui/agent-suite-nav.ts").NavState;
    expect(eventForKey({ name: "pageup" } as KeyEvent, catalog, rows.length)).toEqual({ type: "PAGE", delta: -1, maxPage: 2 });
    expect(eventForKey({ name: "pagedown" } as KeyEvent, catalog, rows.length)).toEqual({ type: "PAGE", delta: 1, maxPage: 2 });
    expect(eventForKey({ name: "down" } as KeyEvent, catalog, rows.length)).toEqual({ type: "MOVE_CATALOG_CURSOR", delta: 1, filteredCount: rows.length, pageSize: 6 });
    expect(eventForKey({ name: "return" } as KeyEvent, catalog, rows.length, "agent-8")).toEqual({ type: "ACTIVATE_AGENT", agentId: "agent-8" });
  });

  it("commits a typed draft before arrows so filtering, focus, page count, and Enter share one query", () => {
    const catalogRows = [
      { ...rows[0], id: "general" },
      { ...rows[1], id: "research-one" },
      { ...rows[2], id: "research-two" },
    ];
    const searching = reduceNav({ stack: [{ kind: "catalog", page: 0, focus: 0, query: "", searchFocused: true }], busy: false, closing: false }, { type: "FOCUS_CATALOG_RESULTS", query: "research" });
    const moved = reduceNav(searching, { type: "MOVE_CATALOG_CURSOR", delta: 1, filteredCount: 2, pageSize: 6 });
    const screen = moved.stack.at(-1);
    const filtered = filterCatalogRows(catalogRows, "research");
    const highlighted = pageRows(filtered, screen?.kind === "catalog" ? screen.page : 0)[screen?.kind === "catalog" ? screen.focus : 0];

    expect(screen).toMatchObject({ kind: "catalog", query: "research", searchFocused: false, page: 0, focus: 1 });
    expect(filtered.map((row) => row.id)).toEqual(["research-one", "research-two"]);
    expect(pageCount(filtered.length)).toBe(1);
    expect(highlighted?.id).toBe("research-two");
    expect(eventForKey({ name: "return" } as KeyEvent, moved, filtered.length, highlighted?.id)).toEqual({ type: "ACTIVATE_AGENT", agentId: "research-two" });
  });

  it("offers only model assignment and back from all agent details", () => {
    const info = { stack: [{ kind: "catalog", page: 0, focus: 0, query: "", searchFocused: false }, { kind: "info", agentId: "general", focus: 0 }], busy: false, closing: false } as import("../src/tui/agent-suite-nav.ts").NavState;

    expect(eventForKey({ name: "return" } as KeyEvent, info)).toEqual({ type: "OPEN_MODEL_ASSIGNMENT" });
    expect(eventForKey({ name: "f5" } as KeyEvent, info)).toBeUndefined();
    expect(eventForKey({ name: "f8" } as KeyEvent, info)).toBeUndefined();
  });

  it("maps built-in detail actions to restore and protected disable without adding authoring flows", () => {
    const restore = { stack: [{ kind: "catalog", page: 0, focus: 0, query: "", searchFocused: false }, { kind: "info", agentId: "explore", focus: 1 }], busy: false, closing: false } as import("../src/tui/agent-suite-nav.ts").NavState;
    const disable = { ...restore, stack: [...restore.stack.slice(0, -1), { kind: "info", agentId: "compaction", focus: 2 }] } as import("../src/tui/agent-suite-nav.ts").NavState;

    expect(eventForKey({ name: "return" } as KeyEvent, restore, 0, undefined, { focusedAgent: { id: "explore", membership: "seed" } })).toEqual({ type: "RESTORE_BUILT_IN", agentId: "explore" });
    expect(eventForKey({ name: "return" } as KeyEvent, disable, 0, undefined, { focusedAgent: { id: "compaction", membership: "seed" } })).toEqual({ type: "DEACTIVATE_AGENT", agentId: "compaction" });
  });

  it("presents built-ins with curated display names and type-specific actions", () => {
    const builtIn = { ...rows[0], id: "plan", membership: "seed" as const };
    const internal = { ...rows[0], id: "compaction", membership: "seed" as const };
    const custom = { ...rows[0], id: "writer", membership: "custom" as const };

    expect(catalogRowLabel(builtIn)).toBe("Plan");
    expect(infoActionKeys(builtIn)).toEqual(["Cambiar modelo y esfuerzo", "Restaurar valores base", "Desactivar", "Volver"]);
    expect(infoActionKeys(internal)).toEqual(["Cambiar modelo y esfuerzo", "Restaurar valores base", "Desactivar (requiere anulación avanzada)", "Volver"]);
    expect(infoActionKeys(custom)).toEqual(["Cambiar modelo y esfuerzo", "Volver"]);
    expect(agentInfoActions(builtIn)[1]).toBe("Restaurar valores base");
  });

  it("coalesces canonical and legacy GitHub runtime metadata into one canonical catalog row", () => {
    const catalog = buildSuiteDeAgentesCatalog(
      {
        "agent-especialit-github": { model: "openai/legacy", description: "Legacy description" },
        "agent-github": { model: "openai/canonical" },
      },
      {},
      ["agent-especialit-github", "agent-github"],
      { "agent-especialit-github": "openai/legacy-assignment", "agent-github": "openai/canonical-assignment" },
      {},
      { "agent-especialit-github": { operations: "Legacy operation" }, "agent-github": { description: "Canonical description" } },
    );

    expect(catalog.filter((row) => row.id === "agent-github")).toEqual([expect.objectContaining({
      id: "agent-github",
      model: "openai/canonical-assignment",
      description: "Canonical description",
      operations: "Legacy operation",
    })]);
    const github = catalog.find((row) => row.id === "agent-github")!;
    expect(catalogRowLabel(github)).toBe("agent-github");
    expect(formatAgentInfo(github).join("\n")).toContain("agent-github");
    expect(JSON.stringify(catalog)).not.toContain("agent-especialit-github");
  });

  it("leaves submit to the focused input and lets Escape/arrows reclaim catalog ownership", () => {
    const searching = { stack: [{ kind: "catalog", page: 0, focus: 0, query: "son", searchFocused: true }], busy: false, closing: false } as import("../src/tui/agent-suite-nav.ts").NavState;
    expect(eventForKey({ name: "return" } as KeyEvent, searching, rows.length, "agent-0")).toBeUndefined();
    expect(eventForKey({ name: "kpenter" } as KeyEvent, searching, rows.length, "agent-0")).toBeUndefined();
    expect(eventForKey({ name: "f10" } as KeyEvent, searching, rows.length, "agent-0")).toBeUndefined();
    expect(eventForKey({ name: "escape" } as KeyEvent, searching, rows.length)).toBeUndefined();
    expect(eventForKey({ name: "down" } as KeyEvent, searching, rows.length)).toBeUndefined();
  });

  it("supports the explicit slash search entry and numeric Enter alias outside text entry", () => {
    const catalog = { stack: [{ kind: "catalog", page: 0, focus: 0, query: "", searchFocused: false }], busy: false, closing: false } as import("../src/tui/agent-suite-nav.ts").NavState;
    expect(eventForKey({ name: "/", sequence: "/" } as KeyEvent, catalog, rows.length)).toEqual({ type: "FOCUS_CATALOG_SEARCH" });
    expect(eventForKey({ name: "kpenter" } as KeyEvent, catalog, rows.length, "agent-0")).toEqual({ type: "ACTIVATE_AGENT", agentId: "agent-0" });
  });

  it("opens a session-grants panel from the catalog and formats grants for immediate revocation", () => {
    const catalog = { stack: [{ kind: "catalog", page: 0, focus: 0, query: "", searchFocused: false }], busy: false, closing: false } as import("../src/tui/agent-suite-nav.ts").NavState;

    expect(eventForKey({ name: "g", sequence: "g" } as KeyEvent, catalog, rows.length)).toEqual({ type: "OPEN_SESSION_GRANTS" });
    expect(sessionGrantLabel({ id: "grant-1", sessionID: "session-1", requester: "build", target: "explore", purpose: "codebase search", operation: "task", duration: "current-session" })).toBe("Build → Explore · codebase search · sesión actual");
  });

  it("clamps a stale page and focus after the catalog shrinks", () => {
    const stale = { stack: [{ kind: "catalog", page: 2, focus: 5, query: "", searchFocused: false }], busy: false, closing: false } as import("../src/tui/agent-suite-nav.ts").NavState;
    const normalized = normalizeCatalogState(stale, rows.slice(0, 2));

    expect(normalized.stack.at(-1)).toMatchObject({ kind: "catalog", page: 0, focus: 1 });
  });
});
