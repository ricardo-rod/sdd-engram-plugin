import { RGBA } from "@opentui/core";
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import { describe, expect, it } from "vitest";
import { createVisualTokens, formatCatalogName } from "../src/tui/visual-tokens.ts";

const color = (value: number) => RGBA.fromValues(value / 100, value / 100, value / 100);
const theme = (overrides: Partial<TuiThemeCurrent> = {}) => ({
  accent: color(1), primary: color(2), borderActive: color(3), backgroundMenu: color(4),
  selectedListItemText: color(5), text: color(6), background: color(7), border: color(8),
  backgroundPanel: color(9), backgroundElement: color(10), success: color(11), warning: color(12),
  error: color(13), info: color(14), ...overrides,
} as TuiThemeCurrent);

describe("visual tokens", () => {
  it("uses host-token precedence for selection, indicator, and status groups", () => {
    const current = theme();
    expect(createVisualTokens(current)).toMatchObject({
      selected: { background: current.accent, foreground: current.selectedListItemText, border: current.borderActive },
      indicator: current.borderActive,
      status: { success: current.success, warning: current.warning, error: current.error, info: current.info },
    });
  });

  it("skips a candidate equal to its adjacent paired color", () => {
    const current = theme({
      accent: color(4), selectedListItemText: color(2), borderActive: color(2), error: color(2),
    });
    const tokens = createVisualTokens(current);
    expect(tokens.selected.background.equals(current.primary)).toBe(true);
    expect(tokens.selected.foreground.equals(current.text)).toBe(true);
    expect(tokens.indicator.equals(current.accent)).toBe(true);
    expect(tokens.status.error.equals(current.accent)).toBe(true);
  });

  it("continues through the documented host-token fallback chains", () => {
    const current = theme({ accent: color(4), primary: color(4), borderActive: color(3) });
    const background = createVisualTokens(current);
    expect(background.selected.background.equals(current.borderActive)).toBe(true);

    const statusCurrent = theme({ accent: color(2), primary: color(3), error: color(2) });
    const status = createVisualTokens(statusCurrent);
    expect(status.status.error.equals(statusCurrent.primary)).toBe(true);
  });

  it("exposes semantic yellow completion, blue form, and translucent search tokens", () => {
    const current = theme();
    const tokens = createVisualTokens(current);

    expect(tokens.action.finalize).toBe(current.warning);
    expect(tokens.form.label).toBe(current.primary);
    expect(tokens.form.value).toBe(current.text);
    expect(tokens.search.background.r).toBe(current.primary.r);
    expect(tokens.search.background.g).toBe(current.primary.g);
    expect(tokens.search.background.b).toBe(current.primary.b);
    expect(tokens.search.background.a).toBeLessThan(1);
    expect(tokens.search.focus).toBe(current.primary);
  });

  it("formats blank, normal, and long catalog names", () => {
    expect(formatCatalogName("")).toBe("(sin nombre)");
    expect(formatCatalogName("Agente de pruebas")).toBe("Agente de pruebas");
    expect(formatCatalogName("Nombre muy largo", 10)).toBe("Nombre mu…");
  });
});
