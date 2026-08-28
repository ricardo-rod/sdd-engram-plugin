import { describe, expect, it } from "vitest";
import { resolveTaskManagerEnrichmentRoute, shouldEnqueueTaskManagerMilestone } from "./task-manager-routing";

describe("Task Manager background routing and milestones", () => {
  it("uses isolated background work when the host exposes it", () => {
    expect(resolveTaskManagerEnrichmentRoute({ isolatedPrompt: true })).toEqual({ mode: "background", provenance: "modo aislado background" });
    expect(shouldEnqueueTaskManagerMilestone("sdd-verify")).toBe(true);
    expect(shouldEnqueueTaskManagerMilestone("chat-message")).toBe(false);
  });

  it("keeps the foreground compatibility fallback visible and only accepts SDD milestones", () => {
    expect(resolveTaskManagerEnrichmentRoute({ isolatedPrompt: false })).toEqual({ mode: "foreground", provenance: "modo compatible foreground" });
    expect(["sdd-tasks", "sdd-verify", "sdd-archive"].every(shouldEnqueueTaskManagerMilestone)).toBe(true);
    expect(shouldEnqueueTaskManagerMilestone("significant")).toBe(false);
  });

  it("queues the bounded post-verification sync for significant non-SDD work", () => {
    expect(shouldEnqueueTaskManagerMilestone("verified-significant")).toBe(true);
    expect(shouldEnqueueTaskManagerMilestone("file-change")).toBe(false);
  });
});
