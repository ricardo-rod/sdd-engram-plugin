export const CATALOG_ONLY_SCREEN_KINDS = ["catalog", "info", "provider", "model", "effort"] as const;

export type CatalogOnlyScreenKind = typeof CATALOG_ONLY_SCREEN_KINDS[number];

export type AppScreen =
  | { kind: "catalog"; page: number; focus: number; query: string; searchFocused: boolean }
  | { kind: "info"; agentId: string; focus: number }
  | { kind: "provider"; agentId: string; focus: number }
  | { kind: "model"; agentId: string; provider: string; focus: number }
  | { kind: "effort"; agentId: string; model: string; focus: number }
  | { kind: "session-grants"; focus: number };

export type NavState = {
  stack: AppScreen[];
  busy: boolean;
  closing: boolean;
  error?: string;
};

export type NavEvent =
  | { type: "ACTIVATE_AGENT"; agentId: string }
  | { type: "CATALOG_QUERY"; value: string }
  | { type: "FOCUS_CATALOG_RESULTS"; query?: string }
  | { type: "FOCUS_CATALOG_SEARCH" }
  | { type: "MOVE_CATALOG_CURSOR"; delta: -1 | 1; filteredCount: number; pageSize: number }
  | { type: "MOVE_FOCUS"; delta: -1 | 1; maxFocus?: number }
  | { type: "PAGE"; delta: -1 | 1; maxPage?: number }
  | { type: "OPEN_MODEL_ASSIGNMENT" }
  | { type: "OPEN_SESSION_GRANTS" }
  | { type: "REVOKE_GRANT"; grantId: string }
  | { type: "RESTORE_BUILT_IN"; agentId: string }
  | { type: "DEACTIVATE_AGENT"; agentId: string }
  | { type: "SELECT_PROVIDER"; provider: string }
  | { type: "SELECT_MODEL"; model: string }
  | { type: "SELECT_EFFORT"; effort: string }
  | { type: "ASSIGNMENT_SAVED" }
  | { type: "BACK" }
  | { type: "REQUEST_CLOSE" }
  | { type: "SET_BUSY"; busy: boolean }
  | { type: "SET_ERROR"; error?: string };

export function initialNavState(): NavState {
  return { stack: [{ kind: "catalog", page: 0, focus: 0, query: "", searchFocused: false }], busy: false, closing: false };
}

function top(state: NavState): AppScreen {
  return state.stack[state.stack.length - 1] ?? initialNavState().stack[0]!;
}

function replaceTop(state: NavState, screen: AppScreen): NavState {
  return { ...state, stack: [...state.stack.slice(0, -1), screen] };
}

function push(state: NavState, screen: AppScreen): NavState {
  return { ...state, stack: [...state.stack, screen] };
}

function pop(state: NavState): NavState {
  return state.stack.length > 1 ? { ...state, stack: state.stack.slice(0, -1) } : state;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(Math.max(0, max), value));
}

function restoreInfo(state: NavState): NavState {
  const infoIndex = state.stack.findLastIndex((screen) => screen.kind === "info");
  return infoIndex < 0 ? state : { ...state, stack: state.stack.slice(0, infoIndex + 1) };
}

export function reduceNav(state: NavState, event: NavEvent): NavState {
  if (event.type === "REQUEST_CLOSE") return state.closing ? state : { ...state, closing: true };
  if (event.type === "SET_BUSY") return { ...state, busy: event.busy };
  if (event.type === "SET_ERROR") return event.error === undefined ? { ...state, error: undefined } : { ...state, error: event.error };
  if (state.closing) return state;

  const screen = top(state);
  switch (event.type) {
    case "ACTIVATE_AGENT":
      return screen.kind === "catalog" ? push(state, { kind: "info", agentId: event.agentId, focus: 0 }) : state;
    case "CATALOG_QUERY":
      return screen.kind === "catalog" ? replaceTop(state, { ...screen, page: 0, focus: 0, query: event.value, searchFocused: true }) : state;
    case "FOCUS_CATALOG_RESULTS":
      return screen.kind === "catalog" ? replaceTop(state, { ...screen, query: event.query ?? screen.query, searchFocused: false }) : state;
    case "FOCUS_CATALOG_SEARCH":
      return screen.kind === "catalog" ? replaceTop(state, { ...screen, searchFocused: true }) : state;
    case "MOVE_CATALOG_CURSOR": {
      if (screen.kind !== "catalog" || event.filteredCount <= 0) return state;
      const pageSize = Math.max(1, Math.floor(event.pageSize));
      const currentIndex = screen.page * pageSize + screen.focus;
      const nextIndex = clamp(currentIndex + event.delta, event.filteredCount - 1);
      return replaceTop(state, {
        ...screen,
        page: Math.floor(nextIndex / pageSize),
        focus: nextIndex % pageSize,
        searchFocused: false,
      });
    }
    case "MOVE_FOCUS":
      return replaceTop(state, { ...screen, ...(screen.kind === "catalog" ? { searchFocused: false } : {}), focus: clamp(screen.focus + event.delta, event.maxFocus ?? 0) });
    case "PAGE":
      return screen.kind === "catalog"
        ? replaceTop(state, { ...screen, page: clamp(screen.page + event.delta, event.maxPage ?? Number.MAX_SAFE_INTEGER), focus: 0, searchFocused: false })
        : state;
    case "OPEN_MODEL_ASSIGNMENT":
      return screen.kind === "info" ? push(state, { kind: "provider", agentId: screen.agentId, focus: 0 }) : state;
    case "OPEN_SESSION_GRANTS":
      return screen.kind === "catalog" ? push(state, { kind: "session-grants", focus: 0 }) : state;
    case "REVOKE_GRANT":
      return state;
    case "RESTORE_BUILT_IN":
    case "DEACTIVATE_AGENT":
      return state;
    case "SELECT_PROVIDER":
      return screen.kind === "provider" ? replaceTop(state, { kind: "model", agentId: screen.agentId, provider: event.provider, focus: 0 }) : state;
    case "SELECT_MODEL":
      return screen.kind === "model" ? replaceTop(state, { kind: "effort", agentId: screen.agentId, model: event.model, focus: 0 }) : state;
    case "SELECT_EFFORT":
      return state;
    case "ASSIGNMENT_SAVED":
      return screen.kind === "effort" ? restoreInfo(state) : state;
    case "BACK":
      return pop(state);
    default:
      return state;
  }
}
