import { describe, expect, it } from "vitest";
import { errorPanelKeyAction, errorPanelPresentation } from "../src/tui/screens/error-panel.tsx";

describe("Agent Suite error panel", () => {
  it("keeps semantic actions and retry/close key behavior", () => {
    expect(errorPanelPresentation(1)).toEqual({
      status: "error",
      actions: [{ label: "Reintentar", selected: false }, { label: "Cerrar", selected: true }],
    });
    expect(errorPanelKeyAction("return")).toBe("retry");
    expect(errorPanelKeyAction("linefeed")).toBe("retry");
    expect(errorPanelKeyAction("escape")).toBe("close");
  });
});
