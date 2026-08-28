import type { JSX } from "@opentui/solid";
import { createTextAttributes } from "@opentui/core";
import type { TuiTheme } from "@opencode-ai/plugin/tui";
import { KeyHintBar } from "../visual-primitives.tsx";
import { createVisualTokens } from "../visual-tokens.ts";

export interface SuiteShellProps {
  theme: TuiTheme;
  title: string;
  children?: JSX.Element;
  keybar?: string;
  fillHeight?: boolean;
}

export const SUITE_SHELL_LAYOUT = {
  alignSelf: "center" as const,
  width: "100%" as const,
  height: "auto" as const,
  maxWidth: "100%" as const,
  maxHeight: "100%" as const,
  minWidth: 0,
  minHeight: 0,
  flexShrink: 1,
  overflow: "hidden" as const,
  borderStyle: "single" as const,
};

export const SUITE_SHELL_HEADER_LAYOUT = { flexShrink: 0, maxWidth: "100%" as const, overflow: "hidden" as const };
export const SUITE_SHELL_BODY_LAYOUT = { flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 0, maxWidth: "100%" as const, overflow: "hidden" as const, justifyContent: "flex-start" as const };
export const SUITE_SHELL_KEYBAR_LAYOUT = { flexShrink: 0, maxWidth: "100%" as const, overflow: "hidden" as const };

export type SuiteShellLayout = Omit<typeof SUITE_SHELL_LAYOUT, "height"> & { height: "auto" | "100%" };

export function suiteShellLayout(fillHeight = false): SuiteShellLayout {
  return fillHeight ? { ...SUITE_SHELL_LAYOUT, height: "100%" } : SUITE_SHELL_LAYOUT;
}

export function SuiteShell(props: SuiteShellProps): JSX.Element {
  const colors = () => props.theme.current;
  const tokens = () => createVisualTokens(props.theme.current);
  return (
    <box {...suiteShellLayout(props.fillHeight)} flexDirection="column" backgroundColor={colors().background} borderColor={tokens().indicator} padding={0}>
      <box {...SUITE_SHELL_HEADER_LAYOUT} justifyContent="center" backgroundColor={colors().backgroundPanel} paddingX={1}>
        <text fg={tokens().indicator} attributes={createTextAttributes({ bold: true })}>{props.title}</text>
      </box>
      <box {...SUITE_SHELL_BODY_LAYOUT} flexDirection="column" backgroundColor={colors().backgroundPanel} padding={1}>
        {props.children}
      </box>
      <box {...SUITE_SHELL_KEYBAR_LAYOUT} justifyContent="center" backgroundColor={colors().backgroundPanel}>
        <KeyHintBar theme={props.theme} hints={props.keybar ?? "↑↓ navega · Enter selecciona · Esc volver"} />
      </box>
    </box>
  );
}
