export type TaskManagerRoute = { mode: "background" | "foreground"; provenance: string };

export function resolveTaskManagerEnrichmentRoute(capabilities: { isolatedPrompt: boolean }): TaskManagerRoute {
  return capabilities.isolatedPrompt
    ? { mode: "background", provenance: "modo aislado background" }
    : { mode: "foreground", provenance: "modo compatible foreground" };
}

export function shouldEnqueueTaskManagerMilestone(event: string): boolean {
  return event === "sdd-tasks" || event === "sdd-verify" || event === "sdd-archive" || event === "verified-significant";
}
