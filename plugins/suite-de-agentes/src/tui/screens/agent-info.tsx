import type { JSX } from "@opentui/solid";
import type { TuiTheme } from "@opencode-ai/plugin/tui";
import type { AgentCatalogRow } from "../../core/types.ts";
import { getBuiltInDefinition, isInternalBuiltInAgent } from "../../core/built-in-agents.ts";
import { agentInfoSections, Divider, FIELD_ROW_VALUE_CONTAINER_LAYOUT, FIELD_ROW_VALUE_TEXT_LAYOUT, FIELD_ROW_WRAPPED_LAYOUT, FieldRow, SectionPanel, SelectableRow, StatusBadge, type AgentInfoSection, type StatusBadgeProps } from "../visual-primitives.tsx";

export interface AgentInfoProps {
  theme: TuiTheme;
  row: AgentCatalogRow;
  operations?: string;
  focus: number;
  onOpenModelAssignment: () => void;
  onRestoreBuiltIn?: () => void;
  onDeactivate?: () => void;
  onBack: () => void;
}

export const AGENT_INFO_LAYOUT = { flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 0, justifyContent: "center" as const, alignItems: "center" as const };
export const AGENT_INFO_CONTENT_LAYOUT = { width: "100%" as const, height: "100%" as const, flexShrink: 1, minWidth: 0, minHeight: 0, gap: 1 };
export const AGENT_INFO_DETAIL_LAYOUT = { flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 0, gap: 1, overflow: "scroll" as const };
export const AGENT_INFO_SCROLL_CONTENT_LAYOUT = { width: "100%" as const, minWidth: 0, flexShrink: 1, paddingLeft: 2, paddingRight: 2, gap: 1 };
export const AGENT_INFO_ACTIONS_LAYOUT = { flexShrink: 0, minWidth: 0 };
export const AGENT_INFO_FIELD_LAYOUT = FIELD_ROW_WRAPPED_LAYOUT;
export const AGENT_INFO_FIELD_VALUE_LAYOUT = FIELD_ROW_VALUE_CONTAINER_LAYOUT;
export const AGENT_INFO_FIELD_TEXT_LAYOUT = FIELD_ROW_VALUE_TEXT_LAYOUT;

export function agentInfoDisplaySections(row: AgentCatalogRow, operations?: string): readonly AgentInfoSection[] {
  return agentInfoSections(row, operations);
}

export function agentInfoStatus(row: Pick<AgentCatalogRow, "enabled" | "membership">): StatusBadgeProps["status"] {
  return row.enabled ? "success" : row.membership === "custom" ? "warning" : "info";
}

/** Legacy flat formatter retained for public callers; rendering uses sections. */
export function formatAgentInfo(row: AgentCatalogRow, operations?: string): string[] {
  return [
    row.id,
    row.description === undefined ? "Descripción: ninguna" : row.description,
    `Skills: ${row.skills.join(", ") || "ninguna"}`,
    `Operaciones: ${operations || "ninguna"}`,
    `Modelo: ${row.model ?? "modelo pendiente"}`,
    `Esfuerzo: ${row.variant ?? "predeterminado"}`,
  ];
}

export function agentInfoActions(row?: Pick<AgentCatalogRow, "id" | "membership">): readonly string[] {
  if (!row) return ["Cambiar modelo y esfuerzo", "Volver"];
  if (getBuiltInDefinition(row.id)) return ["Cambiar modelo y esfuerzo", "Restaurar valores base", isInternalBuiltInAgent(row.id) ? "Desactivar (requiere anulación avanzada)" : "Desactivar", "Volver"];
  return ["Cambiar modelo y esfuerzo", "Volver"];
}

export function infoActionKeys(_row?: Pick<AgentCatalogRow, "id" | "membership" | "enabled"> & { disabled?: boolean }): string[] {
  return [...agentInfoActions(_row)];
}

export function AgentInfo(props: AgentInfoProps): JSX.Element {
  const actions = () => agentInfoActions(props.row);
  const action = (index: number) => {
    const label = actions()[index];
    if (label === "Cambiar modelo y esfuerzo") props.onOpenModelAssignment();
    else if (label === "Restaurar valores base") props.onRestoreBuiltIn?.();
    else if (label?.startsWith("Desactivar")) props.onDeactivate?.();
    else props.onBack();
  };
  return (
    <box {...AGENT_INFO_LAYOUT} flexDirection="column">
      <box {...AGENT_INFO_CONTENT_LAYOUT} flexDirection="column">
        <scrollbox {...AGENT_INFO_DETAIL_LAYOUT}>
          <box {...AGENT_INFO_SCROLL_CONTENT_LAYOUT} flexDirection="column">
            {agentInfoDisplaySections(props.row, props.operations).map((section) => (
              <SectionPanel theme={props.theme} title={section.title}>
                {section.fields.map(([label, value]) => label === "Estado"
                  ? (
                    <FieldRow theme={props.theme} label={label} wrap>
                      <StatusBadge theme={props.theme} status={agentInfoStatus(props.row)}>{value}</StatusBadge>
                    </FieldRow>
                  )
                  : <FieldRow theme={props.theme} label={label} value={value} wrap />)}
              </SectionPanel>
            ))}
          </box>
        </scrollbox>
        <Divider theme={props.theme} />
        <box {...AGENT_INFO_ACTIONS_LAYOUT} flexDirection="column">
          {actions().map((label, index) => <SelectableRow theme={props.theme} selected={props.focus === index} onActivate={() => action(index)}>{label}</SelectableRow>)}
        </box>
      </box>
    </box>
  );
}
