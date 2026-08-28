// @ts-nocheck
// tests/header-hud.test.mjs — Header + HUD renderers (PR3, happy-dom)
// English comments, Spanish labels placeholder.

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { createState, createDom, readSkeleton } from './helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const corePath = path.join(projectRoot, 'modules', '02-core.js');
const headerHudPath = path.join(projectRoot, 'modules', '03-header-hud.js');

function loadModules() {
  const coreJs = readFileSync(corePath, 'utf-8');
  const hudJs = readFileSync(headerHudPath, 'utf-8');
  const g = globalThis;
  const prevWindow = g.window;
  g.window = g;
  try {
    eval(coreJs);
    eval(hudJs);
  } finally {
    if (prevWindow === undefined) delete g.window; else g.window = prevWindow;
  }
  return { core: g.TMCore, hud: g.TMHeaderHud };
}

function mountWithState(state) {
  const html = readSkeleton();
  const { document, window } = createDom(html);
  // Load modules into this window context via eval
  const coreJs = readFileSync(corePath, 'utf-8');
  const hudJs = readFileSync(headerHudPath, 'utf-8');
  // Evaluate inside window
  if (typeof window.eval === 'function') {
    window.eval(coreJs);
    window.eval(hudJs);
  } else {
    // fallback global eval
    const g = globalThis;
    const prevWindow = g.window;
    g.window = window;
    try { eval(coreJs); eval(hudJs); } finally { g.window = prevWindow; }
    window.TMCore = globalThis.TMCore;
    window.TMHeaderHud = globalThis.TMHeaderHud;
  }
  return { document, window, core: window.TMCore || globalThis.TMCore, hud: window.TMHeaderHud || globalThis.TMHeaderHud };
}

