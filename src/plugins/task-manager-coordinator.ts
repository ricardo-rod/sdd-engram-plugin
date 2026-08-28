import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { TaskManagerHtmlClass } from "./task-manager-classifier";
import type { TaskManagerProjectIdentity } from "./task-manager-root";

export type TaskManagerBrowserResult = {
  opened: boolean;
  method: "host" | "process" | "none";
  path: string;
  error?: string;
  fallback?: TaskManagerFallbackPayload;
};

export type TaskManagerFallbackPayload = {
  title: string;
  absolutePath: string;
  manualInstructions: string;
};

export type TaskManagerRequest = {
  project: TaskManagerProjectIdentity;
  reason: "sdd" | "significant" | "manual";
  evidence: { project: string; milestone: string; facts: readonly string[]; priorState: unknown };
};

export type LaunchTaskManagerBrowserOptions = {
  filePath: string;
  canonicalRoot: string;
  platform?: NodeJS.Platform;
  isHeadless?: boolean;
  spawn?: typeof child_process.spawn;
};

export function validatePathWithinRoot(targetPath: string, canonicalRoot: string): boolean {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedRoot = path.resolve(canonicalRoot);

  const relative = path.relative(normalizedRoot, normalizedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Ruta fuera de la raíz canónica autorizada: ${targetPath}`);
  }
  return true;
}

export function buildBrowserLaunchCommand(filePath: string, platform: NodeJS.Platform = process.platform): { command: string; args: string[]; url: string } {
  const absolutePath = path.resolve(filePath);
  const fileUrl = pathToFileURL(absolutePath).href;

  if (platform === "win32") {
    return {
      command: "cmd",
      args: ["/c", "start", "", fileUrl],
      url: fileUrl,
    };
  }

  if (platform === "darwin") {
    return {
      command: "open",
      args: [fileUrl],
      url: fileUrl,
    };
  }

  return {
    command: "xdg-open",
    args: [fileUrl],
    url: fileUrl,
  };
}

export function formatHeadlessFallbackPayload(filePath: string, reason?: string): TaskManagerFallbackPayload {
  const absolutePath = path.resolve(filePath);
  const instructions = reason
    ? `No se pudo abrir el navegador automáticamente (${reason}).\n\nPuedes abrir el Task Manager manualmente en tu navegador copiando la siguiente ruta:\n${absolutePath}`
    : `Entorno sin navegador interactivo detectado (modo headless o terminal remota).\n\nPuedes abrir el Task Manager manualmente en tu navegador local copiando la siguiente ruta:\n${absolutePath}`;

  return {
    title: reason ? "Task Manager (Apertura Manual)" : "Task Manager (Modo sin interfaz gráfica / Headless)",
    absolutePath,
    manualInstructions: instructions,
  };
}

export async function launchTaskManagerBrowser(options: LaunchTaskManagerBrowserOptions): Promise<TaskManagerBrowserResult> {
  const {
    filePath,
    canonicalRoot,
    platform = process.platform,
    isHeadless = Boolean(process.env.CI || process.env.SSH_CONNECTION || (platform === "linux" && !process.env.DISPLAY)),
    spawn = child_process.spawn,
  } = options;

  validatePathWithinRoot(filePath, canonicalRoot);

  if (isHeadless) {
    const fallback = formatHeadlessFallbackPayload(filePath);
    return {
      opened: false,
      method: "none",
      path: filePath,
      error: fallback.manualInstructions,
      fallback,
    };
  }

  const launchCmd = buildBrowserLaunchCommand(filePath, platform);

  return new Promise((resolve) => {
    try {
      const child = spawn(launchCmd.command, launchCmd.args, {
        shell: false,
        detached: true,
        stdio: "ignore",
      });

      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      const handleFailure = (reason: string) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        const fallback = formatHeadlessFallbackPayload(filePath, reason);
        resolve({
          opened: false,
          method: "none",
          path: filePath,
          error: reason,
          fallback,
        });
      };

      const handleSuccess = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve({
          opened: true,
          method: "process",
          path: filePath,
        });
      };

      if (typeof child.on === "function") {
        child.on("error", (err: Error) => {
          handleFailure(err.message);
        });

        child.on("close", (code: number | null) => {
          if (code !== null && code !== 0) {
            handleFailure(`proceso finalizó con código de salida ${code}`);
          }
        });

        child.on("exit", (code: number | null) => {
          if (code !== null && code !== 0) {
            handleFailure(`proceso finalizó con código de salida ${code}`);
          }
        });
      }

      if (typeof child.unref === "function") {
        child.unref();
      }

      timer = setTimeout(() => {
        handleSuccess();
      }, 20);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const fallback = formatHeadlessFallbackPayload(filePath, message);
      resolve({
        opened: false,
        method: "none",
        path: filePath,
        error: message,
        fallback,
      });
    }
  });
}

export function openTaskManagerResult(file: string, browserCapability: boolean | "process"): TaskManagerBrowserResult {
  return browserCapability === true
    ? { opened: true, method: "host", path: file }
    : browserCapability === "process"
      ? { opened: true, method: "process", path: file }
    : { opened: false, method: "none", path: file, error: "No se pudo abrir el navegador. Abre esta ruta manualmente." };
}

export function deleteManagedTaskManagerFile(input: { confirmed: boolean; classification: TaskManagerHtmlClass; path: string; unlink?: (file: string) => void }): { deleted: boolean; message: string } {
  if (!input.confirmed) return { deleted: false, message: "Confirma la ruta y la pérdida de datos antes de eliminar." };
  if (input.classification !== "current" && input.classification !== "old") return { deleted: false, message: "El archivo no es un Task Manager gestionado." };
  if (!input.path.endsWith("/Task-Manager-Portable.html") && !input.path.endsWith("\\Task-Manager-Portable.html")) return { deleted: false, message: "La ruta no corresponde al archivo Task Manager gestionado." };
  (input.unlink ?? fs.unlinkSync)(input.path);
  return { deleted: true, message: "Se eliminó únicamente el archivo Task Manager gestionado." };
}

export function createTaskManagerCoordinator(run: (request: TaskManagerRequest) => Promise<TaskManagerBrowserResult>) {
  const active = new Map<string, Promise<TaskManagerBrowserResult>>();
  const pending = new Map<string, TaskManagerRequest>();
  const statuses = new Map<string, "ready" | "updating" | "requires-update">();

  const execute = async (request: TaskManagerRequest): Promise<TaskManagerBrowserResult> => {
    statuses.set(request.project.key, "updating");
    try {
      let failure: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const result = await run(request);
          statuses.set(request.project.key, "ready");
          return result;
        } catch (error) { failure = error; }
      }
      const message = failure instanceof Error ? failure.message : String(failure);
      statuses.set(request.project.key, "requires-update");
      return { opened: false, method: "none", path: request.project.root, error: `Requiere actualización manual: ${message}` };
    } finally {
      active.delete(request.project.key);
      const next = pending.get(request.project.key);
      pending.delete(request.project.key);
      if (next) void enqueue(next);
    }
  };

  const enqueue = async (request: TaskManagerRequest): Promise<TaskManagerBrowserResult> => {
    const running = active.get(request.project.key);
    if (running) {
      pending.set(request.project.key, request);
      return running;
    }
    const work = execute(request);
    active.set(request.project.key, work);
    return work;
  };

  return { enqueue, status: (key: string) => statuses.get(key) ?? "ready" };
}

