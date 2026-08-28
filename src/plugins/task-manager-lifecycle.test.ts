import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { provisionTaskManagerBase, validateTaskManagerAgentOutput } from "./task-manager-lifecycle";

const temporaryRoots: string[] = [];
afterEach(() => temporaryRoots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

describe("Task Manager lifecycle filesystem harness", () => {
  it("provisions a managed base once and opens it before foreground enrichment", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "task-manager-lifecycle-"));
    temporaryRoots.push(root);
    const template = path.join(root, "template.html");
    fs.writeFileSync(template, '<script id="tm-state">{"schemaVersion":"1.0"}</script>');

    const first = provisionTaskManagerBase(root, template, "foreground");
    const second = provisionTaskManagerBase(root, template, "foreground");

    expect(first).toEqual({ created: true, path: path.join(root, "Task-Manager-Portable.html"), route: "foreground" });
    expect(second).toEqual({ created: false, path: first.path, route: "foreground" });
    expect(fs.readFileSync(first.path, "utf8")).toContain('"signature":"opencode-task-manager"');
  });

  it("accepts bounded state-only agent output and rejects prohibited output fields", () => {
    expect(validateTaskManagerAgentOutput({ state: { tasks: [{ id: "T1", status: "completed" }] }, summary: "Sincronizado", provenance: { agent: "Agent-Task-Manager", requestId: "r1" } })).toEqual({ valid: true });
    expect(validateTaskManagerAgentOutput({ state: {}, summary: "x", provenance: { agent: "Agent-Task-Manager", requestId: "r2" }, shell: "git add ." })).toEqual({ valid: false, message: "La respuesta del agente excede el contrato de estado." });
  });
});
