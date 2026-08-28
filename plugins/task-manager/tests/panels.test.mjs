// @ts-nocheck
// tests/panels.test.mjs — Flag-gated optional panels: git, tree, codegraph (PR5)
// Happy-dom + classic eval, containment.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { createState, createDom, readSkeleton } from './helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const corePath = path.join(projectRoot, 'modules', '02-core.js');
const phasesPath = path.join(projectRoot, 'modules', '04-phases.js');
const hudPath = path.join(projectRoot, 'modules', '03-header-hud.js');
const panelsPath = path.join(projectRoot, 'modules', '05-panels.js');

function mountWithPanels(state) {
  const html = panelFixture();
  const { document, window } = createDom(html);
  const coreJs = readFileSync(corePath, 'utf-8');
  const hudJs = readFileSync(hudPath, 'utf-8');
  const phasesJs = readFileSync(phasesPath, 'utf-8');
  const panelsJs = readFileSync(panelsPath, 'utf-8');
  window.eval(coreJs);
  window.eval(hudJs);
  window.eval(phasesJs);
  window.eval(panelsJs);
  const core = window.TMCore;
  const panels = window.TMPanel;
  // Also need to render core HUD/phases? For panels we just need panels render
  // Derive metrics for completeness
  const metrics = core.deriveMetrics(state);
  // Render panels
  panels.renderAllPanels(state, document);
  return { document, window, core, panels, metrics };
}

function panelFixture() {
  return '<section id="git-details-panel"><div class="panel-body"></div></section><div id="full-git-mount"></div><section id="project-structure-panel"><div class="panel-body"></div></section><div id="full-tree-mount"></div><section id="codegraph-panel"><div class="panel-body"></div></section><dialog id="codegraph-dialog"><h2 id="codegraph-dialog-title"></h2><p id="codegraph-dialog-description"></p><div id="codegraph-dialog-content"></div><button type="button" data-codegraph-close>Cerrar</button></dialog><dialog id="git-detail-dialog"><span id="git-detail-hash"></span><span id="git-detail-kind"></span><div id="git-detail-msg"></div><strong id="git-detail-branch"></strong><code id="git-detail-full-hash"></code><span id="git-detail-sync"></span><button type="button" data-git-close>Cerrar</button></dialog>';
}

