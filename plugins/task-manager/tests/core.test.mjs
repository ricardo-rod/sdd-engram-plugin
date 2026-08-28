// @ts-nocheck
// tests/core.test.mjs — Core parse/validate/derive/escape (PR2, Strict TDD RED→GREEN)
// English comments. Tests TMCore via classic script eval (no ESM import).

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { createState, escapeIslandJson, createDom, readSkeleton } from './helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const corePath = path.join(projectRoot, 'modules', '02-core.js');

let TMCore;

// Load classic script content and evaluate in a sandbox that mimics window
function loadCore() {
  const js = readFileSync(corePath, 'utf-8');
  // Evaluate in globalThis context to populate globalThis.TMCore
  // Use Function to avoid strict mode issues
  const g = globalThis;
  // Clear previous
  delete g.TMCore;
  // Create a window-like global for the script
  const win = { TMCore: undefined };
  // The script attaches to window/globalThis/global — we simulate by evaluating with globalThis as window
  // Provide window variable in eval scope
  const windowVar = g;
  // Use eval with wrapper to set window reference
  // Replace (typeof window !== 'undefined' ? window : ...) check by providing window
  // Simplest: just eval in globalThis after setting global.window
  const prevWindow = g.window;
  g.window = g;
  try {
    // eslint-disable-next-line no-eval
    eval(js);
    TMCore = g.TMCore;
  } finally {
    if (prevWindow === undefined) delete g.window;
    else g.window = prevWindow;
  }
  if (!TMCore) throw new Error('TMCore not loaded from ' + corePath);
  return TMCore;
}

