import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type HelpTopic = "suite" | "task-manager" | "hub";

const KNOWN_TOPICS = new Set<HelpTopic>(["suite", "task-manager", "hub"]);

function parseHelpArgs(
  targetOrModuleUrl?: HelpTopic | string,
  maybeModuleUrl?: string,
): { topic: HelpTopic; moduleUrl: string } {
  if (typeof targetOrModuleUrl === "string" && KNOWN_TOPICS.has(targetOrModuleUrl as HelpTopic)) {
    return {
      topic: targetOrModuleUrl as HelpTopic,
      moduleUrl: maybeModuleUrl ?? import.meta.url,
    };
  }

  return {
    topic: "suite",
    moduleUrl: targetOrModuleUrl ?? import.meta.url,
  };
}

export function resolveOfflineHelpPath(
  targetOrModuleUrl?: HelpTopic | string,
  maybeModuleUrl?: string,
): string {
  const { topic, moduleUrl } = parseHelpArgs(targetOrModuleUrl, maybeModuleUrl);
  const modulePath = fileURLToPath(moduleUrl);
  const baseDir = path.dirname(modulePath);

  let candidates: string[];
  let unavailableMessage: string;

  if (topic === "task-manager") {
    candidates = [
      path.resolve(baseDir, "../../plugins/task-manager/README.md"),
      path.resolve(baseDir, "../../../plugins/task-manager/README.md"),
      path.resolve(baseDir, "../plugins/task-manager/README.md"),
    ];
    unavailableMessage = "Bundled Task Manager help is unavailable";
  } else if (topic === "hub") {
    candidates = [
      path.resolve(baseDir, "../../README.md"),
      path.resolve(baseDir, "../../../README.md"),
      path.resolve(baseDir, "../README.md"),
    ];
    unavailableMessage = "Bundled Hub help is unavailable";
  } else {
    candidates = [
      path.resolve(baseDir, "../../plugins/suite-de-agentes/README.md"),
      path.resolve(baseDir, "../../../plugins/suite-de-agentes/README.md"),
      path.resolve(baseDir, "../plugins/suite-de-agentes/README.md"),
    ];
    unavailableMessage = "Bundled Suite help is unavailable";
  }

  const helpPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!helpPath) throw new Error(unavailableMessage);
  return helpPath;
}

export function loadOfflineHelp(
  targetOrModuleUrl?: HelpTopic | string,
  maybeModuleUrl?: string,
): string {
  return fs.readFileSync(resolveOfflineHelpPath(targetOrModuleUrl, maybeModuleUrl), "utf8");
}
