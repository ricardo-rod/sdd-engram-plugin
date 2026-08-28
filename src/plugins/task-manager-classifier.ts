export type TaskManagerHtmlClass = "missing" | "current" | "old" | "unrecognized";

const SIGNATURE = "opencode-task-manager";
const TEMPLATE_VERSION = "1.1.0";
const SCHEMA_VERSION = "1.0";
const STATE_VERSION = 1;
const PLUGIN_VERSION = "1.7.0";

export function currentTaskManagerMeta() {
  return { signature: SIGNATURE, pluginVersion: PLUGIN_VERSION, templateVersion: TEMPLATE_VERSION, schemaVersion: SCHEMA_VERSION, stateVersion: STATE_VERSION };
}

export function classifyTaskManagerHtml(html: string | undefined): TaskManagerHtmlClass {
  if (html === undefined) return "missing";
  const island = html.match(/<script\b[^>]*\bid=["']tm-state["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!island) return "unrecognized";
  try {
    const state = JSON.parse(island) as Partial<ReturnType<typeof currentTaskManagerMeta>>;
    if (state.signature !== SIGNATURE || state.schemaVersion !== SCHEMA_VERSION || state.stateVersion !== STATE_VERSION || typeof state.pluginVersion !== "string") return "unrecognized";
    return state.templateVersion === TEMPLATE_VERSION && state.pluginVersion === PLUGIN_VERSION ? "current" : "old";
  } catch {
    return "unrecognized";
  }
}
