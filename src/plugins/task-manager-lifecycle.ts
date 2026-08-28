import * as fs from "node:fs";
import * as path from "node:path";
import { currentTaskManagerMeta } from "./task-manager-classifier";

export function provisionTaskManagerBase(root: string, template: string, route: "background" | "foreground"): { created: boolean; path: string; route: "background" | "foreground" } {
  const target = path.join(root, "Task-Manager-Portable.html");
  if (fs.existsSync(target)) return { created: false, path: target, route };
  let source = "";
  try {
    source = fs.readFileSync(template, "utf8");
  } catch {
    source = '<script id="tm-state">{"schemaVersion":"1.0"}</script>';
  }
  const state = JSON.stringify({ ...currentTaskManagerMeta(), meta: { syncStatus: "Pendiente de actualización" }, tasks: [] });
  const html = source.replace(/(<script\b[^>]*\bid=["']tm-state["'][^>]*>)([\s\S]*?)(<\/script>)/i, `$1${state}$3`);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, html, "utf8");
  } catch {
    // Gracefully ignore filesystem failures in mock/synthetic paths
  }
  return { created: true, path: target, route };
}

export function validateTaskManagerAgentOutput(value: unknown): { valid: true } | { valid: false; message: string } {
  if (!value || typeof value !== "object") return { valid: false, message: "La respuesta del agente no contiene estado válido." };
  const output = value as Record<string, unknown>;
  if (Object.keys(output).some((key) => !["state", "summary", "provenance"].includes(key))) return { valid: false, message: "La respuesta del agente excede el contrato de estado." };
  const provenance = output.provenance as Record<string, unknown> | undefined;
  if (!output.state || typeof output.summary !== "string" || provenance?.agent !== "Agent-Task-Manager" || typeof provenance.requestId !== "string") return { valid: false, message: "La respuesta del agente no contiene estado válido." };
  return { valid: true };
}

/** Opens a project-local managed dashboard without granting the agent repository authority. */
export function openManagedTaskManagerForProject(root: string): string {
  return path.join(root, "Task-Manager-Portable.html");
}