describe('panels — file existence and portability', () => {
  it('modules/05-panels.js exists and no forbidden APIs', () => {
    const js = readFileSync(panelsPath, 'utf-8');
    const withoutComments = js.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/fetch\s*\(/.test(withoutComments), false);
    assert.equal(/XMLHttpRequest/.test(withoutComments), false);
    assert.equal(/\bimport\s+.*from/.test(withoutComments), false);
    assert.equal(/import\s*\(/.test(withoutComments), false);
  });
  it('loads TMPanel global', () => {
    const win = new Window({ settings: { enableJavaScriptEvaluation: true } });
    win.eval(readFileSync(corePath, 'utf-8'));
    win.eval(readFileSync(panelsPath, 'utf-8'));
    assert.equal(typeof win.TMPanel, 'object');
    assert.equal(typeof win.TMPanel.renderGit, 'function');
    assert.equal(typeof win.TMPanel.renderTree, 'function');
    assert.equal(typeof win.TMPanel.renderCodegraph, 'function');
  });
});

describe('panels — flag off→hidden; on+empty→sin datos', () => {
  it('flag off → panel hidden (absent)', () => {
    const stateOff = createState({ meta: { features: { git: false, tree: false, codegraph: false } }, git: { branch: 'main', commits: [{ hash: 'abc', message: 'msg' }], syncStatus: 'synced' }, tree: [{ name: 'src/', depth: 0, type: 'dir' }], codegraph: { nodes: [{ id: 'n1', label: 'A' }], edges: [] } });
    const { document } = mountWithPanels(stateOff);
    const gitPanel = document.getElementById('git-details-panel');
    const treePanel = document.getElementById('project-structure-panel');
    const cgPanel = document.getElementById('codegraph-panel');
    // Hidden via display none or hidden attribute
    assert.equal(gitPanel.style.display === 'none' || gitPanel.hasAttribute('hidden'), true, 'git panel should be hidden when flag off');
    assert.equal(treePanel.style.display === 'none' || treePanel.hasAttribute('hidden'), true);
    assert.equal(cgPanel.style.display === 'none' || cgPanel.hasAttribute('hidden'), true);
  });

  it('flag on + empty → sin datos placeholder', () => {
    const stateOnEmpty = createState({ meta: { features: { git: true, tree: true, codegraph: true } }, git: { branch: '', commits: [], syncStatus: '' }, tree: [], codegraph: { nodes: [], edges: [] } });
    const { document } = mountWithPanels(stateOnEmpty);
    const gitBody = document.getElementById('git-details-panel').querySelector('.panel-body');
    const treeBody = document.getElementById('project-structure-panel').querySelector('.panel-body');
    const cgBody = document.getElementById('codegraph-panel').querySelector('.panel-body');
    assert.equal(gitBody.textContent.includes('sin datos'), true, 'git empty should show sin datos');
    assert.equal(treeBody.textContent.includes('sin datos'), true);
    assert.equal(cgBody.textContent.includes('sin datos'), true);
    // Panels should be visible when flag on
    assert.equal(document.getElementById('git-details-panel').style.display !== 'none', true);
  });
});

describe('panels — optional guidance and Codegraph dialog', () => {
  it('renders escaped Spanish guidance for empty optional datasets and partial Codegraph data', () => {
    const state = createState({ meta: { features: { git: true, tree: true, codegraph: true } }, git: {}, tree: [], codegraph: { nodes: [{ id: 'core', label: '<Core>', files: ['modules/02-core.js'], taskIds: ['T2-01'], details: 'uno\ndos\ntres\ncuatro\ncinco' }], edges: [] } });
    const { document } = mountWithPanels(state);
    for (const id of ['git-details-panel', 'project-structure-panel']) assert.match(document.getElementById(id).textContent, /JSON/);
    const graph = document.getElementById('codegraph-panel');
    assert.match(graph.textContent, /relaciones explícitas/i);
    assert.equal(graph.querySelector('core'), null, 'hostile labels must remain text, not markup');
  });

  it('opens native dialog by click, Enter, and Space, exposes only explicit neighbors, and restores focus on close', () => {
    const state = createState({ meta: { features: { codegraph: true } }, codegraph: { nodes: [{ id: 'core', label: 'Core', files: ['modules/02-core.js'], taskIds: ['T2-01'], details: 'uno\ndos\ntres\ncuatro\ncinco' }, { id: 'panels', label: 'Panels' }, { id: 'unrelated', label: 'No relation' }], edges: [{ from: 'core', to: 'panels', label: 'usa', details: 'detalle' }] } });
    const { document, window, panels } = mountWithPanels(state);
    const node = document.querySelector('[data-codegraph-node="core"]');
    assert.equal(node.getAttribute('role'), 'button');
    for (const event of [new window.MouseEvent('click', { bubbles: true }), new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }), new window.KeyboardEvent('keydown', { key: ' ', bubbles: true })]) node.dispatchEvent(event);
    const dialog = document.getElementById('codegraph-dialog');
    assert.equal(dialog.dataset.open, 'true');
    assert.match(dialog.textContent, /Panels/);
    assert.equal(dialog.textContent.includes('No relation'), false);
    assert.match(dialog.textContent, /cinco/);
    const close = dialog.querySelector('[data-codegraph-close]');
    close.focus();
    const tab = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog.dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, true);
    assert.equal(dialog.contains(document.activeElement), true);
    panels.closeCodegraphDialog(document);
    assert.equal(document.activeElement, node);
    panels.renderAllPanels(state, document);
    assert.equal(document.querySelectorAll('#codegraph-dialog').length, 1);
  });
});