describe('header-hud — file existence and portability', () => {
  it('modules/03-header-hud.js exists and contains no forbidden APIs', () => {
    const js = readFileSync(headerHudPath, 'utf-8');
    const withoutComments = js.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/fetch\s*\(/.test(withoutComments), false, 'must not contain fetch(');
    assert.equal(/XMLHttpRequest/.test(withoutComments), false);
    assert.equal(/\bimport\s+.*from/.test(withoutComments), false);
    assert.equal(/import\s*\(/.test(withoutComments), false);
    // Allow module.exports but not ESM export
    const hasExport = /\bexport\s+/.test(withoutComments);
    if (hasExport) {
      assert.equal(withoutComments.includes('module.exports'), true, 'export found but not module.exports');
    }
  });

  it('loads TMHeaderHud global via classic eval', () => {
    const { hud } = loadModules();
    assert.equal(typeof hud.renderHeader, 'function');
    assert.equal(typeof hud.renderHud, 'function');
    assert.equal(typeof hud.renderAll, 'function');
  });
});

describe('header-hud — global %, totals, badges', () => {
  it('renders global percentage, totals and four distribution badges from derived metrics', () => {
    const state = createState({
      meta: { projectName: 'Proyecto Test', version: '1.2.3', branch: 'main', commit: 'deadbeef123456', syncStatus: 'synced', labels: { es: {} }, features: {} },
      phases: [
        { id: 'p1', number: 1, title: 'Fase Uno', status: 'completed', target: '', lead: '', tasks: [
          { id: 'T1-01', title: 'Done 1', status: 'completed', tag: 'Backend', note: '', owner: 'Ana', commit: '' },
          { id: 'T1-02', title: 'Done 2', status: 'completed', tag: 'Backend', note: '', owner: 'Ana', commit: '' },
        ]},
        { id: 'p2', number: 2, title: 'Fase Dos', status: 'in-progress', target: '', lead: '', tasks: [
          { id: 'T2-01', title: 'Active', status: 'in-progress', tag: 'Frontend', note: '', owner: 'Maya', commit: '' },
          { id: 'T2-02', title: 'Pending', status: 'pending', tag: 'Docs', note: '', owner: 'Luis', commit: '' },
          { id: 'T2-03', title: 'Blocked', status: 'blocked', tag: 'Infra', note: '', owner: 'Ops', commit: '' },
        ]}
      ]
    });
    const { document, core, hud } = mountWithState(state);
    const metrics = core.deriveMetrics(state);
    // Use hud render
    hud.renderAll(state, document);

    // Global % : 2 completed /5 total =40%
    const pctEl = document.getElementById('overall-progress-num');
    assert.notEqual(pctEl, null, 'overall-progress-num must exist');
    assert.equal(pctEl.textContent.includes('40%'), true, `expected 40% got ${pctEl.textContent}`);

    const bar = document.getElementById('overall-progress-bar');
    assert.notEqual(bar, null);
    assert.equal(bar.style.width, '40%', `bar width should be 40% got ${bar.style.width}`);

    const completedEl = document.getElementById('stat-completed-count');
    const totalEl = document.getElementById('stat-total-count');
    assert.notEqual(completedEl, null);
    assert.notEqual(totalEl, null);
    assert.equal(completedEl.textContent, '2');
    assert.equal(totalEl.textContent, '5');

    // Four badges: check that distribution numbers appear in HUD
    const hudHtml = document.getElementById('metrics-overview').innerHTML;
    // Should contain 2 Hechas, 1 Activas, 1 Pendientes, 1 Bloqueadas
    assert.equal(hudHtml.includes('2 Hechas') || hudHtml.includes('2</span> Hechas') || hudHtml.includes('>2 Hechas'), true, 'hud should show 2 Hechas');
    assert.equal(hudHtml.includes('1 Activas') || hudHtml.includes('>1 Activas'), true);
    assert.equal(hudHtml.includes('1 Pendientes') || hudHtml.includes('>1 Pendientes'), true);
    assert.equal(hudHtml.includes('1 Bloqueadas') || hudHtml.includes('>1 Bloqueadas'), true);

    // Header updates
    const titleEl = document.getElementById('project-title');
    assert.equal(titleEl.textContent.includes('Proyecto Test'), true);
    assert.equal(titleEl.textContent.includes('1.2.3'), true);
  });

  it('overwrites legacy hardcoded 68% width', () => {
    const state = createState({
      phases: [{ id: 'p1', number: 1, title: 'Fase', status: 'pending', target: '', lead: '', tasks: [
        { id: 'T1', title: 'T', status: 'completed', tag: '', note: '', owner: '', commit: '' },
        { id: 'T2', title: 'T', status: 'pending', tag: '', note: '', owner: '', commit: '' },
      ]}]
    }); // 1/2 =50%
    const { document, core, hud } = mountWithState(state);
    // Simulate legacy HUD with hardcoded 68%
    const hudContainer = document.getElementById('metrics-overview');
    // Force legacy bar if not present: create a bar with 68%
    hudContainer.innerHTML = '<div class="metric-card"><div id="overall-progress-num">68%</div><div id="overall-progress-bar" style="width:68%"></div><span id="stat-completed-count">0</span><span id="stat-total-count">0</span></div>';
    const beforeBar = document.getElementById('overall-progress-bar');
    assert.equal(beforeBar.style.width, '68%');

    const metrics = core.deriveMetrics(state);
    hud.renderHud(state, metrics, document);

    const afterBar = document.getElementById('overall-progress-bar');
    assert.notEqual(afterBar.style.width, '68%', 'legacy 68% should be overwritten');
    assert.equal(afterBar.style.width, '50%', `expected 50% got ${afterBar.style.width}`);
    const pctEl = document.getElementById('overall-progress-num');
    assert.equal(pctEl.textContent.includes('68%'), false, 'legacy text should be gone');
    assert.equal(pctEl.textContent.includes('50%'), true);
  });

  it('identical re-render is idempotent (no duplication, same HTML)', () => {
    const state = createState({
      phases: [{ id: 'p1', number: 1, title: 'Fase Uno', status: 'completed', target: '', lead: '', tasks: [{ id: 'T1', title: 'T', status: 'completed', tag: '', note: '', owner: '', commit: '' }] }]
    });
    const { document, core, hud } = mountWithState(state);
    const metrics = core.deriveMetrics(state);
    hud.renderHud(state, metrics, document);
    const firstHtml = document.getElementById('metrics-overview').innerHTML;
    hud.renderHud(state, metrics, document);
    const secondHtml = document.getElementById('metrics-overview').innerHTML;
    assert.equal(firstHtml, secondHtml, 'second render should be identical');
    // Also renderAll twice
    hud.renderAll(state, document);
    const third = document.getElementById('metrics-overview').innerHTML;
    assert.equal(secondHtml, third);
  });

  it('uses meta.labels.es fallback for Spanish labels', () => {
    const stateFallback = createState({
      meta: { projectName: 'P', version: '1.0', labels: { es: { overallProgress: 'Mi Progreso' } }, features: {} },
      phases: []
    });
    const { document, core, hud } = mountWithState(stateFallback);
    const metrics = core.deriveMetrics(stateFallback);
    hud.renderHud(stateFallback, metrics, document);
    const hudHtml = document.getElementById('metrics-overview').innerHTML;
    assert.equal(hudHtml.includes('Mi Progreso'), true, 'should use custom label Mi Progreso');
    // Default fallback when no label
    const stateDefault = createState({ meta: { projectName: 'P', version: '1.0', labels: { es: {} }, features: {} }, phases: [] });
    const { document: doc2, core: core2, hud: hud2 } = mountWithState(stateDefault);
    const m2 = core2.deriveMetrics(stateDefault);
    hud2.renderHud(stateDefault, m2, doc2);
    const hudHtml2 = doc2.getElementById('metrics-overview').innerHTML;
    assert.equal(hudHtml2.includes('Progreso Global'), true, 'should fallback to Progreso Global');
  });

  it('header renders branch/commit and escapes HTML', () => {
    const state = createState({
      meta: { projectName: '<script>alert(1)</script>', version: '1.0', branch: 'feature/<b>', commit: 'abc123def456', syncStatus: 'synced', labels: { es: {} }, features: {} },
      phases: []
    });
    const { document, hud } = mountWithState(state);
    hud.renderHeader(state, document);
    const titleEl = document.getElementById('project-title');
    // Should be escaped, not raw script
    assert.equal(titleEl.innerHTML.includes('<script>'), false, 'should escape script tag');
    assert.equal(titleEl.textContent.includes('<script>'), true, 'textContent should preserve literal after escaping via textContent? Actually we set textContent, so it will show literal');
    // Check that innerHTML does not contain unescaped <script>
    assert.equal(titleEl.innerHTML.includes('&lt;script&gt;') || titleEl.textContent.includes('<script>'), true);
  });

  it('handles empty phases gracefully (0% and Sin fase)', () => {
    const state = createState({ meta: { projectName: 'Empty', version: '0', labels: { es: {} }, features: {} }, phases: [] });
    const { document, core, hud } = mountWithState(state);
    const metrics = core.deriveMetrics(state);
    hud.renderAll(state, document);
    const pctEl = document.getElementById('overall-progress-num');
    assert.equal(pctEl.textContent.includes('0%'), true);
    const focusEl = document.getElementById('current-focus-title');
    assert.notEqual(focusEl, null);
    assert.equal(focusEl.textContent.includes('Sin fase') || focusEl.textContent.includes('Sin'), true);
  });

  it('renders semantic insight SVGs with bounded values, workload text, risks, and conservative forecast', () => {
    const state = createState({
      meta: {
        history: [
          { timestamp: '2026-08-18T00:00:00Z', completed: 0, total: 4 },
          { timestamp: '2026-08-19T00:00:00Z', completed: 1, total: 4 },
          { timestamp: '2026-08-20T00:00:00Z', completed: 2, total: 4 },
        ],
      },
      phases: [{ id: 'p1', number: 1, title: 'Core <UI>', status: 'in-progress', tasks: [
        { id: 'T1', title: 'Core', status: 'completed', owner: 'AI', tag: 'Core' },
        { id: 'T2', title: 'Risk', status: 'in-progress', owner: 'AI', tag: 'UI', risk: 'high' },
        { id: 'T3', title: 'Blocked', status: 'blocked', owner: 'Ops', tag: 'Infra' },
      ] }],
    });
    const { document, hud } = mountWithState(state);
    hud.renderAll(state, document);

    const card = document.getElementById('metric-insights');
    assert.notEqual(card, null);
    const svg = card.querySelector('svg');
    assert.notEqual(svg, null);
    assert.equal(svg.getAttribute('role'), 'img');
    assert.match(svg.getAttribute('viewBox'), /^0 0 \d+ \d+$/);
    assert.notEqual(svg.querySelector('title'), null);
    assert.equal(/NaN|Infinity/.test(card.innerHTML), false);
    assert.equal(card.textContent.includes('AI'), true);
    assert.equal(card.textContent.includes('Blockers: 1'), true);
    assert.equal(card.textContent.includes('High risk: 1'), true);
    assert.match(card.textContent, /Low confidence|trend only/i);
    assert.equal(/deadline|promise|due date/i.test(card.textContent), false);
  });

  it('renders a finite zero-task insight state without trend or non-finite SVG attributes', () => {
    const state = createState({ phases: [{ id: 'empty', number: 1, title: 'Empty', status: 'pending', tasks: [] }] });
    const { document, hud } = mountWithState(state);
    hud.renderAll(state, document);
    const card = document.getElementById('metric-insights');
    assert.notEqual(card, null);
    assert.equal(card.textContent.includes('Blockers: 0'), true);
    assert.equal(card.querySelectorAll('svg').length > 0, true);
    assert.equal(/NaN|Infinity/.test(card.innerHTML), false);
    assert.equal(card.querySelector('.insight-trend'), null);
  });

  it('renders semantic mobile containment hooks without changing metric or status text', () => {
    const state = createState({ phases: [{ id: 'p1', number: 1, title: 'Phase', status: 'in-progress', target: 'Long mobile target', tasks: [
      { id: 'T1', title: 'Done', status: 'completed', owner: 'AI', tag: 'UI' },
      { id: 'T2', title: 'Active', status: 'in-progress', owner: 'AI', tag: 'UI' },
      { id: 'T3', title: 'Pending', status: 'pending', owner: 'AI', tag: 'UI' },
      { id: 'T4', title: 'Blocked', status: 'blocked', owner: 'AI', tag: 'UI' },
    ] }] });
    const { document, hud } = mountWithState(state);
    hud.renderAll(state, document);

    assert.equal(document.querySelectorAll('.metric-title-row').length, 3);
    const distribution = document.querySelector('.distribution-badges');
    assert.notEqual(distribution, null);
    assert.deepEqual([...distribution.querySelectorAll('.badge')].map((badge) => badge.textContent.trim()), ['1 Hechas', '1 Activas', '1 Pendientes', '1 Bloqueadas']);
    assert.match(document.querySelector('.distribution-risk-warning').textContent, /1 bloqueada\(s\) requiere\(n\) atención/);
  });

  it('shows the HUD only on the overview tab while dedicated views start below navigation', () => {
    const state = createState({ phases: [{ id: 'p1', number: 1, title: 'Phase', status: 'pending', tasks: [] }] });
    const { document, hud } = mountWithState(state);
    hud.renderAll(state, document);

    const metrics = document.getElementById('metrics-overview');
    const overview = document.getElementById('view-overview');
    const kanban = document.getElementById('view-kanban');
    const kanbanTab = document.getElementById('tab-btn-kanban');
    const overviewTab = document.getElementById('tab-btn-overview');

    assert.equal(metrics.hidden, false);
    assert.equal(overview.hidden, false);
    kanbanTab.click();
    assert.equal(metrics.hidden, true);
    assert.equal(metrics.style.display, 'none');
    assert.equal(overview.hidden, true);
    assert.equal(kanban.hidden, false);

    overviewTab.click();
    assert.equal(metrics.hidden, false);
    assert.equal(metrics.style.display, '');
    assert.equal(overview.hidden, false);
    assert.equal(kanban.hidden, true);
  });

  it('renders insights as a panoramic band with separate compact regions', () => {
    const state = createState({
      meta: {
        history: [
          { timestamp: '2026-08-18T00:00:00Z', completed: 1, total: 4 },
          { timestamp: '2026-08-19T00:00:00Z', completed: 2, total: 4 },
          { timestamp: '2026-08-20T00:00:00Z', completed: 3, total: 4 },
        ],
      },
      phases: [{ id: 'p1', number: 1, title: 'Phase', status: 'in-progress', tasks: [
        { id: 'T1', title: 'One', status: 'completed', owner: 'AI', tag: 'Core' },
        { id: 'T2', title: 'Two', status: 'in-progress', owner: 'Ops', tag: 'UI' },
      ] }],
    });
    const { document, hud } = mountWithState(state);
    hud.renderAll(state, document);

    const card = document.getElementById('metric-insights');
    assert.equal(card.classList.contains('metric-insights-band'), true);
    assert.notEqual(card.querySelector('.insight-status-region'), null);
    assert.notEqual(card.querySelector('.insight-owners'), null);
    assert.notEqual(card.querySelector('.insight-tags'), null);
    assert.notEqual(card.querySelector('.insight-trend-region'), null);
    assert.equal(card.querySelector('.insight-dimension-list').children.length > 1, true);
    assert.equal(card.querySelector('.insight-band-grid').classList.contains('insight-workloads'), false, 'the internal grid must not inherit obsolete workload display rules');
    assert.equal(card.querySelector('svg[role="img"]'), card.querySelector('svg'), 'semantic insight SVG must remain intact');
  });

  it('fills the executive summary with three additional truthful informational cards', () => {
    const state = createState({
      meta: { features: { git: true, tree: true, codegraph: false } },
      phases: [
        { id: 'p1', number: 1, title: 'Discovery', status: 'completed', tasks: [{ id: 'T1', title: 'Done', status: 'completed' }] },
        { id: 'p2', number: 2, title: 'Delivery', status: 'in-progress', tasks: [{ id: 'T2', title: 'Active', status: 'in-progress' }, { id: 'T3', title: 'Blocked', status: 'blocked' }] },
      ],
      git: { branch: 'main', syncStatus: 'synced', commits: [{ hash: 'abc1234', message: 'feat: summary' }] },
      tree: [{ name: 'src/', depth: 0, type: 'dir' }],
      codegraph: { nodes: [], edges: [] },
    });
    const { document, hud } = mountWithState(state);
    hud.renderAll(state, document);

    assert.notEqual(document.getElementById('metric-phase-coverage'), null);
    assert.notEqual(document.getElementById('metric-active-workload'), null);
    assert.notEqual(document.getElementById('metric-data-coverage'), null);
    assert.match(document.getElementById('metric-phase-coverage').textContent, /1 de 2 fases/i);
    assert.match(document.getElementById('metric-active-workload').textContent, /2 tareas/i);
    assert.match(document.getElementById('metric-data-coverage').textContent, /2 de 3 fuentes/i);
  });
});

describe('header-hud — preference-backed stable navigation', () => {
  it('maps keys 1–7 in contract order, preserves island bytes, and ignores editable controls', () => {
    const state = createState();
    const { document, window, hud } = mountWithState(state);
    const islandBytes = document.getElementById('tm-state').textContent;
    hud.renderAll(state, document);
    for (const [key, view] of ['overview', 'phases', 'kanban', 'codegraph', 'tree', 'git', 'help'].entries()) {
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: String(key + 1), bubbles: true }));
      assert.equal(document.getElementById('view-' + view).hidden, false, 'key ' + (key + 1) + ' activates ' + view);
    }
    const input = document.getElementById('global-search-input');
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: '1', bubbles: true }));
    assert.equal(document.getElementById('view-help').hidden, false, 'input keystroke is not hijacked');
    assert.equal(document.getElementById('tm-state').textContent, islandBytes);
  });

  it('binds shell shortcuts once across repeated initialization and stores only preferences', () => {
    const { document, window, hud } = mountWithState(createState());
    hud.setupNavTabs(document);
    hud.setupNavTabs(document);
    document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: '5', bubbles: true }));
    assert.equal(document.getElementById('view-tree').hidden, false, 'one keyboard activation selects Tree after repeated setup');
    assert.equal(window.localStorage.getItem('tm-ui-preferences').includes('task'), false);
  });
});

