import { describe, expect, it, vi } from "vitest";
import * as child_process from "node:child_process";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createTaskManagerCoordinator,
  openTaskManagerResult,
  buildBrowserLaunchCommand,
  launchTaskManagerBrowser,
  formatHeadlessFallbackPayload,
  validatePathWithinRoot,
} from "./task-manager-coordinator";

const project = { root: "C:/work/app", canonicalRoot: "C:/work/app", key: "c:/work/app", confirmed: true };
const request = (milestone: string) => ({ project, reason: "sdd" as const, evidence: { project: project.root, milestone, facts: [], priorState: {} } });

describe("Task Manager coordinator", () => {
  it("coalesces concurrent triggers into one latest pending request per root", async () => {
    const calls: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const coordinator = createTaskManagerCoordinator(async (next) => { calls.push(next.evidence.milestone); if (calls.length === 1) await gate; return { opened: true, method: "host", path: "C:/work/app/Task-Manager-Portable.html" }; });

    const first = coordinator.enqueue(request("sdd-tasks"));
    const second = coordinator.enqueue(request("sdd-verify"));
    const third = coordinator.enqueue(request("sdd-archive"));
    release();
    await Promise.all([first, second, third]);

    expect(calls).toEqual(["sdd-tasks", "sdd-archive"]);
  });

  it("retries once, then reports a manual recovery path while preserving the failure status", async () => {
    let attempts = 0;
    const coordinator = createTaskManagerCoordinator(async () => {
      attempts += 1;
      throw new Error("browser unavailable");
    });

    await expect(coordinator.enqueue(request("sdd-verify"))).resolves.toEqual({ opened: false, method: "none", path: "C:/work/app", error: "Requiere actualización manual: browser unavailable" });
    expect(attempts).toBe(2);
    expect(coordinator.status(project.key)).toBe("requires-update");
  });

  it("reports a successful process fallback when the host browser opener is unavailable", () => {
    expect(openTaskManagerResult("C:/work/app/Task-Manager-Portable.html", "process")).toEqual({ opened: true, method: "process", path: "C:/work/app/Task-Manager-Portable.html" });
  });

  describe("Phase 2: Safe Launcher & Lifecycle (Unit 2)", () => {
    it("2.1 RED: enforces spawn with shell: false, array args, detached: true, stdio: 'ignore', and .unref()", async () => {
      const unrefMock = vi.fn();
      const spawnMock = vi.fn().mockReturnValue({
        unref: unrefMock,
        on: vi.fn((event, cb) => {
          if (event === "spawn") cb();
          return this;
        }),
      });

      const result = await launchTaskManagerBrowser({
        filePath: "C:/work/app/Task-Manager-Portable.html",
        canonicalRoot: "C:/work/app",
        platform: "win32",
        isHeadless: false,
        spawn: spawnMock as unknown as typeof child_process.spawn,
      });

      expect(result.opened).toBe(true);
      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [cmd, args, options] = spawnMock.mock.calls[0];
      expect(cmd).toBe("cmd");
      expect(args).toEqual(["/c", "start", "", expect.any(String)]);
      expect(options).toMatchObject({
        shell: false,
        detached: true,
        stdio: "ignore",
      });
      expect(unrefMock).toHaveBeenCalledTimes(1);
    });

    it("2.2 RED: metacharacter path passes safely through pathToFileURL and not raw string interpolation", () => {
      const specialPath = "C:/work/app/my project & test (v1.0)#file?.html";
      const command = buildBrowserLaunchCommand(specialPath, "win32");
      const expectedUrl = pathToFileURL(path.resolve(specialPath)).href;
      expect(command.args[command.args.length - 1]).toBe(expectedUrl);
      expect(command.url).toBe(expectedUrl);
      expect(command.url.startsWith("file:///")).toBe(true);
      expect(command.url).toContain("%20");
    });

    it("2.3 RED: platform command adapter handles Windows (cmd /c start \"\"), Linux (xdg-open), and macOS (open)", () => {
      const testPath = "/home/user/repo/Task-Manager-Portable.html";
      const expectedUrl = pathToFileURL(path.resolve(testPath)).href;

      const winCmd = buildBrowserLaunchCommand("C:/repo/Task-Manager-Portable.html", "win32");
      expect(winCmd.command).toBe("cmd");
      expect(winCmd.args).toEqual(["/c", "start", "", pathToFileURL(path.resolve("C:/repo/Task-Manager-Portable.html")).href]);

      const linuxCmd = buildBrowserLaunchCommand(testPath, "linux");
      expect(linuxCmd.command).toBe("xdg-open");
      expect(linuxCmd.args).toEqual([expectedUrl]);

      const darwinCmd = buildBrowserLaunchCommand(testPath, "darwin");
      expect(darwinCmd.command).toBe("open");
      expect(darwinCmd.args).toEqual([expectedUrl]);
    });

    it("2.4 RED (ENOENT): ENOENT returns graceful fallback payload with decoded absolute path and manual instructions", async () => {
      const spawnMock = vi.fn().mockImplementation(() => {
        const emitter = {
          unref: vi.fn(),
          on: vi.fn((event, cb) => {
            if (event === "error") {
              setTimeout(() => cb(new Error("spawn ENOENT xdg-open")), 5);
            }
            return emitter;
          }),
        };
        return emitter;
      });

      const result = await launchTaskManagerBrowser({
        filePath: "/home/user/app/Task-Manager-Portable.html",
        canonicalRoot: "/home/user/app",
        platform: "linux",
        isHeadless: false,
        spawn: spawnMock as unknown as typeof child_process.spawn,
      });

      expect(result.opened).toBe(false);
      expect(result.method).toBe("none");
      expect(result.fallback).toBeDefined();
      expect(result.fallback?.absolutePath).toBe(path.resolve("/home/user/app/Task-Manager-Portable.html"));
      expect(result.fallback?.manualInstructions).toContain("No se pudo abrir el navegador");
      expect(result.fallback?.manualInstructions).toContain(path.resolve("/home/user/app/Task-Manager-Portable.html"));
    });

    it("2.4 RED (nonzero exit): nonzero exit/close code returns graceful fallback payload with exit code reason", async () => {
      const spawnMock = vi.fn().mockImplementation(() => {
        const emitter = {
          unref: vi.fn(),
          on: vi.fn((event, cb) => {
            if (event === "close" || event === "exit") {
              setTimeout(() => cb(1), 5);
            }
            return emitter;
          }),
        };
        return emitter;
      });

      const result = await launchTaskManagerBrowser({
        filePath: "/home/user/app/Task-Manager-Portable.html",
        canonicalRoot: "/home/user/app",
        platform: "linux",
        isHeadless: false,
        spawn: spawnMock as unknown as typeof child_process.spawn,
      });

      expect(result.opened).toBe(false);
      expect(result.method).toBe("none");
      expect(result.fallback).toBeDefined();
      expect(result.fallback?.absolutePath).toBe(path.resolve("/home/user/app/Task-Manager-Portable.html"));
      expect(result.fallback?.manualInstructions).toContain("código de salida 1");
      expect(result.fallback?.manualInstructions).toContain(path.resolve("/home/user/app/Task-Manager-Portable.html"));
    });

    it("2.5 RED: headless environment returns modal-ready fallback without crashing", async () => {
      const result = await launchTaskManagerBrowser({
        filePath: "/home/user/app/Task-Manager-Portable.html",
        canonicalRoot: "/home/user/app",
        platform: "linux",
        isHeadless: true,
      });

      expect(result.opened).toBe(false);
      expect(result.method).toBe("none");
      expect(result.fallback).toBeDefined();
      expect(result.fallback?.title).toBe("Task Manager (Modo sin interfaz gráfica / Headless)");
      expect(result.fallback?.manualInstructions).toContain("Entorno sin navegador interactivo detectado");
    });

    it("2.6 RED: spawned process unref ensures child process does not block event loop", async () => {
      let unrefCalled = false;
      const spawnMock = vi.fn().mockReturnValue({
        unref: () => { unrefCalled = true; },
        on: vi.fn((event, cb) => {
          if (event === "spawn") cb();
          return this;
        }),
      });

      await launchTaskManagerBrowser({
        filePath: "C:/work/app/Task-Manager-Portable.html",
        canonicalRoot: "C:/work/app",
        platform: "win32",
        isHeadless: false,
        spawn: spawnMock as unknown as typeof child_process.spawn,
      });

      expect(unrefCalled).toBe(true);
    });

    it("2.7 RED: canonicalRoot rejects traversal outside resolved root", () => {
      expect(() => {
        validatePathWithinRoot("C:/other/path/evil.html", "C:/work/app");
      }).toThrow(/fuera de la raíz canónica/i);

      expect(() => {
        validatePathWithinRoot("C:/work/app/../other/evil.html", "C:/work/app");
      }).toThrow(/fuera de la raíz canónica/i);

      expect(validatePathWithinRoot("C:/work/app/Task-Manager-Portable.html", "C:/work/app")).toBe(true);
    });

    it("2.8 RED: pathToFileURL output is validated against raw path string", () => {
      const rawPath = "C:/My Repos/Special & Weird # Name/Task-Manager-Portable.html";
      const launch = buildBrowserLaunchCommand(rawPath, "win32");
      expect(launch.url).not.toBe(rawPath);
      expect(launch.url).toBe(pathToFileURL(path.resolve(rawPath)).href);
      expect(launch.url.includes(" ")).toBe(false);
    });
  });
});

