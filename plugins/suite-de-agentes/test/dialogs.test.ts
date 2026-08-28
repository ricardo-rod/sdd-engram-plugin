import { describe, expect, it } from "vitest";
import { showConfirm, showPrompt, showSelect } from "../src/tui/dialogs.tsx";

describe("OpenTUI dialog adapter", () => {
  it("uses dialog.replace and the host Dialog components", () => {
    const calls: string[] = [];
    const host = {
      ui: {
        dialog: { replace: (render: () => unknown) => { render(); } },
        DialogSelect: () => { calls.push("select"); return null; },
        DialogPrompt: () => { calls.push("prompt"); return null; },
        DialogConfirm: () => { calls.push("confirm"); return null; },
      },
    } as any;
    showSelect(host, { title: "Suite", options: [] });
    showPrompt(host, { title: "Name" });
    showConfirm(host, { title: "Activate", message: "Confirm" });
    expect(calls).toEqual(["select", "prompt", "confirm"]);
  });
});
