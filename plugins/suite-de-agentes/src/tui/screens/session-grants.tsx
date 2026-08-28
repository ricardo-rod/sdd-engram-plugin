import type { JSX } from "@opentui/solid";
import type { TuiTheme } from "@opencode-ai/plugin/tui";
import type { SessionGrant } from "../../core/types.ts";
import { getBuiltInDefinition } from "../../core/built-in-agents.ts";
import { Divider, SelectableRow } from "../visual-primitives.tsx";

export interface SessionGrantsProps {
  theme: TuiTheme;
  grants: readonly SessionGrant[];
  focus: number;
  onRevoke: (grantID: string) => void;
  onBack: () => void;
}

function grantAgentName(id: string): string {
  return getBuiltInDefinition(id)?.displayName ?? id;
}

export function sessionGrantLabel(grant: Pick<SessionGrant, "id" | "sessionID" | "requester" | "target" | "purpose" | "operation" | "duration">): string {
  return `${grantAgentName(grant.requester)} → ${grantAgentName(grant.target)} · ${grant.purpose} · sesión actual`;
}

export function SessionGrants(props: SessionGrantsProps): JSX.Element {
  return <box flexDirection="column" gap={1}><text fg={props.theme.current.textMuted}>Permisos activos para esta sesión</text><Divider theme={props.theme} />{props.grants.length === 0 ? <text fg={props.theme.current.textMuted}>No hay permisos de sesión activos.</text> : props.grants.map((grant, index) => <SelectableRow theme={props.theme} selected={props.focus === index} onActivate={() => props.onRevoke(grant.id)}>{sessionGrantLabel(grant)}</SelectableRow>)}<SelectableRow theme={props.theme} selected={props.focus === props.grants.length} onActivate={props.onBack}>Volver</SelectableRow></box>;
}
