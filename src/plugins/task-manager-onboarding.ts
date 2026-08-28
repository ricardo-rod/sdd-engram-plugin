import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

export type OnboardingExperimentResult = { open: boolean; state?: string };

/** Runs the immutable Task Manager portable runtime as an external fixture. */
export function runTaskManagerOnboardingExperiment(portableHtml: string): OnboardingExperimentResult {
  const root = path.resolve(import.meta.dirname, "../..");
  const script = `
    import { readFileSync } from "node:fs";
    import { pathToFileURL } from "node:url";
    import path from "node:path";
    const root = ${JSON.stringify(root)};
    const portableHtml = ${JSON.stringify(portableHtml)};
    const { Window } = await import(pathToFileURL(path.join(root, "plugins/task-manager/node_modules/happy-dom/lib/index.js")).href);
    const window = new Window({ url: "https://fixture.invalid" });
    window.sessionStorage.setItem("tm-welcome-dismissed", "1");
    window.document.write(readFileSync(portableHtml, "utf8"));
    window.document.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const dialog = window.document.getElementById("welcome-dialog");
    console.log(JSON.stringify({ open: dialog?.hasAttribute("open") === true, state: dialog?.dataset.open }));
  `;
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval", script], { encoding: "utf8" })) as OnboardingExperimentResult;
}