describe('header-hud — executive overview ownership', () => {
  it('puts risk before progress and leaves detailed panels to their dedicated views', () => {
    const state = createState({ phases: [{ id: 'p1', number: 1, title: 'Delivery', status: 'blocked', tasks: [
      { id: 'T1', title: 'Await approval', status: 'blocked', risk: 'high', blockedReason: 'API key approval' },
    ] }] });
    const { document, hud } = mountWithState(state);
    hud.renderAll(state, document);

    const overview = document.getElementById('view-overview');
    const risk = document.getElementById('metric-overview-risk');
    const progress = document.getElementById('metric-overall-card');
    assert.notEqual(risk, null, 'Overview needs a risk summary');
    assert.ok(risk.compareDocumentPosition(progress) & 4, 'risk must precede progress');
    assert.equal(risk.textContent.includes('API key approval'), true);
    assert.equal(overview.querySelector('#phases-panel'), null, 'Overview must not own detailed phases');
    assert.equal(overview.querySelector('#help-panel'), null, 'Overview must not own full Help tools');
  });
});

describe('header-hud — accessible metric details', () => {
  it('keeps every summary card as a direct grid child with a visible details affordance', () => {
    const state = createState({
      meta: { features: { git: true, tree: true, codegraph: true } },
      phases: [{ id: 'p1', number: 1, title: 'Delivery', status: 'in-progress', tasks: [
        { id: 'T1', title: 'Active work', status: 'in-progress', owner: 'Ana', tag: 'UI' },
      ] }],
      git: { branch: 'main', syncStatus: 'synced', commits: [{ hash: 'abc1234', message: 'feat: details' }] },
      tree: [{ name: 'src/', depth: 0, type: 'dir' }],
      codegraph: { nodes: [{ id: 'core', label: 'Core' }], edges: [] },
    });
    const { document, hud } = mountWithState(state);
    hud.renderAll(state, document);

    const expected = ['metric-overview-risk', 'metric-overall-card', 'metric-current-focus', 'metric-distribution', 'metric-git', 'metric-phase-coverage', 'metric-active-workload', 'metric-data-coverage', 'metric-insights'];
    const direct = [...document.querySelectorAll('#metrics-overview > .metric-card')];
    assert.deepEqual(direct.map((card) => card.id), expected);
    for (const card of direct) {
      assert.equal(card.getAttribute('role'), 'button');
      assert.equal(card.getAttribute('tabindex'), '0');
      assert.equal(card.getAttribute('aria-haspopup'), 'dialog');
      assert.match(card.textContent, /Detalles/);
    }
  });

  it('opens one truthful dialog by click, Enter, and Space, then restores focus', () => {
    const state = createState({
      meta: { features: { git: true, tree: false, codegraph: false } },
      phases: [{ id: 'p1', number: 1, title: 'Delivery', status: 'in-progress', tasks: [
        { id: 'T1', title: 'Active work', status: 'in-progress', owner: 'Ana', tag: 'UI' },
        { id: 'T2', title: 'Blocked work', status: 'blocked', owner: 'Ops', tag: 'Infra', blockedReason: 'Approval missing' },
      ] }],
      git: { branch: 'main', syncStatus: 'synced', commits: [{ hash: 'abc1234', message: 'feat: details' }] },
    });
    const { document, window, hud } = mountWithState(state);
    hud.renderAll(state, document);
    const card = document.getElementById('metric-active-workload');
    const dialog = document.getElementById('overview-detail-dialog');
    assert.notEqual(dialog, null);

    for (const event of [new window.MouseEvent('click', { bubbles: true }), new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }), new window.KeyboardEvent('keydown', { key: ' ', bubbles: true })]) {
      card.dispatchEvent(event);
      assert.equal(dialog.dataset.open, 'true');
      assert.match(dialog.textContent, /2 tareas/);
      assert.match(dialog.textContent, /1 en progreso/);
      assert.match(dialog.textContent, /1 bloqueada/);
      hud.closeOverviewDetailDialog(document);
    }
    assert.equal(document.activeElement, card);
    assert.equal(document.querySelectorAll('#overview-detail-dialog').length, 1);
  });

  it('explains missing JSON data and navigates to a related dedicated view', () => {
    const state = createState({ meta: { features: { git: true, tree: true, codegraph: true } }, git: { branch: '', syncStatus: '', commits: [] }, tree: [], codegraph: { nodes: [], edges: [] } });
    const { document, hud } = mountWithState(state);
    hud.renderAll(state, document);

    document.getElementById('metric-data-coverage').click();
    const dialog = document.getElementById('overview-detail-dialog');
    assert.match(dialog.textContent, /git\.commits|tree|codegraph\.nodes/i);
    assert.match(dialog.textContent, /no se invent/i);
    hud.closeOverviewDetailDialog(document);

    document.getElementById('metric-git').click();
    const viewButton = dialog.querySelector('[data-overview-view-section]');
    assert.equal(viewButton.hidden, false);
    viewButton.click();
    assert.equal(document.getElementById('view-git').hidden, false);
    assert.equal(document.getElementById('tm-state').textContent.includes('schemaVersion'), true);
  });

  it('binds metric interaction once across identical re-renders', () => {
    const state = createState();
    const { document, hud } = mountWithState(state);
    hud.renderAll(state, document);
    hud.renderAll(state, document);
    const card = document.getElementById('metric-overall-card');
    card.click();
    assert.equal(document.querySelectorAll('#overview-detail-dialog').length, 1);
    assert.equal(document.getElementById('overview-detail-dialog').dataset.open, 'true');
  });
});

