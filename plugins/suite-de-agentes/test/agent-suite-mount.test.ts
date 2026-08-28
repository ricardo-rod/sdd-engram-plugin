import { describe, expect, it, vi } from "vitest";
import { handleAgentSuiteEscape, mountAgentSuite, registerAgentSuiteEscapeHandler, SUITE_DIALOG_SIZE, type DialogMountApi } from "../src/tui/agent-suite-mount.tsx";
import { createAgentSuiteController } from "../src/tui/agent-suite-controller.ts";
import { openAgentSuite, tui } from "../src/tui/index.tsx";
import { SUITE_SHELL_BODY_LAYOUT, SUITE_SHELL_HEADER_LAYOUT, SUITE_SHELL_KEYBAR_LAYOUT, SUITE_SHELL_LAYOUT, suiteShellLayout } from "../src/tui/screens/suite-shell.tsx";

const mountedApp = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }));
vi.mock("../src/tui/agent-suite-app.tsx", () => ({ AgentSuiteApp: (props: Record<string, unknown>) => { mountedApp.props = props; return "agent-suite-content" as never; } }));
vi.mock("solid-js", async () => {
  const actual = await vi.importActual<typeof import("solid-js")>("solid-js");
  return { ...actual, ErrorBoundary: (props: { children?: unknown }) => props.children };
});

describe("Agent Suite dialog mount", () => {
  it("replaces once, never clears during navigation, and clears once on close", () => {
    const api: DialogMountApi & { onClose?: () => void } = { theme: {} as never, ui: { Dialog: () => null, dialog: { setSize: vi.fn(), replace: vi.fn(), clear: vi.fn() } } };
    const replace = vi.fn((_render: () => unknown, onClose?: () => void) => { onClose && (api.onClose = onClose); });
    const clear = api.ui.dialog.clear as ReturnType<typeof vi.fn>;
    api.ui.dialog.replace = replace;
    const mounted = mountAgentSuite(api, createAgentSuiteController());
    expect(replace).toHaveBeenCalledTimes(1);
    mounted.requestClose();
    expect(clear).toHaveBeenCalledTimes(1);
    api.onClose?.();
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("shares closeOnce between host close and request close in either order", () => {
    const clear = vi.fn();
    let onClose: (() => void) | undefined;
    const api: DialogMountApi = { theme: {} as never, ui: { Dialog: () => null, dialog: { setSize: vi.fn(), replace: vi.fn((_render, close) => { onClose = close; }), clear } } };
    const first = mountAgentSuite(api, createAgentSuiteController());
    onClose?.();
    first.requestClose();
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("registers the opener without exposing a route surface", () => {
    expect(tui).toBeTypeOf("function");
    expect(openAgentSuite).toBeTypeOf("function");
  });

  it("absorbs a second close request while closing", () => {
    const clear = vi.fn();
    const api: DialogMountApi = { theme: {} as never, ui: { Dialog: () => null, dialog: { setSize: vi.fn(), replace: vi.fn(), clear } } };
    const mounted = mountAgentSuite(api, createAgentSuiteController());
    mounted.requestClose();
    mounted.requestClose();
    expect(mounted.isClosing()).toBe(true);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("uses one host dialog layer, restores large size after replacement, and bounds the shell geometry", () => {
    const events: string[] = [];
    let effectiveSize: "medium" | "large" | "xlarge" = "medium";
    let rendered: unknown;
    const Dialog = vi.fn(() => "nested-host-dialog" as never);
    const setSize = vi.fn((size: "medium" | "large" | "xlarge") => {
      effectiveSize = size;
      events.push(`setSize:${size}`);
    });
    const replace = vi.fn((render: () => unknown) => {
      effectiveSize = "medium";
      events.push("replace");
      rendered = render();
    });
    const api: DialogMountApi = {
      theme: {} as never,
      ui: {
        Dialog,
        dialog: {
          setSize,
          replace,
          clear: vi.fn(),
        },
      },
    };

    mountAgentSuite(api, createAgentSuiteController());

    expect(SUITE_DIALOG_SIZE).toBe("large");
    expect(setSize).toHaveBeenCalledWith("large");
    expect(effectiveSize).toBe("large");
    expect(events).toEqual(["replace", "setSize:large"]);
    expect(Dialog).not.toHaveBeenCalled();
    expect(rendered).not.toBe("nested-host-dialog");
    expect(SUITE_SHELL_LAYOUT).toMatchObject({
      alignSelf: "center", width: "100%", height: "auto", maxWidth: "100%", maxHeight: "100%",
      minHeight: 0, flexShrink: 1, overflow: "hidden",
    });
    expect(SUITE_SHELL_LAYOUT).not.toHaveProperty("margin");
    expect(SUITE_SHELL_LAYOUT).not.toHaveProperty("padding");
    expect(SUITE_SHELL_HEADER_LAYOUT).toMatchObject({ flexShrink: 0 });
    expect(SUITE_SHELL_BODY_LAYOUT).toMatchObject({ flexGrow: 1, flexShrink: 1, minHeight: 0, overflow: "hidden", justifyContent: "flex-start" });
    expect(SUITE_SHELL_KEYBAR_LAYOUT).toMatchObject({ flexShrink: 0 });
    expect(suiteShellLayout()).toMatchObject({ height: "auto" });
    expect(suiteShellLayout(true)).toMatchObject({ height: "100%", width: "100%", maxHeight: "100%" });
  });

  it("exposes an active nested Escape handler to the host keymap path", () => {
    const clear = vi.fn();
    const api: DialogMountApi = {
      theme: {} as never,
      ui: {
        Dialog: () => null,
        dialog: { setSize: vi.fn(), replace: vi.fn(), clear },
      },
    };
    const mounted = mountAgentSuite(api, createAgentSuiteController());
    const unregister = registerAgentSuiteEscapeHandler(() => true);

    expect(handleAgentSuiteEscape()).toBe(true);
    unregister();
    expect(handleAgentSuiteEscape()).toBe(false);
    mounted.requestClose();
    expect(handleAgentSuiteEscape()).toBe(false);
  });

  it("passes only runtime providers and effort lookup into the mounted catalog app", () => {
    const controller = createAgentSuiteController();
    const providers = [{ id: "openai", name: "OpenAI", models: {} }];
    const api: DialogMountApi = {
      theme: {} as never,
      ui: { Dialog: () => null, dialog: { setSize: vi.fn(), replace: vi.fn((render) => { render(); }), clear: vi.fn() } },
      providers,
      variantOptions: () => ["high"],
    };

    mountAgentSuite(api, controller);

    expect(mountedApp.props?.providers).toBe(providers);
    expect(mountedApp.props?.variantOptions).toBe(api.variantOptions);
  });

});