describe('core — file existence and portability', () => {
  it('modules/02-core.js exists and contains no forbidden APIs', () => {
    const js = readFileSync(corePath, 'utf-8');
    const withoutComments = js.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/fetch\s*\(/.test(withoutComments), false, 'must not contain fetch(');
    assert.equal(/XMLHttpRequest/.test(withoutComments), false, 'must not contain XMLHttpRequest');
    assert.equal(/\bimport\s+.*from/.test(withoutComments), false, 'must not contain ESM import');
    assert.equal(/\bexport\s+/.test(withoutComments) && !withoutComments.includes('module.exports'), false, 'must not contain export (except module.exports)');
    assert.equal(/import\s*\(/.test(withoutComments), false, 'must not contain dynamic import()');
    assert.equal(/<script[^>]+src=/i.test(withoutComments), false, 'must not have script src');
  });

  it('loads TMCore global via classic eval', () => {
    const core = loadCore();
    assert.equal(typeof core.parseIsland, 'function');
    assert.equal(typeof core.validateState, 'function');
    assert.equal(typeof core.deriveMetrics, 'function');
    assert.equal(typeof core.escapeHtml, 'function');
    assert.equal(typeof core.escapeIslandJson, 'function');
    assert.equal(typeof core.isEnabled, 'function');
  });
});

describe('core — island-by-id discovery and parse', () => {
  before(() => { loadCore(); });

  it('discovers island by id tm-state in skeleton', () => {
    const html = readSkeleton();
    const { document } = createDom(html);
    const island = document.getElementById('tm-state');
    assert.notEqual(island, null, 'island #tm-state must exist');
    assert.equal(island.getAttribute('type'), 'application/json');
    const parsed = TMCore.parseIsland(island.textContent);
    assert.equal(parsed.schemaVersion, '1.0');
  });

  it('truncated JSON → parse throws (banner path, never white-screen)', () => {
    const truncated = '{"schemaVersion":"1.0","meta":';
    assert.throws(() => TMCore.parseIsland(truncated), SyntaxError);
    // validate should also handle truncated via parse error — getStateFromDocument would produce error
    const { document } = createDom(readSkeleton(), truncated);
    const result = TMCore.getStateFromDocument(document);
    assert.equal(result.error !== undefined, true);
    assert.equal(result.validation.ok, false);
  });

  it('schemaVersion "0.0" rejected', () => {
    const state = createState({ schemaVersion: '0.0' });
    // Bypass createState merge which may not override schemaVersion correctly? Force manually
    state.schemaVersion = '0.0';
    const v = TMCore.validateState(state);
    assert.equal(v.ok, false, 'should be not ok for wrong schemaVersion');
    assert.equal(v.errors.some(e => e.includes('schemaVersion')), true);
  });

  it('missing tasks array warned (not fatal) and derive handles gracefully', () => {
    const state = createState({
      phases: [{ id: 'p1', number: 1, title: 'Fase', status: 'pending', target: '', lead: '', tasks: undefined }],
    });
    // Force tasks undefined
    state.phases[0].tasks = undefined;
    const v = TMCore.validateState(state);
    // Should be warning, not error, so ok true if only warning
    // Actually tasks must be array => warning, but ok may still be true if only warnings
    // Our implementation pushes warning, not error, so ok should remain true
    assert.equal(v.warnings.some(w => w.includes('tasks must be array')), true);
    // derive should not throw and treat missing as empty
    const metrics = TMCore.deriveMetrics(state);
    assert.equal(metrics.total, 0);
    assert.equal(metrics.overallPct, 0);
    assert.equal(isNaN(metrics.overallPct), false);
  });

  it('unknown status → pending (no crash, distribution)', () => {
    const state = createState({
      phases: [{
        id: 'p1', number: 1, title: 'Fase', status: 'pending', target: '', lead: '',
        tasks: [
          { id: 'T1-01', title: 'Known', status: 'completed', tag: '', note: '', owner: '', commit: '' },
          { id: 'T1-02', title: 'Weird', status: 'weird-status', tag: '', note: '', owner: '', commit: '' },
          { id: 'T1-03', title: 'Another weird', status: 'unknown', tag: '', note: '', owner: '', commit: '' },
        ]
      }]
    });
    const v = TMCore.validateState(state);
    // Should have warnings about unknown status, but still ok
    assert.equal(v.warnings.some(w => w.includes('unknown status')), true);
    const m = TMCore.deriveMetrics(state);
    // 1 completed, 2 pending (unknown mapped)
    assert.equal(m.total, 3);
    assert.equal(m.completed, 1);
    assert.equal(m.distribution.pending, 2);
    assert.equal(m.distribution.completed, 1);
  });

  it('\\u003c/script\\u003e round-trip: hostile note survives', () => {
    const hostileNote = 'Note with </script> tag and <b>html</b>';
    const state = createState({
      phases: [{
        id: 'p1', number: 1, title: 'Fase', status: 'pending', target: '', lead: '',
        tasks: [{ id: 'T1-01', title: 'Tarea', status: 'pending', tag: '', note: hostileNote, owner: '', commit: '' }]
      }]
    });
    const escaped = TMCore.escapeIslandJson(state);
    assert.equal(escaped.includes('</script>'), false, 'escaped must not contain raw </script>');
    assert.equal(escaped.includes('\\u003c/script\\u003e') || escaped.includes('\\u003c'), true, 'must contain escaped form');
    // Simulate island textContent = escaped, then parseIsland
    const parsed = TMCore.parseIsland(escaped);
    assert.equal(parsed.phases[0].tasks[0].note, hostileNote, 'round-trip must preserve original note');
    // Also test via helper escapeIslandJson
    const helperEscaped = escapeIslandJson(state);
    assert.equal(helperEscaped.includes('</script>'), false);
    const parsed2 = JSON.parse(helperEscaped);
    assert.equal(parsed2.phases[0].tasks[0].note, hostileNote);
  });

  it('outside-island text ignored (extra fields allowed)', () => {
    const state = createState({});
    state.extraTopLevel = 'ignore me';
    state.phases = [{ id: 'p1', number: 1, title: 'Fase', status: 'pending', target: '', lead: '', tasks: [{ id: 'T1-01', title: 'T', status: 'pending', tag: '', note: '', owner: '', commit: '', extraField: 'extra' }] }];
    state.phases[0].extraPhaseField = 'extra';
    const v = TMCore.validateState(state);
    assert.equal(v.ok, true, 'extra fields should not cause error');
    const m = TMCore.deriveMetrics(state);
    assert.equal(m.total, 1);
  });

  it('isEnabled checks meta.features correctly', () => {
    const stateOn = createState({ meta: { features: { git: true, tree: false } } });
    assert.equal(TMCore.isEnabled('git', stateOn), true);
    assert.equal(TMCore.isEnabled('tree', stateOn), false);
    assert.equal(TMCore.isEnabled('codegraph', stateOn), false);
    const stateMissing = createState();
    delete stateMissing.meta.features;
    assert.equal(TMCore.isEnabled('git', stateMissing), false);
  });

  it('escapeHtml escapes all critical chars', () => {
    assert.equal(TMCore.escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
    assert.equal(TMCore.escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.equal(TMCore.escapeHtml(null), '');
  });
});

describe('core — deriveMetrics calculations', () => {
  before(() => { loadCore(); });

  it('10/4 → 40% (4 completed of 10 total)', () => {
    // Build 10 tasks, 4 completed
    const tasks = [];
    for (let i = 0; i < 4; i++) tasks.push({ id: 'T' + i, title: 'T', status: 'completed', tag: '', note: '', owner: '', commit: '' });
    for (let i = 4; i < 10; i++) tasks.push({ id: 'T' + i, title: 'T', status: 'pending', tag: '', note: '', owner: '', commit: '' });
    const state = createState({ phases: [{ id: 'p1', number: 1, title: 'Fase', status: 'pending', target: '', lead: '', tasks }] });
    const m = TMCore.deriveMetrics(state);
    assert.equal(m.total, 10);
    assert.equal(m.completed, 4);
    assert.equal(m.overallPct, 40);
  });

  it('1/3 → 33% rounded', () => {
    const tasks = [
      { id: 'T1', title: 'T', status: 'completed', tag: '', note: '', owner: '', commit: '' },
      { id: 'T2', title: 'T', status: 'pending', tag: '', note: '', owner: '', commit: '' },
      { id: 'T3', title: 'T', status: 'pending', tag: '', note: '', owner: '', commit: '' },
    ];
    const state = createState({ phases: [{ id: 'p1', number: 1, title: 'Fase', status: 'pending', target: '', lead: '', tasks }] });
    const m = TMCore.deriveMetrics(state);
    assert.equal(m.overallPct, 33, '1/3 should be 33% rounded');
    assert.equal(m.perPhase[0].pct, 33);
  });

  it('none → 0% no NaN (empty phases and 0 tasks)', () => {
    const stateEmptyPhases = createState({ phases: [] });
    const m1 = TMCore.deriveMetrics(stateEmptyPhases);
    assert.equal(m1.overallPct, 0);
    assert.equal(m1.total, 0);
    assert.equal(isNaN(m1.overallPct), false);

    const stateEmptyTasks = createState({ phases: [{ id: 'p1', number: 1, title: 'Fase', status: 'pending', target: '', lead: '', tasks: [] }] });
    const m2 = TMCore.deriveMetrics(stateEmptyTasks);
    assert.equal(m2.overallPct, 0);
    assert.equal(m2.perPhase[0].pct, 0);
    assert.equal(isNaN(m2.perPhase[0].pct), false);
  });

  it('status counts distribution correct', () => {
    const state = createState({
      phases: [
        {
          id: 'p1', number: 1, title: 'Fase1', status: 'completed', target: '', lead: '',
          tasks: [
            { id: 'T1', title: '', status: 'completed', tag: '', note: '', owner: '', commit: '' },
            { id: 'T2', title: '', status: 'in-progress', tag: '', note: '', owner: '', commit: '' },
            { id: 'T3', title: '', status: 'blocked', tag: '', note: '', owner: '', commit: '' },
          ]
        },
        {
          id: 'p2', number: 2, title: 'Fase2', status: 'pending', target: '', lead: '',
          tasks: [
            { id: 'T4', title: '', status: 'pending', tag: '', note: '', owner: '', commit: '' },
            { id: 'T5', title: '', status: 'pending', tag: '', note: '', owner: '', commit: '' },
          ]
        }
      ]
    });
    const m = TMCore.deriveMetrics(state);
    assert.equal(m.total, 5);
    assert.equal(m.completed, 1);
    assert.equal(m.distribution.completed, 1);
    assert.equal(m.distribution.inprogress, 1);
    assert.equal(m.distribution.pending, 2);
    assert.equal(m.distribution.blocked, 1);
    // perPhase
    assert.equal(m.perPhase[0].pct, 33, '1/3 completed in phase 1 => 33%');
    assert.equal(m.perPhase[1].pct, 0, '0/2 in phase2 => 0%');
  });

  it('perPhase and global never white-screen on malformed state', () => {
    const badState = { schemaVersion: '1.0', meta: {}, phases: null };
    const v = TMCore.validateState(badState);
    assert.equal(v.ok, false);
    // derive should still handle null phases gracefully (return 0, not throw)
    const m = TMCore.deriveMetrics(badState);
    assert.equal(m.overallPct, 0);
    assert.equal(isNaN(m.overallPct), false);
  });
});

describe('core — getStateFromDocument banner path (never white-screen)', () => {
  before(() => { loadCore(); });

  it('valid island → returns state, no error', () => {
    const html = readSkeleton();
    const { document } = createDom(html);
    const result = TMCore.getStateFromDocument(document);
    assert.equal(result.error, undefined, 'should have no error');
    assert.equal(result.state.schemaVersion, '1.0');
    assert.equal(result.validation.ok, true);
  });

  it('invalid JSON → error, never throws', () => {
    const badJson = '{"schemaVersion": "1.0", "meta": {';
    const { document } = createDom(readSkeleton(), badJson);
    const result = TMCore.getStateFromDocument(document);
    assert.notEqual(result.error, undefined);
    assert.equal(result.validation.ok, false);
  });

  it('raw </script> inside island → error (must be escaped)', () => {
    const state = createState({});
    const rawJson = JSON.stringify(state); // not escaped, contains no </script> yet, but we inject a task with raw
    const hostile = rawJson.replace('Drop-In Task Manager', 'X </script> Y');
    // This hostile raw contains </script> if we manually inject
    const { document } = createDom(readSkeleton(), hostile);
    // Our document was built via textContent assignment, not via HTML string, so </script> in textContent won't break parsing
    // But getStateFromDocument should detect raw </script> in raw textContent
    // For this test, directly set island text to contain raw </script>
    const island = document.getElementById('tm-state');
    island.textContent = '{"schemaVersion":"1.0","meta":{"projectName":"a </script> b"}}';
    const result = TMCore.getStateFromDocument(document);
    // Should detect raw </script> and return error
    assert.notEqual(result.error, undefined);
    assert.equal(result.error.includes('</script>') || result.error.includes('Raw'), true);
  });
});

describe('core — insight derivation and task matching', () => {
  before(() => { loadCore(); });

  it('normalizes task records, aggregates dimensions, and keeps blocked tasks visible without risk metadata', () => {
    const state = createState({
      phases: [{
        id: 'p-core', number: 1, title: 'Core', status: 'in-progress', tasks: [
          { id: 'T1', title: 'Core API', note: 'parser', status: 'completed', owner: 'AI', tag: 'core' },
          { id: 'T2', title: 'Blocked task', note: '', status: 'blocked', owner: '', tag: '' },
          { id: 'T1', title: '', note: '', status: 'pending', owner: 'Dev', tag: 'ui' },
        ],
      }],
    });
    const before = JSON.stringify(state);
    const result = TMCore.deriveInsights(state);

    assert.equal(result.tasks.length, 3);
    assert.equal(result.tasks[1].phaseId, 'p-core');
    assert.equal(result.tasks[1].phaseTitle, 'Core');
    assert.equal(result.tasks[1].owner, 'Unassigned');
    assert.equal(result.tasks[1].tag, 'Untagged');
    assert.equal(result.dimensions.owner.AI.total, 1);
    assert.equal(result.dimensions.tag.Untagged.blocked, 1);
    assert.equal(result.dimensions.phase['p-core'].total, 3);
    assert.equal(result.dimensions.status.blocked.total, 1);
    assert.equal(result.blockers.total, 1);
    assert.equal(result.blockers.tasks[0].id, 'T2');
    assert.equal(result.diagnostics.warnings.some((item) => item.includes('Duplicate task ID: T1')), true);
    assert.equal(result.diagnostics.warnings.some((item) => item.includes('missing title')), true);
    assert.equal(JSON.stringify(state), before, 'derivation must not mutate the island');
  });

  it('records invalid optional risk/history data and merges supplied validation diagnostics', () => {
    const state = createState({
      meta: { history: [
        { timestamp: '2026-01-01T00:00:00Z', completed: 1, total: 2 },
        { timestamp: 'not-a-date', completed: 2, total: 2 },
      ] },
      phases: [{ id: 'p1', title: 'Phase', tasks: [{ id: 'T1', title: 'Task', status: 'pending', owner: 'AI', tag: 'core', risk: 'urgent' }] }],
    });
    const result = TMCore.deriveInsights(state, { errors: ['validation error'], warnings: ['validation warning'] });

    assert.equal(result.diagnostics.errors.includes('validation error'), true);
    assert.equal(result.diagnostics.warnings.includes('validation warning'), true);
    assert.equal(result.diagnostics.warnings.some((item) => item.includes('Invalid risk')), true);
    assert.equal(result.diagnostics.warnings.some((item) => item.includes('Invalid history')), true);
    assert.equal(result.history.length, 1);
    assert.equal(result.forecast.available, false);
  });

  it('uses only the newest 12 valid history points and exposes a conservative trend range', () => {
    const history = Array.from({ length: 15 }, (_, index) => ({
      timestamp: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
      completed: index,
      total: 20,
    }));
    const state = createState({
      meta: { history },
      phases: [{ id: 'p1', title: 'Phase', tasks: [] }],
    });
    const result = TMCore.deriveInsights(state);

    assert.equal(result.history.length, 12);
    assert.equal(result.history[0].completed, 3);
    assert.equal(result.history[11].completed, 14);
    assert.equal(result.forecast.available, true);
    assert.equal(result.forecast.confidence, 'low');
    assert.equal(result.forecast.range.min <= result.forecast.range.max, true);
    assert.equal(result.forecast.label.includes('trend'), true);
  });

  it('refuses forecasts with insufficient or non-progressing history', () => {
    const state = createState({
      meta: { history: [
        { timestamp: '2026-01-01T00:00:00Z', completed: 2, total: 5 },
        { timestamp: '2026-01-02T00:00:00Z', completed: 2, total: 5 },
        { timestamp: '2026-01-03T00:00:00Z', completed: 2, total: 5 },
      ] },
      phases: [],
    });
    const result = TMCore.deriveInsights(state);

    assert.equal(result.forecast.available, false);
    assert.equal(typeof result.forecast.reason, 'string');
    assert.equal(result.forecast.reason.includes('velocity'), true);
  });

  it('matches text, status, owner, tag, and phase filters as an AND intersection', () => {
    const record = { id: 'T1', title: 'Core API', note: 'parser', status: 'in-progress', owner: 'AI', tag: 'core', phaseId: 'p1', phaseTitle: 'Foundation' };
    assert.equal(TMCore.matchesTask(record, { text: 'core', status: 'in-progress', owner: 'AI', tag: 'core', phase: 'p1' }), true);
    assert.equal(TMCore.matchesTask(record, { text: 'other', status: 'in-progress', owner: 'AI', tag: 'core', phase: 'p1' }), false);
    assert.equal(TMCore.matchesTask(record, { text: 'core', status: 'blocked', owner: 'AI', tag: 'core', phase: 'p1' }), false);
    assert.equal(TMCore.matchesTask(record, { text: 'core', status: 'in-progress', owner: 'Dev', tag: 'core', phase: 'p1' }), false);
    assert.equal(TMCore.matchesTask(record, { text: 'core', status: 'in-progress', owner: 'AI', tag: 'ui', phase: 'p1' }), false);
    assert.equal(TMCore.matchesTask(record, { text: 'core', status: 'in-progress', owner: 'AI', tag: 'core', phase: 'p2' }), false);
  });

  it('treats empty and reset filters as unrestricted and supports Active status', () => {
    const active = { id: 'T1', title: 'Task', note: '', status: 'in-progress', owner: 'AI', tag: 'core', phaseId: 'p1' };
    const completed = { ...active, status: 'completed' };
    const reset = { text: '', query: '', status: 'all', owner: '', tag: '', phase: '' };
    assert.equal(TMCore.matchesTask(active, reset), true);
    assert.equal(TMCore.matchesTask(active, { status: 'active' }), true);
    assert.equal(TMCore.matchesTask(completed, { status: 'active' }), false);
    assert.equal(TMCore.matchesTask(active, {}), true);
  });
});

describe('core — UI-only preference boundary', () => {
  before(() => { loadCore(); });

  it('sanitizes the versioned preference contract and rejects an invalid root', () => {
    const preferences = TMCore.sanitizeUiPreferences({
      version: 1, activeView: 'git', filters: { text: 'x'.repeat(300), status: 'bad', owner: 'o'.repeat(129), tag: 'tag', phase: 'phase' },
      expandedPhaseIds: ['p1', 'p1', 'x'.repeat(129)], expandedPreviewKeys: ['k1', 'k1', 'y'.repeat(257)], task: { status: 'completed' },
    });
    assert.deepEqual(preferences, { version: 1, activeView: 'git', filters: { text: 'x'.repeat(256), status: 'all', owner: '', tag: 'tag', phase: 'phase' }, expandedPhaseIds: ['p1'], expandedPreviewKeys: ['k1'] });
    assert.deepEqual(TMCore.sanitizeUiPreferences({ version: 2, activeView: 'help' }), TMCore.defaultUiPreferences());
  });

  it('uses one UI-only key and retains sanitized preferences when storage throws', () => {
    const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    const store = TMCore.createUiPreferenceStore(storage);
    assert.deepEqual(store.load(), TMCore.defaultUiPreferences());
    assert.equal(store.save({ version: 1, activeView: 'help', filters: { text: 'query', status: 'active' }, expandedPhaseIds: ['p1'], expandedPreviewKeys: ['task:1'] }).activeView, 'help');
    assert.equal(store.load().filters.text, 'query');
    assert.equal(TMCore.UI_PREFERENCES_KEY, 'tm-ui-preferences');
  });
});

describe('core — additive Codegraph normalization', () => {
  before(() => { loadCore(); });

  it('normalizes optional Codegraph fields without mutating its source or invalidating schema 1.0', () => {
    const state = createState({ codegraph: { nodes: [{ id: 'core', label: 'Core', files: ['modules/02-core.js', 7], taskIds: ['T2-01', null], details: 'linea uno' }, { id: '', label: 'Ignorado' }], edges: [{ from: 'core', to: 'panels', label: 'usa', details: 'linea dos' }, { from: 1, to: 'core' }] } });
    const raw = JSON.stringify(state);
    const diagnostics = { warnings: [] };
    const graph = TMCore.normalizeCodegraph(state, diagnostics);
    assert.equal(TMCore.validateState(state).ok, true);
    assert.deepEqual(graph.nodes[0].files, ['modules/02-core.js']);
    assert.deepEqual(graph.nodes[0].taskIds, ['T2-01']);
    assert.equal(graph.edges.length, 1);
    assert.equal(JSON.stringify(state), raw, 'raw island bytes/data must remain immutable');
    assert.equal(diagnostics.warnings.length > 0, true);
  });
});