describe('header-hud — digital clock and last update cockpit hub', () => {
  it('renders digital clock with hours, minutes, seconds, period, date and timezone', () => {
    const state = createState();
    const { document, hud } = mountWithState(state);
    hud.renderHeader(state, document);

    const clock = document.getElementById('tm-digital-clock');
    assert.notEqual(clock, null, 'digital clock card must exist');
    assert.equal(clock.getAttribute('role'), 'timer');

    const hoursEl = document.getElementById('clock-hours');
    const minEl = document.getElementById('clock-minutes');
    const secEl = document.getElementById('clock-seconds');
    const dateEl = document.getElementById('clock-date');
    const tzEl = document.getElementById('clock-timezone');
    const periodEl = document.getElementById('clock-period');

    assert.notEqual(hoursEl, null);
    assert.notEqual(minEl, null);
    assert.notEqual(secEl, null);
    assert.notEqual(dateEl, null);
    assert.notEqual(tzEl, null);
    assert.notEqual(periodEl, null);

    assert.match(hoursEl.textContent, /^\d{2}$/);
    assert.match(minEl.textContent, /^\d{2}$/);
    assert.match(secEl.textContent, /^\d{2}$/);
    assert.ok(dateEl.textContent.length > 0);
    assert.ok(tzEl.textContent.length > 0);
  });

  it('toggles clock between 12-hour and 24-hour formats on switcher click', () => {
    const state = createState();
    const { document, hud } = mountWithState(state);
    hud.renderHeader(state, document);

    const clock = document.getElementById('tm-digital-clock');
    const toggleBtn = document.getElementById('btn-clock-toggle-format');
    const formatTag = document.getElementById('clock-format-tag');
    const periodEl = document.getElementById('clock-period');

    assert.equal(clock.getAttribute('data-clock-format'), '12h');
    assert.equal(formatTag.textContent, '12H');
    assert.equal(periodEl.style.display !== 'none', true);

    // Click to switch to 24h
    toggleBtn.click();
    assert.equal(clock.getAttribute('data-clock-format'), '24h');
    assert.equal(formatTag.textContent, '24H');
    assert.equal(periodEl.style.display, 'none');

    // Click again to switch back to 12h
    toggleBtn.click();
    assert.equal(clock.getAttribute('data-clock-format'), '12h');
    assert.equal(formatTag.textContent, '12H');
  });

  it('renders last update card from meta timestamp or history', () => {
    const state = createState({
      meta: {
        lastUpdated: '2026-08-26T14:30:00Z',
        history: [{ timestamp: '2026-08-26T14:30:00Z', completed: 2, total: 5 }]
      }
    });
    const { document, hud } = mountWithState(state);
    hud.renderHeader(state, document);

    const lastUpdateCard = document.getElementById('tm-last-update');
    assert.notEqual(lastUpdateCard, null, 'last update card must exist');
    assert.equal(lastUpdateCard.getAttribute('role'), 'status');

    const relEl = document.getElementById('last-update-relative');
    const exactEl = document.getElementById('last-update-exact');

    assert.notEqual(relEl, null);
    assert.notEqual(exactEl, null);
    assert.ok(relEl.textContent.length > 0);
    assert.ok(exactEl.textContent.length > 0);
  });

  it('renders active harness card and updated project logo svg', () => {
    const state = createState({
      meta: {
        harness: 'OpenCode',
        harnessRole: 'Autonomous Multi-Agent Runtime'
      }
    });
    const { document, hud } = mountWithState(state);
    hud.renderHeader(state, document);

    const harnessCard = document.getElementById('tm-harness-card');
    assert.notEqual(harnessCard, null, 'harness card must exist');
    assert.equal(harnessCard.getAttribute('role'), 'status');

    const harnessName = document.getElementById('harness-name');
    const harnessRole = document.getElementById('harness-role');
    assert.notEqual(harnessName, null);
    assert.equal(harnessName.textContent, 'OpenCode');
    assert.equal(harnessRole.textContent, 'Autonomous Multi-Agent Runtime');

    const logo = document.getElementById('project-logo-icon');
    assert.notEqual(logo, null, 'project logo icon must exist');
    assert.equal(logo.querySelector('svg') !== null, true, 'logo must contain svg');
  });
});
