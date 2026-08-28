// Cross-platform Node test discovery without shell glob expansion.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsRoot = path.join(projectRoot, 'tests');

function discoverTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return discoverTests(absolutePath);
    return entry.name.endsWith('.test.mjs') ? [absolutePath] : [];
  });
}

const testFiles = discoverTests(testsRoot).sort();

if (testFiles.length === 0) {
  console.error('No *.test.mjs files were found under tests/.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: projectRoot,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
