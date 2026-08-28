import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
for (const plugin of ["suite-de-agentes", "task-manager"]) {
  fs.cpSync(path.join(root, "plugins", plugin), path.join(root, "dist", "plugins", plugin), { recursive: true });
}
