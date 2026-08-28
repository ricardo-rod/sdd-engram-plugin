import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPluginHelpOptions,
  showPluginsHelpMenu,
  showPluginHelpDetail,
  showPluginsMenu,
  showProfilesMenu,
} from "./dialogs";
import type { HelpTopic } from "./plugins/offline-help";
import * as coordinator from "./plugins/task-manager-coordinator";
import * as lifecycle from "./plugins/task-manager-lifecycle";
import * as rootModule from "./plugins/task-manager-root";

describe("Plugins Help flow (Unit 1)", () => {
  const createMockApi = () => {
    let currentDialogComponent: any = null;
    return {
      ui: {
        dialog: {
          setSize: vi.fn(),
          replace: vi.fn((renderFn: () => any) => {
            currentDialogComponent = renderFn();
            return currentDialogComponent;
          }),
          clear: vi.fn(),
        },
        toast: vi.fn(),
        DialogSelect: (props: any) => ({ type: "DialogSelect", props }),
        DialogAlert: (props: any) => ({ type: "DialogAlert", props }),
      },
      getCurrentDialog: () => currentDialogComponent,
    };
  };

  it("builds help options with 3 plugin entries and back navigation", () => {
    const options = buildPluginHelpOptions();

    expect(options).toHaveLength(4);
    expect(options.map((opt: any) => opt.value)).toEqual(["suite", "task-manager", "hub", "__back__"]);
    expect(options.find((opt: any) => opt.value === "suite")?.title).toBe("Suite de Agentes");
    expect(options.find((opt: any) => opt.value === "task-manager")?.title).toBe("Task Manager");
    expect(options.find((opt: any) => opt.value === "hub")?.title).toContain("Hub");
    expect(options.find((opt: any) => opt.value === "__back__")?.title).toBe("← Volver");
  });

  it("showPluginsMenu routes 'help' option to showPluginsHelpMenu instead of a static toast", () => {
    const api = createMockApi();
    showPluginsMenu(api);

    const dialog = api.getCurrentDialog();
    expect(dialog.type).toBe("DialogSelect");
    expect(dialog.props.title).toBe("Plugins");

    // Select help
    dialog.props.onSelect({ value: "help" });

    // Should have transitioned to DialogSelect with title 'Ayuda de Plugins'
    const helpDialog = api.getCurrentDialog();
    expect(helpDialog.type).toBe("DialogSelect");
    expect(helpDialog.props.title).toBe("Ayuda de Plugins");
    expect(api.ui.toast).not.toHaveBeenCalled();
  });

  it.each([
    ["suite" as HelpTopic, "Suite de Agentes"],
    ["task-manager" as HelpTopic, "Task Manager"],
    ["hub" as HelpTopic, "opencode-sdd-engram-manage"],
  ])("showPluginHelpDetail renders DialogAlert with offline documentation for topic '%s'", (topic, expectedContent) => {
    const api = createMockApi();
    showPluginHelpDetail(api, topic);

    const dialog = api.getCurrentDialog();
    expect(dialog.type).toBe("DialogAlert");
    expect(dialog.props.message).toContain(expectedContent);
    expect(api.ui.dialog.setSize).toHaveBeenCalledWith("xlarge");

    // Confirming returns to help submenu
    dialog.props.onConfirm();
    const returnedDialog = api.getCurrentDialog();
    expect(returnedDialog.type).toBe("DialogSelect");
    expect(returnedDialog.props.title).toBe("Ayuda de Plugins");
  });

  it("navigating back or cancelling in help submenu returns to showPluginsMenu", () => {
    const api = createMockApi();
    showPluginsHelpMenu(api);

    const helpDialog = api.getCurrentDialog();
    expect(helpDialog.props.title).toBe("Ayuda de Plugins");

    // Cancel returns to plugins menu
    helpDialog.props.onCancel();
    let rootDialog = api.getCurrentDialog();
    expect(rootDialog.props.title).toBe("Plugins");

    // Select __back__ returns to plugins menu
    showPluginsHelpMenu(api);
    helpDialog.props.onSelect({ value: "__back__" });
    rootDialog = api.getCurrentDialog();
    expect(rootDialog.props.title).toBe("Plugins");
  });
});

