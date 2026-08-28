import { describe, expect, it, vi } from "vitest";
import { createSuiteAdapter, preserveSuiteCatalogParity, SUITE_COMMAND, SUITE_SHORTCUT } from "./suite-adapter";

type SuiteKeymapLayer = {
  commands: Array<{ name: string; title: string; run(): boolean }>;
  bindings: Array<{ key: string; cmd: string }>;
};

describe("Suite adapter", () => {
  it("registers the Suite command and Alt+S through the host keymap", () => {
    const registerLayer = vi.fn((_layer: SuiteKeymapLayer) => vi.fn());
    const open = vi.fn();

    const registered = createSuiteAdapter(open).register({ keymap: { registerLayer } });
    const layer = registerLayer.mock.calls[0]?.[0];

    expect(registered).toBe(true);
    expect(layer?.commands).toEqual([expect.objectContaining({ name: SUITE_COMMAND, title: "Suite de Agentes" })]);
    expect(layer?.bindings).toEqual([{ key: SUITE_SHORTCUT, cmd: SUITE_COMMAND }]);
    expect(layer?.commands[0]?.run()).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("preserves internal, custom, and disabled catalog entries exactly", () => {
    const source = [
      { id: "summary", membership: "internal" as const, disabled: false, model: "host/default" },
      { id: "review-ux", membership: "custom" as const, disabled: false, model: "openai/gpt-5" },
      { id: "compaction", membership: "internal" as const, disabled: true, model: "host/default" },
    ];

    expect(preserveSuiteCatalogParity(source)).toEqual(source);
  });
});
