import type { JSX } from "@opentui/solid";
import { useKeyboard } from "@opentui/solid";
import type { TuiTheme } from "@opencode-ai/plugin/tui";
import { Divider, FieldRow, SectionPanel, SelectableRow, StatusBadge } from "../visual-primitives.tsx";

export interface ErrorPanelProps {
  theme: TuiTheme;
  message: string;
  onRetry: () => void;
  onClose: () => void;
  focus?: 0 | 1;
}

export function errorPanelPresentation(focus: 0 | 1 = 0): { status: "error"; actions: Array<{ label: string; selected: boolean }> } {
  return { status: "error", actions: ["Reintentar", "Cerrar"].map((label, index) => ({ label, selected: focus === index })) };
}

export function errorPanelKeyAction(name: string): "retry" | "close" | undefined {
  if (name === "return" || name === "linefeed") return "retry";
  if (name === "escape") return "close";
  return undefined;
}

export function ErrorPanel(props: ErrorPanelProps): JSX.Element {
  useKeyboard((key) => {
    const action = errorPanelKeyAction(key.name);
    if (!action) return;
    key.preventDefault();
    key.stopPropagation();
    if (action === "retry") props.onRetry(); else props.onClose();
  });
  return (
    <box flexDirection="column" gap={1}>
      <SectionPanel theme={props.theme} title="Estado de la Suite">
        <StatusBadge theme={props.theme} status="error">No se pudo renderizar la Suite de Agentes</StatusBadge>
        <FieldRow theme={props.theme} label="Detalle" value={props.message} />
      </SectionPanel>
      <Divider theme={props.theme} />
      {errorPanelPresentation(props.focus).actions.map(({ label, selected }, index) => <SelectableRow theme={props.theme} selected={selected} onActivate={() => { if (index === 0) props.onRetry(); else props.onClose(); }}>{label}</SelectableRow>)}
    </box>
  );
}
