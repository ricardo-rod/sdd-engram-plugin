import { RGBA } from "@opentui/core";
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";

type VisualColor = RGBA;

export interface VisualTokens {
  selected: { background: VisualColor; foreground: VisualColor; border: VisualColor };
  indicator: VisualColor;
  status: Record<"success" | "warning" | "error" | "info", VisualColor>;
  surface: { panel: VisualColor; element: VisualColor; border: VisualColor; text: VisualColor; mutedText: VisualColor };
  action: { finalize: VisualColor };
  form: { label: VisualColor; value: VisualColor };
  search: { background: VisualColor; focus: VisualColor };
}

export function formatCatalogName(value: string, maxLength = 40): string {
  const name = value.trim();
  if (!name) return "(sin nombre)";
  return name.length <= maxLength ? name : `${name.slice(0, Math.max(0, maxLength - 1))}…`;
}

function sameColor(left: VisualColor, right: VisualColor): boolean {
  return left === right || left.equals(right);
}

function firstDistinct(reference: VisualColor, candidates: readonly VisualColor[]): VisualColor {
  return candidates.find((candidate) => !sameColor(candidate, reference)) ?? candidates.at(-1) ?? reference;
}

export function createVisualTokens(current: TuiThemeCurrent): VisualTokens {
  const selectedBackground = firstDistinct(current.backgroundMenu, [current.accent, current.primary, current.borderActive, current.backgroundMenu]);
  const selectedForeground = firstDistinct(selectedBackground, [current.selectedListItemText, current.text, current.background]);
  const indicator = firstDistinct(selectedBackground, [current.borderActive, current.accent, current.primary, current.border]);
  const status = (color: VisualColor): VisualColor => firstDistinct(selectedBackground, [color, current.accent, current.primary]);
  return {
    selected: { background: selectedBackground, foreground: selectedForeground, border: indicator },
    indicator,
    status: { success: status(current.success), warning: status(current.warning), error: status(current.error), info: status(current.info) },
    surface: { panel: current.backgroundPanel, element: current.backgroundElement, border: current.border, text: current.text, mutedText: current.textMuted },
    action: { finalize: current.warning },
    form: { label: current.primary, value: current.text },
    search: { background: RGBA.fromValues(current.primary.r, current.primary.g, current.primary.b, 0.35), focus: current.primary },
  };
}
