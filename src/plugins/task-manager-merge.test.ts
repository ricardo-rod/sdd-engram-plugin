import { describe, expect, it } from "vitest";
import { mergeTaskManagerState, replaceTaskManagerState, writeTaskManagerStateAtomically } from "./task-manager-writer";

const html = "prefix<script type=\"application/json\" id=\"tm-state\">{\"tasks\":[{\"id\":\"T1\",\"title\":\"Keep\",\"status\":\"pending\",\"note\":\"operator note\"}]}</script>suffix";

describe("Task Manager merge and state-island replacement", () => {
  it("preserves user text and IDs while updating evidence-backed statuses and retaining stale work", () => {
    const merged = mergeTaskManagerState(
      { tasks: [{ id: "T1", title: "Keep", status: "pending", note: "operator note" }, { id: "T2", title: "Stale", status: "in-progress" }] },
      { tasks: [{ id: "T1", status: "completed" }] },
    );

    expect(merged).toEqual({ tasks: [
      { id: "T1", title: "Keep", status: "completed", note: "operator note" },
      { id: "T2", title: "Stale", status: "in-progress", possiblyStale: true },
    ] });
  });

  it("replaces only the state island and escapes closing-script injection", () => {
    const updated = replaceTaskManagerState(html, { tasks: [{ id: "T3", status: "blocked", note: "</script>" }] });

    expect(updated.startsWith("prefix<script")).toBe(true);
    expect(updated.endsWith("</script>suffix")).toBe(true);
    expect(updated).toContain("\\u003c/script>");
    expect(updated).toContain('"id":"T3"');
  });

  it("keeps only allowed sync metadata while preserving operator task content", () => {
    const merged = mergeTaskManagerState(
      { signature: "opencode-task-manager", conversation: "do not persist", meta: { syncStatus: "pending", token: "secret" }, tasks: [{ id: "T1", note: "operator note" }] },
      { meta: { lastSyncAt: "2026-08-28T00:00:00Z", lastSyncSource: "sdd-verify", prompt: "unsafe" }, tasks: [{ id: "T1", status: "completed" }] },
    );

    expect(merged).toEqual({
      signature: "opencode-task-manager",
      meta: { syncStatus: "pending", lastSyncAt: "2026-08-28T00:00:00Z", lastSyncSource: "sdd-verify" },
      tasks: [{ id: "T1", note: "operator note", status: "completed" }],
    });
  });

  it("flushes a temporary file and retries its atomic rename once", () => {
    const events: string[] = [];
    let renames = 0;
    writeTaskManagerStateAtomically("C:/work/Task-Manager-Portable.html", "managed", {
      write: (file) => events.push(`write:${file}`),
      flush: (file) => events.push(`flush:${file}`),
      rename: (from, to) => {
        renames += 1;
        events.push(`rename:${from}:${to}`);
        if (renames === 1) throw new Error("locked");
      },
    });

    expect(events).toEqual([
      "write:C:/work/Task-Manager-Portable.html.tmp",
      "flush:C:/work/Task-Manager-Portable.html.tmp",
      "rename:C:/work/Task-Manager-Portable.html.tmp:C:/work/Task-Manager-Portable.html",
      "rename:C:/work/Task-Manager-Portable.html.tmp:C:/work/Task-Manager-Portable.html",
    ]);
  });
});
