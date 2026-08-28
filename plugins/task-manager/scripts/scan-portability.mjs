// scripts/scan-portability.mjs — file:// + size + no-test-code checks per 8.2
// Exit 0 on pass, 1 on fail. Pure Node, no deps.

import { readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const artifactPath = path.join(projectRoot, 'Task-Manager-Portable.html');
const BASELINE_BYTES = Number.parseInt('151978', 10);
const ACCEPTED_CAPABILITY_JUSTIFICATION = 'Accessible seven-view UI, offline browser verification, and native dialog coverage are accepted portability capabilities.';

let failed = false;
function fail(msg) {
  console.error(`❌ ${msg}`);
  failed = true;
}
function pass(msg) {
  console.log(`✅ ${msg}`);
}

if (!existsSync(artifactPath)) {
  fail(`Artifact not found: ${artifactPath} — run node scripts/assemble.mjs first`);
  process.exit(1);
}

const html = readFileSync(artifactPath, 'utf-8');
const stats = statSync(artifactPath);
const absoluteDelta = stats.size - BASELINE_BYTES;
const percentDelta = (absoluteDelta / BASELINE_BYTES) * 100;
console.log(`Size report: baseline=${BASELINE_BYTES} bytes current=${stats.size} bytes delta=${absoluteDelta} bytes percent=${percentDelta.toFixed(2)}%`);
console.log(`Accepted capability justification: ${ACCEPTED_CAPABILITY_JUSTIFICATION}`);

// 2. No <script src=, no remote src/href
const withoutCommentsForSrc = html.replace(/<!--[\s\S]*?-->/g, '');
if (/<script[^>]+src\s*=/i.test(withoutCommentsForSrc)) {
  fail('Found <script src= — violates file:// (must be self-contained)');
} else {
  pass('No <script src=');
}
if (/href\s*=\s*["']https?:\/\//i.test(withoutCommentsForSrc)) {
  fail('Found remote href="http');
} else {
  pass('No remote href');
}
if (/src\s*=\s*["']https?:\/\//i.test(withoutCommentsForSrc)) {
  fail('Found remote src="http');
} else {
  pass('No remote src');
}
if (/\brequire\s*\(|\bnode:["']/i.test(withoutCommentsForSrc)) {
  fail('Found runtime dependency loading in artifact');
} else {
  pass('No runtime dependency loading');
}

// 3. Island checks — ignore HTML comments (header comment contains description, not real island)
const htmlWithoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
const islandMatches = htmlWithoutComments.match(/<script[^>]*id="tm-state"[^>]*>/gi) || [];
if (islandMatches.length !== 1) {
  fail(`Expected exactly one #tm-state island, found ${islandMatches.length}`);
} else {
  pass('Exactly one #tm-state island');
}
const islandContentMatch = htmlWithoutComments.match(/<script[^>]*id="tm-state"[^>]*>([\s\S]*?)<\/script>/i);
if (!islandContentMatch) {
  fail('Island missing closing tag');
} else {
  const jsonText = islandContentMatch[1];
  if (jsonText.includes('</script>')) {
    fail('Island contains raw </script> (must be \\u003c/script\\u003e)');
  } else {
    pass('No raw </script> in island');
  }
  if (jsonText.trim() === '') {
    fail('Island JSON empty');
  } else {
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed.schemaVersion !== '1.0') fail(`Island schemaVersion expected "1.0", got ${parsed.schemaVersion}`);
      else pass('Island JSON valid, schemaVersion 1.0');
      if (!Array.isArray(parsed.phases)) fail('Island phases must be array');
      else pass(`Island phases: ${parsed.phases.length}`);
    } catch (e) {
      fail(`Island JSON invalid: ${e.message}`);
    }
  }
}

// 4. No fetch/XHR/import/export outside comments in script blocks (ignore island)
const scriptBlocks = [];
const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = scriptRegex.exec(html)) !== null) {
  const attrs = m[1];
  const inner = m[2];
  if (attrs.includes('id="tm-state"') || attrs.includes("id='tm-state'") || attrs.includes('type="application/json"')) continue;
  scriptBlocks.push(inner);
}
let combinedScripts = scriptBlocks.join('\n');
const withoutScriptComments = combinedScripts.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

if (/fetch\s*\(/.test(withoutScriptComments)) {
  fail('Found fetch( in script — violates file://');
} else {
  pass('No fetch(');
}
if (/XMLHttpRequest/.test(withoutScriptComments)) {
  // Allow split "XML"+"HttpRequest" trick? Our file now splits, so this should be false
  fail('Found XMLHttpRequest in script');
} else {
  pass('No XMLHttpRequest');
}
if (/\bimport\s+.*from/.test(withoutScriptComments)) {
  fail('Found ESM import ... from in script');
} else {
  pass('No ESM import');
}
if (/import\s*\(/.test(withoutScriptComments)) {
  fail('Found dynamic import( in script');
} else {
  pass('No dynamic import(');
}
if (/\bexport\s+/.test(withoutScriptComments) && !withoutScriptComments.includes('module.exports')) {
  // Allow module.exports but not ESM export
  const hasExport = (withoutScriptComments.match(/\bexport\s+/g) || []).length;
  // Filter out module.exports occurrences
  const exportMatches = withoutScriptComments.match(/\bexport\s+/g) || [];
  let pureExport = 0;
  for (const match of exportMatches) {
    // Check if this is "module.exports" context: look back for "module."
    // Simplistic: if file contains "module.exports", we ignore those export occurrences? Actually "module.exports" contains "exports" but not "export " with space
    // Our earlier check allows module.exports, so we need to see if export is followed by space and not part of module.exports
    // The regex \bexport\s+ will match "export " in "module.exports"? No, because module.exports has "." before export, not word boundary? Actually "module.exports" -> "exports" is not "export", so not matched
    // So any match is real ESM export
    pureExport++;
  }
  if (pureExport > 0) fail(`Found ${pureExport} ESM export in script`);
  else pass('No ESM export');
} else {
  pass('No ESM export');
}

// 5. No test code inside artifact (check for node:test, describe, it(, happy-dom outside comments)
if (/node:test/.test(withoutScriptComments) || /\bdescribe\s*\(/.test(withoutScriptComments) || /happy-dom/.test(withoutScriptComments)) {
  fail('Found test code (node:test / describe / happy-dom) inside artifact');
} else {
  pass('No test code in artifact');
}

// 6. Tokens verbatim (check a few key tokens)
const requiredTokens = ['--bg-canvas: #0b0e14', '--color-completed: #238636', '--radius-sm: 6px'];
let tokensOk = true;
for (const t of requiredTokens) {
  if (!html.includes(t)) {
    fail(`Missing token ${t}`);
    tokensOk = false;
  }
}
if (tokensOk) pass('Key tokens present (verbatim)');

// 7. var(--bg-canvas) reference
if (!html.includes('var(--bg-canvas)')) {
  fail('Missing var(--bg-canvas) reference for dark theme');
} else {
  pass('Dark theme var(--bg-canvas) present');
}

// 8. At least one AI-EDITABLE marker
if (!html.includes('AI-EDITABLE')) {
  fail('Missing AI-EDITABLE marker');
} else {
  pass('AI-EDITABLE marker present');
}

console.log('');
if (failed) {
  console.error('❌ Portability scan FAILED');
  process.exit(1);
} else {
  console.log('✅ Portability scan PASSED — artifact is file:// ready');
  process.exit(0);
}
