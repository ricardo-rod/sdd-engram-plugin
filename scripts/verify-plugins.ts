import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
for (const plugin of ["suite-de-agentes", "task-manager"]) {
  const provenancePath = path.join(root, "plugins", plugin, "PROVENANCE.json");
  if (!fs.existsSync(provenancePath)) throw new Error(`Missing provenance: ${provenancePath}`);
  JSON.parse(fs.readFileSync(provenancePath, "utf8"));
}
execSync("npm run typecheck", { cwd: root, stdio: "inherit" });
execSync("npm test -- src/plugins/registry.test.ts src/plugins/badge-migration.test.ts scripts/verify-assets.test.ts src/plugins/task-manager-onboarding.test.ts src/plugins/suite-adapter.test.ts src/plugins/offline-help.test.ts src/plugins/agent-authoring.test.ts src/plugins/task-manager-root.test.ts src/plugins/task-manager-routing.test.ts src/plugins/task-manager-classifier.test.ts src/plugins/task-manager-merge.test.ts src/plugins/task-manager-coordinator.test.ts src/plugins/task-manager-preferences.test.ts src/plugins/task-manager-lifecycle.test.ts", { cwd: root, stdio: "inherit" });
execSync("npm run build", { cwd: root, stdio: "inherit" });
execSync(`node "${path.join(root, "scripts", "smoke-plugins.ts")}"`, { cwd: root, stdio: "inherit" });
const taskManagerRunner = path.join(root, "plugins", "task-manager", "scripts", "run-tests.mjs");
if (fs.existsSync(taskManagerRunner)) execSync(`node "${taskManagerRunner}"`, { cwd: path.dirname(taskManagerRunner), stdio: "inherit" });
const requiredAssets = [
  path.join(root, "dist", "plugins/task-manager/Task-Manager-Portable.html"),
  path.join(root, "dist", "plugins/suite-de-agentes/README.md"),
];
const missingAssets = requiredAssets.filter((asset) => !fs.existsSync(asset));
if (missingAssets.length > 0) throw new Error(`Missing packaged assets:\n${missingAssets.join("\n")}`);