describe('panels — git snapshot verbatim, zero runtime calls; tree depth; codegraph SVG+legend', () => {
  it('git snapshot verbatim, zero runtime calls (no fetch)', () => {
    const state = createState({
      meta: { features: { git: true } },
      git: { branch: 'feature/test', commits: [{ hash: 'abc123def456', message: 'feat: init' }, { hash: 'def456', message: 'fix: bug' }], syncStatus: 'synced' }
    });
    const { document } = mountWithPanels(state);
    const body = document.getElementById('git-details-panel').querySelector('.panel-body');
    assert.equal(body.innerHTML.includes('feature/test'), true, 'branch should appear verbatim');
    assert.equal(body.innerHTML.includes('abc123'), true, 'short hash should appear');
    assert.equal(body.innerHTML.includes('feat: init'), true);
    assert.equal(body.innerHTML.includes('fix: bug'), true);
    assert.equal(body.innerHTML.includes('synced'), true);
    // Ensure no fetch/XHR text in rendered body
    assert.equal(body.innerHTML.includes('fetch'), false);
  });

  it('tree depth indent (14px per level)', () => {
    const state = createState({
      meta: { features: { tree: true } },
      tree: [
        { name: 'src/', depth: 0, type: 'dir' },
        { name: 'components/', depth: 1, type: 'dir' },
        { name: 'Button.tsx', depth: 2, type: 'file' },
        { name: 'README.md', depth: 0, type: 'file' },
      ]
    });
    const { document } = mountWithPanels(state);
    const body = document.getElementById('project-structure-panel').querySelector('.panel-body');
    const nodes = body.querySelectorAll('.tree-node');
    assert.equal(nodes.length, 4);
    // Check indent via style padding-left
    assert.equal(nodes[0].style.paddingLeft, '0px');
    assert.equal(nodes[1].style.paddingLeft, '14px');
    assert.equal(nodes[2].style.paddingLeft, '28px');
    assert.equal(nodes[3].style.paddingLeft, '0px');
    // Check dir vs file class
    assert.equal(nodes[0].classList.contains('dir'), true);
    assert.equal(nodes[2].classList.contains('dir'), false);
  });

  it('codegraph SVG+legend', () => {
    const state = createState({
      meta: { features: { codegraph: true } },
      codegraph: { nodes: [{ id: 'n1', label: 'Auth' }, { id: 'n2', label: 'DB' }], edges: [{ from: 'n1', to: 'n2' }] }
    });
    const { document } = mountWithPanels(state);
    const body = document.getElementById('codegraph-panel').querySelector('.panel-body');
    const svg = body.querySelector('svg.codegraph-svg');
    assert.notEqual(svg, null, 'SVG should exist');
    const nodes = svg.querySelectorAll('g.graph-node');
    assert.equal(nodes.length, 2, 'should have 2 nodes');
    const nodeBgs = svg.querySelectorAll('circle.node-bg');
    assert.equal(nodeBgs.length, 2, 'should have 2 node circles');
    const paths = svg.querySelectorAll('path.graph-edge');
    assert.equal(paths.length, 1, 'should have 1 curved edge path');
    const legend = body.querySelector('.graph-legend');
    assert.notEqual(legend, null);
    assert.equal(legend.textContent.includes('Nodo'), true);
    assert.equal(legend.textContent.includes('Dependencia'), true);
    assert.equal(legend.textContent.includes('2 nodos'), true);
  });

  it('lays Codegraph nodes across multiple rows with curved edges and richer centered details', () => {
    const state = createState({
      meta: { features: { codegraph: true } },
      codegraph: {
        nodes: [
          { id: 'a', label: 'Skeleton', files: ['modules/01-skeleton.html'], taskIds: ['T1'], details: 'Shell details' },
          { id: 'b', label: 'Core', files: ['modules/02-core.js'], taskIds: ['T2'], details: 'Core details' },
          { id: 'c', label: 'HUD', files: ['modules/03-header-hud.js'], taskIds: ['T3'], details: 'HUD details' },
          { id: 'd', label: 'Phases', files: ['modules/04-phases.js'], taskIds: ['T4'], details: 'Phase details' },
          { id: 'e', label: 'Panels', files: ['modules/05-panels.js'], taskIds: ['T5'], details: 'Panel details' },
          { id: 'f', label: 'Help', files: ['modules/06-todo-help.js'], taskIds: ['T6'], details: 'Help details' },
        ],
        edges: [{ from: 'a', to: 'b', label: 'boots', details: 'A to B' }, { from: 'b', to: 'c', label: 'derives', details: 'B to C' }],
      },
    });
    const { document, window } = mountWithPanels(state);
    const nodes = [...document.querySelectorAll('.graph-node')];
    const yValues = new Set(nodes.map((node) => node.getAttribute('transform').match(/,([\d.]+)\)/)?.[1]));
    assert.equal(yValues.size > 1, true, 'graph must not remain a straight line');
    assert.equal(document.querySelectorAll('path.graph-edge').length, 2, 'edges should use curved paths');
    nodes[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const dialog = document.getElementById('codegraph-dialog');
    assert.equal(dialog.classList.contains('codegraph-dialog-large'), true);
    assert.match(dialog.textContent, /1 relación/i);
    assert.match(dialog.textContent, /boots/i);
    assert.match(dialog.textContent, /modules\/01-skeleton\.html/i);
    assert.match(dialog.textContent, /Shell details/i);
  });

  it('adds truthful blueprint and Git timeline summaries without inventing dates or authors', () => {
    const state = createState({
      meta: { features: { tree: true, git: true } },
      tree: [{ name: 'src/', depth: 0, type: 'dir' }, { name: 'components/', depth: 1, type: 'dir' }, { name: 'App.js', depth: 2, type: 'file' }],
      git: { branch: 'main', syncStatus: 'synced', commits: [{ hash: 'abc123def', message: 'feat: dashboard' }, { hash: 'def456abc', message: 'fix: layout' }] },
    });
    const { document } = mountWithPanels(state);
    const tree = document.getElementById('full-tree-mount');
    assert.match(tree.textContent, /2 carpetas/i);
    assert.match(tree.textContent, /1 archivo/i);
    assert.match(tree.textContent, /profundidad 2/i);
    const git = document.getElementById('full-git-mount');
    assert.match(git.textContent, /2 commits/i);
    assert.match(git.textContent, /feat/i);
    assert.match(git.textContent, /fix/i);
    assert.equal(/autor|author|fecha|date/i.test(git.textContent), false);
  });
});

