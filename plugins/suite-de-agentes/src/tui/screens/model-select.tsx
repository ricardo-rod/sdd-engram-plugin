import type { JSX } from "@opentui/solid";
import type { TuiTheme } from "@opencode-ai/plugin/tui";
import type { MouseEvent } from "@opentui/core";
import type { AgentCatalogRow } from "../../core/types.ts";
import { currentValueCue, Divider, FieldRow, SectionPanel, SelectableRow } from "../visual-primitives.tsx";

export interface ModelSelectProps {
  theme: TuiTheme;
  row: AgentCatalogRow;
  models: readonly string[];
  modelOptions?: readonly { title: string; value: string }[];
  currentValue?: string;
  focus: number;
  error?: string;
  onSelect: (model: string) => void;
  onMoveFocus?: (delta: -1 | 1) => void;
}

export interface RuntimeModel {
  id: string;
  name: string;
  variants?: Record<string, unknown>;
}

export interface RuntimeModelProvider {
  id: string;
  name: string;
  models: Record<string, RuntimeModel>;
}

export interface ModelSelectionOption {
  title: string;
  value: string;
}

export function providerSelectionOptions(providers: readonly RuntimeModelProvider[]): ModelSelectionOption[] {
  return providers.map(({ id, name }) => ({ title: name, value: id }));
}

export function providerModelOptions(providers: readonly RuntimeModelProvider[], providerId: string): ModelSelectionOption[] {
  return Object.values(providers.find((provider) => provider.id === providerId)?.models ?? {})
    .map(({ id, name }) => ({ title: name, value: `${providerId}/${id}` }));
}

export const MODEL_EMPTY_MESSAGE = "No hay modelos disponibles.";
export const MODEL_VISIBLE_ROWS = 10;

export function modelSelectionOptions(models: readonly string[]): Array<{ title: string; value: string }> {
  return models.map((model) => ({ title: model, value: model }));
}

export interface ModelSelectionRow {
  title: string;
  value: string;
  selected: boolean;
  current?: boolean;
}

export function modelSelectionRows(options: readonly { title: string; value: string }[], focus: number, currentValue?: string): ModelSelectionRow[] {
  const currentIndex = currentValue === undefined ? -1 : options.findIndex((option) => option.value === currentValue);
  return options.map((option, index) => ({
    ...option,
    selected: focus === index,
    ...(currentValue === undefined ? {} : { current: index === currentIndex }),
  }));
}

export function modelSelectionCue(title: string, current: boolean): string {
  return current ? currentValueCue(title) : title;
}

export interface ModelSelectionWindow {
  start: number;
  end: number;
  rows: Array<{ option: ModelSelectionOption; absoluteIndex: number }>;
}

export function modelSelectionWindow(options: readonly ModelSelectionOption[], focus: number, visibleRows = MODEL_VISIBLE_ROWS): ModelSelectionWindow {
  const size = Math.max(1, Math.floor(visibleRows));
  const boundedFocus = Math.max(0, Math.min(Math.max(0, options.length - 1), focus));
  const start = Math.max(0, Math.min(boundedFocus - size + 1, Math.max(0, options.length - size)));
  const end = Math.min(options.length, start + size);
  return {
    start,
    end,
    rows: options.slice(start, end).map((option, index) => ({ option, absoluteIndex: start + index })),
  };
}

export function ModelSelect(props: ModelSelectProps): JSX.Element {
  const colors = () => props.theme.current;
  const options = () => props.modelOptions ?? modelSelectionOptions(props.models);
  const window = () => modelSelectionWindow(options(), props.focus);
  const moveFromWheel = (event: MouseEvent) => {
    if (event.type !== "scroll" || !event.scroll || !props.onMoveFocus) return;
    event.preventDefault();
    event.stopPropagation();
    props.onMoveFocus(event.scroll.direction === "left" || event.scroll.direction === "up" ? -1 : 1);
  };
  return (
    <box flexDirection="column" gap={1} flexGrow={1} flexShrink={1} minHeight={0} onMouseScroll={moveFromWheel}>
      <SectionPanel theme={props.theme} title="Modelo">
      <FieldRow theme={props.theme} label="Actual" value={props.row.model ?? "modelo pendiente"} />
      <Divider theme={props.theme} />
      {options().length > MODEL_VISIBLE_ROWS ? <text fg={colors().textMuted}>Modelos {window().start + 1}-{window().end} de {options().length}</text> : null}
      {window().rows.map(({ option, absoluteIndex }) => {
        const current = (props.currentValue ?? props.row.model) === option.value;
        return <SelectableRow theme={props.theme} selected={props.focus === absoluteIndex} status={current ? "info" : undefined} onActivate={() => props.onSelect(option.value)}>{modelSelectionCue(option.title, current)}</SelectableRow>;
      })}
      {options().length === 0 ? <text fg={colors().textMuted}>{MODEL_EMPTY_MESSAGE}</text> : null}
      {props.error ? <text fg={colors().error}>{props.error}</text> : null}
      </SectionPanel>
    </box>
  );
}

export interface ProviderSelectProps {
  theme: TuiTheme;
  providers: readonly RuntimeModelProvider[];
  focus: number;
  error?: string;
  onSelect: (provider: string) => void;
}

export function ProviderSelect(props: ProviderSelectProps): JSX.Element {
  const options = () => providerSelectionOptions(props.providers);
  return (
    <box flexDirection="column" gap={1}>
      <SectionPanel theme={props.theme} title="Proveedor">
        {options().map((option, index) => <SelectableRow theme={props.theme} selected={props.focus === index} onActivate={() => props.onSelect(option.value)}>{option.title}</SelectableRow>)}
        {options().length === 0 ? <text fg={props.theme.current.textMuted}>No hay proveedores disponibles.</text> : null}
        {props.error ? <text fg={props.theme.current.error}>{props.error}</text> : null}
      </SectionPanel>
    </box>
  );
}
