import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { runTaskManagerOnboardingExperiment } from "./task-manager-onboarding";

const root = path.resolve(import.meta.dirname, "../..");
const portableHtml = path.join(root, "plugins/task-manager/Task-Manager-Portable.html");

function hashFile(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

describe("Task Manager onboarding fixture", () => {
  it("executes the immutable portable runtime without reopening its dismissed welcome modal", () => {
    const before = hashFile(portableHtml);
    const result = runTaskManagerOnboardingExperiment(portableHtml);

    expect(result).toEqual({ open: false, state: undefined });
    expect(hashFile(portableHtml)).toBe(before);
  });
});