describe('panels — wrong-type tree contained, core unaffected', () => {
  it('wrong-type tree (string) contained, does not throw, core metrics intact', () => {
    const state = createState({
      meta: { features: { tree: true, git: true } },
      phases: [{ id: 'p1', number: 1, title: 'Fase', status: 'pending', target: '', lead: '', tasks: [{ id: 'T1', title: 'T', status: 'completed', tag: '', note: '', owner: '', commit: '' }] }],
      tree: "not-an-array", // wrong type
      git: { branch: 'main', commits: [], syncStatus: '' }
    });
    // Need to bypass createState's deepMerge which would normalize tree? createState does deepClone, but if we override tree with string, it will be string
    // Force wrong type
    state.tree = "not-an-array";
    const { document, core } = mountWithPanels(state);
    // Should not throw, tree panel should show sin datos or error contained
    const treeBody = document.getElementById('project-structure-panel').querySelector('.panel-body');
    assert.equal(treeBody.textContent.includes('sin datos'), true, 'wrong type should show sin datos');
    // Core metrics should still be correct: 1 completed of 1 => 100%
    const metrics = core.deriveMetrics(state);
    assert.equal(metrics.overallPct, 100);
    assert.equal(metrics.total, 1);
    // Git panel should still render correctly (not affected by tree error)
    const gitPanel = document.getElementById('git-details-panel');
    assert.equal(gitPanel.style.display !== 'none', true, 'git panel should still be visible');
  });

  it('wrong-type tree entries individually contained', () => {
    const state = createState({
      meta: { features: { tree: true } },
      tree: [
        { name: 'valid/', depth: 0, type: 'dir' },
        null,
        { notName: 'invalid' },
        { name: 'also-valid', depth: 1, type: 'file' },
      ]
    });
    const { document } = mountWithPanels(state);
    const body = document.getElementById('project-structure-panel').querySelector('.panel-body');
    const nodes = body.querySelectorAll('.tree-node');
    // Should have 2 valid nodes, invalid ones skipped
    assert.equal(nodes.length, 2);
  });

  it('codegraph with malformed edge does not crash', () => {
    const state = createState({
      meta: { features: { codegraph: true } },
      codegraph: { nodes: [{ id: 'n1', label: 'A' }], edges: [{ from: 'n1', to: 'nonexistent' }, null, { bad: true }] }
    });
    const { document } = mountWithPanels(state);
    const body = document.getElementById('codegraph-panel').querySelector('.panel-body');
    // Should still have SVG with 1 node, 0 valid edges (second edge invalid)
    const svg = body.querySelector('svg');
    assert.notEqual(svg, null);
    // Should not throw
  });

  it('opens detailed git commit dialog on commit event click and closes cleanly', () => {
    const state = createState({
      meta: { features: { git: true }, branch: 'main' },
      git: {
        branch: 'main',
        syncStatus: 'Sincronizado',
        commits: [{ hash: 'a1b2c3d4e5f6', message: 'feat: esqueleto base + tokens' }]
      }
    });
    const { document } = mountWithPanels(state);

    const dialog = document.getElementById('git-detail-dialog');
    assert.notEqual(dialog, null, 'git detail dialog must exist');

    const gitCard = document.querySelector('.git-event-card');
    assert.notEqual(gitCard, null);
    gitCard.click();

    assert.equal(dialog.dataset.open, 'true');
    assert.equal(dialog.querySelector('#git-detail-hash').textContent, 'a1b2c3d');
    assert.match(dialog.querySelector('#git-detail-msg').textContent, /esqueleto base/);
    assert.equal(dialog.querySelector('#git-detail-branch').textContent, 'main');

    dialog.querySelector('[data-git-close]').click();
    assert.equal(dialog.dataset.open, 'false');
  });
});
