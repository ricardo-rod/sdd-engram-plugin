import * as fs from "node:fs";

type Task = { id: string; status?: string; [key: string]: unknown };
type State = { tasks?: Task[]; [key: string]: unknown };

const STATE_ISLAND = /(<script\b[^>]*\bid=["']tm-state["'][^>]*>)([\s\S]*?)(<\/script>)/i;
const VALID_STATUS = new Set(["pending", "in-progress", "completed", "blocked"]);
const SYNC_META_FIELDS = new Set(["signature", "templateVersion", "schemaVersion", "stateVersion", "pluginVersion", "lastSyncAt", "lastSyncSource", "syncStatus"]);

function mergeSyncMetadata(prior: State, evidence: State): Record<string, unknown> | undefined {
  const sources = [prior.meta, evidence.meta].filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object");
  const metadata = Object.fromEntries(sources.flatMap((source) => Object.entries(source).filter(([key]) => SYNC_META_FIELDS.has(key))));
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function mergeTaskManagerState(prior: State, evidence: State): State {
  const updates = new Map((evidence.tasks ?? []).map((task) => [task.id, task]));
  const existing = (prior.tasks ?? []).map((task) => {
    const update = updates.get(task.id);
    if (!update) return { ...task, possiblyStale: true };
    updates.delete(task.id);
    const { possiblyStale: _, ...preservedTask } = task;
    return { ...preservedTask, ...Object.fromEntries(Object.entries(update).filter(([key]) => key === "status")) };
  });
  const { meta: _priorMeta, conversation: _conversation, ...preservedPrior } = prior;
  const metadata = mergeSyncMetadata(prior, evidence);
  return { ...preservedPrior, ...(metadata ? { meta: metadata } : {}), tasks: [...existing, ...updates.values()] };
}

function validateState(state: State): void {
  for (const task of state.tasks ?? []) {
    if (!task.id || (task.status !== undefined && !VALID_STATUS.has(task.status))) throw new Error("Task Manager state contains an invalid task status.");
  }
}

export function replaceTaskManagerState(html: string, state: State): string {
  validateState(state);
  const json = JSON.stringify(state).replaceAll("</script>", "\\u003c/script>");
  if (!STATE_ISLAND.test(html)) throw new Error("Managed Task Manager state island is missing.");
  return html.replace(STATE_ISLAND, `$1${json}$3`);
}

export type AtomicFilePort = {
  write(file: string, content: string): void;
  flush(file: string): void;
  rename(from: string, to: string): void;
};

const nodeAtomicFilePort: AtomicFilePort = {
  write: (file, content) => fs.writeFileSync(file, content, "utf8"),
  flush: (file) => {
    const descriptor = fs.openSync(file, "r");
    try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  },
  rename: fs.renameSync,
};

export function writeTaskManagerStateAtomically(file: string, html: string, port: AtomicFilePort = nodeAtomicFilePort): void {
  const temporary = `${file}.tmp`;
  port.write(temporary, html);
  port.flush(temporary);
  try {
    port.rename(temporary, file);
  } catch (error) {
    try { port.rename(temporary, file); } catch { throw error; }
  }
}
