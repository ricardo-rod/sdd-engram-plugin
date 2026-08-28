import * as fs from "node:fs";
import * as path from "node:path";

export function requiredPluginAssets(packageRoot: string): string[] {
  return [
    path.join(packageRoot, "plugins/task-manager/Task-Manager-Portable.html"),
    path.join(packageRoot, "plugins/suite-de-agentes/README.md"),
  ];
}

export function verifyPluginAssets(packageRoot = process.cwd()): void {
  const missing = requiredPluginAssets(packageRoot).filter((asset) => !fs.existsSync(asset));
  if (missing.length > 0) throw new Error(`Missing plugin assets:\n${missing.join("\n")}`);
}

if (process.argv[1]?.endsWith("verify-assets.ts")) verifyPluginAssets();
