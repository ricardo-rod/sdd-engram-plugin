import { describe, expect, it } from "vitest";
import { initialNavState, reduceNav } from "../src/tui/agent-suite-nav.ts";
import { eventForKey } from "../src/tui/agent-suite-app.tsx";
import { dispatchCatalogWheel } from "../src/tui/screens/catalog.tsx";

const cursor = (delta: -1 | 1, filteredCount: number, pageSize = 6) => ({
  type: "MOVE_CATALOG_CURSOR" as const,
  delta,
  filteredCount,
  pageSize,
});

function catalogState(page: number, focus: number) {
  return { ...initialNavState(), stack: [{ kind: "catalog" as const, page, focus, query: "", searchFocused: false }] };
}

describe("catalog cursor navigation", () => {
  it("moves down across pages and reverses from the first row", () => {
    const next = reduceNav(catalogState(0, 5), cursor(1, 14));
    expect(next.stack.at(-1)).toMatchObject({ kind: "catalog", page: 1, focus: 0 });

    const previous = reduceNav(next, cursor(-1, 14));
    expect(previous.stack.at(-1)).toMatchObject({ kind: "catalog", page: 0, focus: 5 });
  });

  it("clamps the global cursor for partial pages and catalog boundaries", () => {
    expect(reduceNav(catalogState(1, 0), cursor(1, 7)).stack.at(-1)).toMatchObject({ page: 1, focus: 0 });
    expect(reduceNav(catalogState(0, 0), cursor(-1, 14)).stack.at(-1)).toMatchObject({ page: 0, focus: 0 });
    expect(reduceNav(catalogState(2, 1), cursor(1, 14)).stack.at(-1)).toMatchObject({ page: 2, focus: 1 });
  });

  it("leaves an empty catalog cursor unchanged", () => {
    expect(reduceNav(catalogState(0, 0), cursor(1, 0)).stack.at(-1)).toMatchObject({ page: 0, focus: 0 });
  });

  it("uses the same cursor event for arrows while PageUp and PageDown remain page navigation", () => {
    const state = catalogState(0, 5);
    expect(eventForKey({ name: "down" } as never, state, 14)).toEqual(cursor(1, 14));
    expect(eventForKey({ name: "pageup" } as never, state, 14)).toEqual({ type: "PAGE", delta: -1, maxPage: 2 });
    expect(eventForKey({ name: "pagedown" } as never, state, 14)).toEqual({ type: "PAGE", delta: 1, maxPage: 2 });
    expect(dispatchCatalogWheel(0, "down", 2)).toBe(1);
    expect(dispatchCatalogWheel(2, "down", 2)).toBe(2);
  });
});
