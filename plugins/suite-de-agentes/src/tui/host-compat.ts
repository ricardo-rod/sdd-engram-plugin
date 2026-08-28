let rendererMissingReported = false;
const failures = new Set<string>();
export function safeSlotRender<T>(label: string, render: () => T): T | null {
  try { return render(); } catch (error) {
    const text = error instanceof Error ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}` : String(error);
    if (text.includes("No renderer found")) {
      if (!rendererMissingReported) {
        rendererMissingReported = true;
        console.error(`Suite de Agentes: custom renderer unavailable for slot '${label}'; using host fallback.`, error);
      }
      return null;
    }
    if (!failures.has(label)) { failures.add(label); console.error(`Suite de Agentes: slot '${label}' disabled; OpenCode will continue.`, error); }
    return null;
  }
}
export function safeHostAction<T>(label: string, action: () => T, fallback: T): T { try { return action(); } catch (error) { console.error(`Suite de Agentes: ${label} failed; OpenCode will continue.`, error); return fallback; } }
export function resetHostCompatStateForTests(): void { rendererMissingReported = false; failures.clear(); }