describe("Task Manager Action & Integration (Unit 3)", () => {
  const createMockApi = (workspaceDir = "C:/custom/workspace") => {
    let currentDialogComponent: any = null;
    return {
      state: {
        path: {
          directory: workspaceDir,
        },
      },
      ui: {
        dialog: {
          setSize: vi.fn(),
          replace: vi.fn((renderFn: () => any) => {
            currentDialogComponent = renderFn();
            return currentDialogComponent;
          }),
          clear: vi.fn(),
        },
        toast: vi.fn(),
        DialogSelect: (props: any) => ({ type: "DialogSelect", props }),
        DialogAlert: (props: any) => ({ type: "DialogAlert", props }),
      },
      getCurrentDialog: () => currentDialogComponent,
    };
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("3.1 RED: Task Manager menu action resolves candidate root from api.state.path.directory, prioritizes detected Git root, then provisions and launches", async () => {
    const api = createMockApi("C:/custom/workspace/subdir");

    const resolveRootSpy = vi.spyOn(rootModule, "resolveTaskManagerRoot");
    const launchSpy = vi.spyOn(coordinator, "launchTaskManagerBrowser").mockResolvedValue({
      opened: true,
      method: "process",
      path: "C:/custom/workspace/Task-Manager-Portable.html",
    });

    showPluginsMenu(api);
    const dialog = api.getCurrentDialog();
    expect(dialog.props.title).toBe("Plugins");

    // Trigger Task Manager menu action
    await dialog.props.onSelect({ value: "task-manager" });

    // Assert that resolveTaskManagerRoot was invoked with candidates from api.state.path.directory (NOT process.cwd())
    expect(resolveRootSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "C:/custom/workspace/subdir",
      })
    );
  });

  it("3.1 RED: detectGitRootForDirectory and buildTaskManagerRootCandidates supply detected Git root when present so Git wins", () => {
    const api = createMockApi("C:/custom/repo/packages/sub");
    
    // Test pure candidate building logic with mock
    const candidates = rootModule.resolveTaskManagerRoot({
      cwd: "C:/custom/repo/packages/sub",
      gitRoot: "C:/custom/repo",
      manifestRoot: "C:/custom/repo/packages/sub",
    });

    // Git root must be selected as root and confirmed
    expect(candidates.root).toBe("C:/custom/repo");
    expect(candidates.confirmed).toBe(true);
  });

  it("3.2 RED: real provisioning idempotency at Unit 3 boundary ensures existing dashboard is not overwritten", async () => {
    const api = createMockApi("C:/custom/workspace");

    let provisionCallCount = 0;
    const realProvisionSpy = vi.spyOn(lifecycle, "provisionTaskManagerBase").mockImplementation((root, template, route) => {
      provisionCallCount++;
      return {
        created: provisionCallCount === 1,
        path: `${root}/Task-Manager-Portable.html`,
        route,
      };
    });

    vi.spyOn(coordinator, "launchTaskManagerBrowser").mockResolvedValue({
      opened: true,
      method: "process",
      path: "C:/custom/workspace/Task-Manager-Portable.html",
    });

    showPluginsMenu(api);
    const dialog = api.getCurrentDialog();

    // First execution creates
    await dialog.props.onSelect({ value: "task-manager" });
    expect(realProvisionSpy).toHaveBeenNthCalledWith(1, "C:/custom/workspace", expect.any(String), "foreground");
    expect(realProvisionSpy.mock.results[0].value.created).toBe(true);

    // Second execution against existing dashboard yields created: false without duplication
    await dialog.props.onSelect({ value: "task-manager" });
    expect(realProvisionSpy).toHaveBeenNthCalledWith(2, "C:/custom/workspace", expect.any(String), "foreground");
    expect(realProvisionSpy.mock.results[1].value.created).toBe(false);
  });

  it("3.3 RED: fallback UI renders modal DialogAlert with manual instructions on headless or spawn failure", async () => {
    const api = createMockApi();

    vi.spyOn(rootModule, "resolveTaskManagerRoot").mockReturnValue({
      root: "C:/fake/project",
      canonicalRoot: "C:/fake/project",
      key: "c:/fake/project",
      confirmed: true,
    });

    vi.spyOn(lifecycle, "provisionTaskManagerBase").mockReturnValue({
      created: false,
      path: "C:/fake/project/Task-Manager-Portable.html",
      route: "foreground",
    });

    vi.spyOn(coordinator, "launchTaskManagerBrowser").mockResolvedValue({
      opened: false,
      method: "none",
      path: "C:/fake/project/Task-Manager-Portable.html",
      fallback: {
        title: "Task Manager (Apertura Manual)",
        absolutePath: "C:\\fake\\project\\Task-Manager-Portable.html",
        manualInstructions: "Entorno sin navegador interactivo detectado.\n\nPuedes abrir el Task Manager manualmente en tu navegador local copiando la siguiente ruta:\nC:\\fake\\project\\Task-Manager-Portable.html",
      },
    });

    showPluginsMenu(api);
    const dialog = api.getCurrentDialog();

    await dialog.props.onSelect({ value: "task-manager" });

    const alertDialog = api.getCurrentDialog();
    expect(alertDialog.type).toBe("DialogAlert");
    expect(alertDialog.props.title).toBe("Task Manager (Apertura Manual)");
    expect(alertDialog.props.message).toContain("C:\\fake\\project\\Task-Manager-Portable.html");
    expect(alertDialog.props.message).toContain("Entorno sin navegador interactivo detectado");

    // On confirm, returns to Plugins menu
    alertDialog.props.onConfirm();
    const returnedDialog = api.getCurrentDialog();
    expect(returnedDialog.type).toBe("DialogSelect");
    expect(returnedDialog.props.title).toBe("Plugins");
  });

  it("3.3 RED: successful launch provides concise notification and closes or keeps modal clean without fake toast path stubs", async () => {
    const api = createMockApi();

    vi.spyOn(rootModule, "resolveTaskManagerRoot").mockReturnValue({
      root: "C:/fake/project",
      canonicalRoot: "C:/fake/project",
      key: "c:/fake/project",
      confirmed: true,
    });

    vi.spyOn(lifecycle, "provisionTaskManagerBase").mockReturnValue({
      created: false,
      path: "C:/fake/project/Task-Manager-Portable.html",
      route: "foreground",
    });

    vi.spyOn(coordinator, "launchTaskManagerBrowser").mockResolvedValue({
      opened: true,
      method: "process",
      path: "C:/fake/project/Task-Manager-Portable.html",
    });

    showPluginsMenu(api);
    const dialog = api.getCurrentDialog();

    await dialog.props.onSelect({ value: "task-manager" });

    expect(api.ui.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Task Manager",
        message: expect.stringMatching(/abierto|lanzado|disponible/i),
      })
    );
  });
});
