import type { JSX } from "@opentui/solid";
import { createSignal } from "solid-js";
import type { KeyEvent } from "@opencode-ai/plugin/tui";
import type { TuiTheme } from "@opencode-ai/plugin/tui";
import type { MouseEvent } from "@opentui/core";
import type { AgentCatalogRow } from "../../core/types.ts";
import { filterCatalogRows, MAX_VISIBLE_ROWS, pageCount, pageRows } from "../agent-suite-vm.ts";
import { Divider, searchInputPresentation, SelectableRow } from "../visual-primitives.tsx";
import { createVisualTokens, formatCatalogName } from "../visual-tokens.ts";
import { getBuiltInDefinition } from "../../core/built-in-agents.ts";

export interface CatalogProps {
  theme: TuiTheme;
  rows: readonly AgentCatalogRow[];
  page: number;
  focus: number;
  query?: string;
  searchFocused?: boolean;
  onActivate: (identity: { agentId: string; index: number }) => void;
  onPage: (delta: -1 | 1) => void;
  onDraftChange?: (value: string) => void;
  onFocusResults?: (query: string) => void;
  onMoveFocus?: (delta: -1 | 1, filteredCount: number) => void;
  onFocusSearch?: () => void;
  emptyMessage?: string;
}

export const CATALOG_EMPTY_MESSAGE = "No hay agentes disponibles.";

export function catalogFocusBounds(rows: readonly AgentCatalogRow[], page: number): { maxFocus: number; maxPage: number } {
  const maxPage = pageCount(rows.length) - 1;
  return { maxPage, maxFocus: Math.max(0, pageRows(rows, Math.max(0, Math.min(page, maxPage))).length - 1) };
}

export function catalogSearchEmptyMessage(query: string): string {
  return query.trim() ? "No hay agentes que coincidan con la búsqueda." : CATALOG_EMPTY_MESSAGE;
}

export function dispatchCatalogWheel(page: number, direction: "up" | "down", maxPage: number): number {
  const delta = direction === "down" ? 1 : -1;
  return Math.max(0, Math.min(Math.max(0, maxPage), page + delta));
}

export function captureCatalogRow(row: Pick<AgentCatalogRow, "id">, index: number): { agentId: string; index: number } {
  return { agentId: row.id, index };
}

export function catalogMouseActivation(event: MouseEvent, row: Pick<AgentCatalogRow, "id">, index: number, activate: (identity: { agentId: string; index: number }) => void): boolean {
  if (event.button !== 0) return false;
  event.preventDefault();
  event.stopPropagation();
  activate(captureCatalogRow(row, index));
  return true;
}

export function isCatalogSearchEscape(key: Pick<KeyEvent, "name">): boolean {
  return key.name === "escape";
}

function catalogFocusDelta(key: Pick<KeyEvent, "name">): -1 | 1 | undefined {
  if (key.name === "up" || key.name === "left") return -1;
  if (key.name === "down" || key.name === "right") return 1;
  return undefined;
}

export function catalogRowLabel(row: Pick<AgentCatalogRow, "id"> & { disabled?: boolean }, maxLength?: number): string {
  const name = formatCatalogName(getBuiltInDefinition(row.id)?.displayName ?? row.id, maxLength);
  return row.disabled ? `${name} · DESACTIVADO` : name;
}

export function Catalog(props: CatalogProps): JSX.Element {
  const colors = () => props.theme.current;
  const search = () => searchInputPresentation(props.theme, props.searchFocused === true);
  const [draftQuery, setDraftQuery] = createSignal(props.query ?? "");
  const filteredRows = () => filterCatalogRows(props.rows, draftQuery());
  const visibleRows = () => pageRows(filteredRows(), props.page);
  const maxPage = () => pageCount(filteredRows().length) - 1;
  const activate = (identity: { agentId: string; index: number }) => props.onActivate(identity);
  const handleWheel = (event: MouseEvent) => {
    if (event.type !== "scroll" || !event.scroll) return;
    event.preventDefault();
    event.stopPropagation();
    const nextPage = dispatchCatalogWheel(props.page, event.scroll.direction === "left" || event.scroll.direction === "up" ? "up" : "down", maxPage());
    if (nextPage !== props.page) props.onPage(nextPage > props.page ? 1 : -1);
  };
  return (
    <box flexDirection="column" gap={1} onMouseScroll={handleWheel}>
      <box flexDirection="column" gap={1}>
        <text fg={createVisualTokens(colors()).form.label}>Buscar agente</text>
        <box backgroundColor={search().background} borderStyle="single" borderColor={search().border}><input focused={props.searchFocused === true} value={draftQuery()} placeholder="Escribe un nombre…" onMouseDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); props.onFocusSearch?.(); }} onMouseUp={(event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); }} onKeyDown={(key) => { if (isCatalogSearchEscape(key)) { key.preventDefault(); key.stopPropagation(); props.onFocusResults?.(draftQuery()); return; } const delta = catalogFocusDelta(key); if (delta === undefined) return; key.preventDefault(); key.stopPropagation(); props.onFocusResults?.(draftQuery()); props.onMoveFocus?.(delta, filterCatalogRows(props.rows, draftQuery()).length); }} onInput={(value) => { setDraftQuery(value); props.onDraftChange?.(value); }} onSubmit={() => { props.onFocusResults?.(draftQuery()); }} /></box>
      </box>
      <text fg={colors().textMuted}>Página {props.page + 1}/{maxPage() + 1} · {MAX_VISIBLE_ROWS} filas por página</text>
      <Divider theme={props.theme} />
       {visibleRows().length === 0 ? <text fg={colors().textMuted}>{props.emptyMessage ?? catalogSearchEmptyMessage(draftQuery())}</text> : visibleRows().map((row, index) => (
        <SelectableRow theme={props.theme} selected={props.focus === index} onActivate={() => activate(captureCatalogRow(row, index))}>
          {catalogRowLabel(row)}
        </SelectableRow>
      ))}
    </box>
  );
}
