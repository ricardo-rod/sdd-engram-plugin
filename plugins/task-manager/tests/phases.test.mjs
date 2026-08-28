// @ts-nocheck
// tests/phases.test.mjs — Phases accordion, tasks, filters (PR4)
// Happy-dom + classic script eval

import { describe, it, before } from 'node:test';
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
const phasesPath = path.join(projectRoot, 'modules', '04-phases.js');

function mountWithPhases(state) {
  const html = readSkeleton();
  const { document, window } = createDom(html);
  const coreJs = readFileSync(corePath, 'utf-8');
  const hudJs = readFileSync(headerHudPath, 'utf-8');
  const phasesJs = readFileSync(phasesPath, 'utf-8');

  // Evaluate in window context
  const g = globalThis;
  const prevWindow = g.window;
  g.window = window;
  try {
    window.eval(coreJs);
    window.eval(hudJs);
    window.eval(phasesJs);
  } catch (e) {
    // fallback via global eval
    eval(coreJs);
    eval(hudJs);
    eval(phasesJs);
    window.TMCore = globalThis.TMCore;
    window.TMHeaderHud = globalThis.TMHeaderHud;
    window.TMPhases = globalThis.TMPhases;
  } finally {
    if (prevWindow === undefined) delete g.window; else g.window = prevWindow;
  }

  // Derive metrics and render phases
  const core = window.TMCore || g.TMCore;
  const phases = window.TMPhases || g.TMPhases;
  const metrics = core.deriveMetrics(state);
  phases.renderPhases(state, metrics, document);

  return { document, window, core, hud: window.TMHeaderHud || g.TMHeaderHud, phases: window.TMPhases || g.TMPhases, metrics };
}

describe('phases — file existence and portability', () => {
  it('modules/04-phases.js exists and no forbidden APIs', () => {
    const js = readFileSync(phasesPath, 'utf-8');
    const withoutComments = js.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/fetch\s*\(/.test(withoutComments), false);
    assert.equal(/XMLHttpRequest/.test(withoutComments), false);
    assert.equal(/\bimport\s+.*from/.test(withoutComments), false);
    assert.equal(/import\s*\(/.test(withoutComments), false);
  });
  it('loads TMPhases global', () => {
    const js = readFileSync(phasesPath, 'utf-8');
    const g = globalThis;
    const prevWindow = g.window;
    const win = new Window({ settings: { enableJavaScriptEvaluation: true } });
    g.window = win;
    try {
      win.eval(readFileSync(corePath, 'utf-8'));
      win.eval(js);
      assert.equal(typeof win.TMPhases, 'object');
      assert.equal(typeof win.TMPhases.renderPhases, 'function');
    } finally {
      if (prevWindow === undefined) delete g.window; else g.window = prevWindow;
    }
  });
});

describe('phases — ordered sections+badges; full row fields', () => {
  it('renders phases in order with correct badges and full task row fields', () => {
    const state = createState({
      phases: [
        { id: 'phase-1', number: 1, title: 'Primera Fase', status: 'completed', target: 'Q1', lead: 'Ana', tasks: [
          { id: 'T1-01', title: 'Tarea Uno', status: 'completed', tag: 'Backend', note: 'nota segura', owner: 'Ana', commit: 'abc123' },
        ]},
        { id: 'phase-2', number: 2, title: 'Segunda Fase', status: 'in-progress', target: 'Q2', lead: 'Luis', tasks: [
          { id: 'T2-01', title: 'Tarea Dos', status: 'in-progress', tag: 'Frontend', note: 'otra nota', owner: 'Luis', commit: 'def456' },
        ]},
      ]
    });
    const { document } = mountWithPhases(state);
    const cards = document.querySelectorAll('.phase-card');
    assert.equal(cards.length, 2, 'should have 2 phase cards');
    // Order check
    assert.equal(cards[0].querySelector('.phase-title-text').textContent.includes('Primera Fase'), true);
    assert.equal(cards[1].querySelector('.phase-title-text').textContent.includes('Segunda Fase'), true);

    // Badge check
    const badge1 = cards[0].querySelector('.phase-status-badge');
    assert.equal(badge1.textContent.includes('Completado'), true);
    assert.equal(badge1.classList.contains('badge-completed'), true);
    const badge2 = cards[1].querySelector('.phase-status-badge');
    assert.equal(badge2.textContent.includes('En Progreso'), true);
    assert.equal(badge2.classList.contains('badge-inprogress'), true);

    // Full row fields for first task
    const task1 = document.querySelector('#phases-list [data-task-id="T1-01"]');
    assert.notEqual(task1, null);
    assert.equal(task1.querySelector('.task-id').textContent.includes('T1-01'), true);
    assert.equal(task1.querySelector('.task-title').textContent.includes('Tarea Uno'), true);
    assert.equal(task1.querySelector('.badge-tag').textContent, 'Backend');
    assert.equal(task1.querySelector('.task-note').textContent, 'nota segura');
    assert.equal(task1.querySelector('.task-owner-pill').textContent.includes('Ana'), true);
    assert.equal(task1.innerHTML.includes('abc123'), true);

    // Check phase meta bar target/lead
    const metaBar = cards[0].querySelector('.phase-meta-bar');
    assert.equal(metaBar.textContent.includes('Q1'), true);
    assert.equal(metaBar.textContent.includes('Ana'), true);
  });

  it('renders sub-tasks checklist and blocker notices within task rows', () => {
    const state = createState({
      phases: [{
        id: 'phase-sub',
        number: 1,
        title: 'Fase con subtareas',
        status: 'in-progress',
        tasks: [{
          id: 'T-SUB-01',
          title: 'Tarea principal con subtareas',
          status: 'in-progress',
          blockedReason: 'Falta credencial de staging',
          subtasks: [
            { id: 'ST-1', title: 'Sub-tarea uno completada', status: 'completed', done: true },
            { id: 'ST-2', title: 'Sub-tarea dos en curso', status: 'in-progress', done: false }
          ]
        }]
      }]
    });
    const { document } = mountWithPhases(state);
    const taskEl = document.querySelector('#phases-list [data-task-id="T-SUB-01"]');
    assert.notEqual(taskEl, null);
    const subtasksBox = taskEl.querySelector('.task-subtasks-box');
    assert.notEqual(subtasksBox, null, 'task-subtasks-box must be rendered');
    assert.equal(subtasksBox.textContent.includes('Sub-tareas (1/2)'), true);
    assert.equal(subtasksBox.querySelectorAll('.task-subtask-item').length, 2);

    const blocker = taskEl.querySelector('.task-blocker-notice');
    assert.notEqual(blocker, null);
    assert.equal(blocker.textContent.includes('Falta credencial de staging'), true);
  });
});

describe('phases — overview read-only mirrors', () => {
  it('renders Kanban first and phases second in Overview without duplicate IDs or controls', () => {
    const state = createState({ phases: [{ id: 'p1', number: 1, title: 'Entrega', status: 'in-progress', tasks: [
      { id: 'T1', title: 'Activa', status: 'in-progress', owner: 'Ana', tag: 'UI' },
      { id: 'T2', title: 'Pendiente', status: 'pending', owner: 'Luis', tag: 'Core' },
    ] }] });
    const { document } = mountWithPhases(state);
    const overview = document.getElementById('view-overview');
    const kanban = document.getElementById('overview-kanban-section');
    const phases = document.getElementById('overview-phases-section');
    assert.notEqual(kanban, null);
    assert.notEqual(phases, null);
    assert.ok(kanban.compareDocumentPosition(phases) & 4, 'Overview Kanban must precede phases');
    assert.equal(kanban.querySelectorAll('.kanban-column').length, 4);
    assert.equal(phases.querySelectorAll('.overview-phase-row').length, 1);
    assert.equal(overview.querySelector('#task-filter-form'), null, 'Overview mirror must remain informational');
    const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
    assert.equal(new Set(ids).size, ids.length, 'Overview mirrors must not duplicate IDs');
  });
});

describe('phases — invalid status safe; 4 badge styles', () => {
  it('invalid status maps to pending safely with pending badge', () => {
    const state = createState({
      phases: [{ id: 'p1', number: 1, title: 'Fase', status: 'pending', target: '', lead: '', tasks: [
        { id: 'T1', title: 'Weird', status: 'weird-status', tag: 'X', note: '', owner: '', commit: '' }
      ]}]
    });
    const { document } = mountWithPhases(state);
    const task = document.querySelector('#phases-list [data-task-id="T1"]');
    assert.notEqual(task, null);
    assert.equal(task.getAttribute('data-status'), 'pending', 'unknown should map to pending');
    assert.equal(task.classList.contains('status-pending'), true);
    const badge = task.querySelector('.badge');
    assert.equal(badge.classList.contains('badge-pending'), true);
    assert.equal(badge.textContent.includes('Pendiente'), true);
  });

  it('four badge styles exist for each status', () => {
    const state = createState({
      phases: [{ id: 'p1', number: 1, title: 'Fase', status: 'pending', target: '', lead: '', tasks: [
        { id: 'T1', title: 'c', status: 'completed', tag: '', note: '', owner: '', commit: '' },
        { id: 'T2', title: 'p', status: 'pending', tag: '', note: '', owner: '', commit: '' },
        { id: 'T3', title: 'i', status: 'in-progress', tag: '', note: '', owner: '', commit: '' },
        { id: 'T4', title: 'b', status: 'blocked', tag: '', note: '', owner: '', commit: '' },
      ]}]
    });
    const { document } = mountWithPhases(state);
    assert.equal(document.querySelector('#phases-list [data-task-id="T1"]').classList.contains('status-completed'), true);
    assert.equal(document.querySelector('#phases-list [data-task-id="T2"]').classList.contains('status-pending'), true);
    assert.equal(document.querySelector('#phases-list [data-task-id="T3"]').classList.contains('status-inprogress'), true);
    assert.equal(document.querySelector('#phases-list [data-task-id="T4"]').classList.contains('status-blocked'), true);
    // Badge classes
    assert.equal(document.querySelector('#phases-list [data-task-id="T1"] .badge').classList.contains('badge-completed'), true);
    assert.equal(document.querySelector('#phases-list [data-task-id="T2"] .badge').classList.contains('badge-pending'), true);
    assert.equal(document.querySelector('#phases-list [data-task-id="T3"] .badge').classList.contains('badge-inprogress'), true);
    assert.equal(document.querySelector('#phases-list [data-task-id="T4"] .badge').classList.contains('badge-blocked'), true);
  });
});

describe('phases — toggle isolation; expand-all; progress; empty; filter', () => {
  it('toggle isolation: clicking one phase header does not affect others', () => {
    const state = createState({
      phases: [
        { id: 'p1', number: 1, title: 'Fase 1', status: 'pending', target: '', lead: '', tasks: [{ id: 'T1', title: 'T', status: 'pending', tag: '', note: '', owner: '', commit: '' }] },
        { id: 'p2', number: 2, title: 'Fase 2', status: 'pending', target: '', lead: '', tasks: [{ id: 'T2', title: 'T', status: 'pending', tag: '', note: '', owner: '', commit: '' }] },
      ]
    });
    const { document } = mountWithPhases(state);
    const cards = document.querySelectorAll('.phase-card');
    const header1 = cards[0].querySelector('.phase-header');
    const header2 = cards[1].querySelector('.phase-header');
    assert.equal(cards[0].classList.contains('collapsed'), false);
    assert.equal(cards[1].classList.contains('collapsed'), false);
    // Click first header
    header1.click();
    assert.equal(cards[0].classList.contains('collapsed'), true, 'first should collapse');
    assert.equal(cards[1].classList.contains('collapsed'), false, 'second should stay');
    // Click again to expand
    header1.click();
    assert.equal(cards[0].classList.contains('collapsed'), false);
    // Ensure island not mutated
    const island = document.getElementById('tm-state');
    const before = island.textContent;
    header1.click();
    assert.equal(island.textContent, before, 'island must not change on toggle');
  });

  it('expand-all button toggles all phases', () => {
    const state = createState({
      phases: [
        { id: 'p1', number: 1, title: 'F1', status: 'pending', target: '', lead: '', tasks: [] },
        { id: 'p2', number: 2, title: 'F2', status: 'pending', target: '', lead: '', tasks: [] },
      ]
    });
    const { document } = mountWithPhases(state);
    const btn = document.getElementById('btn-expand-all');
    assert.notEqual(btn, null, 'expand-all button must exist');
    const cards = document.querySelectorAll('.phase-card');
    // Initially expanded
    assert.equal(cards[0].classList.contains('collapsed'), false);
    btn.click();
    assert.equal(cards[0].classList.contains('collapsed'), true);
    assert.equal(cards[1].classList.contains('collapsed'), true);
    btn.click();
    assert.equal(cards[0].classList.contains('collapsed'), false);
    assert.equal(cards[1].classList.contains('collapsed'), false);
  });

  it('2/4 → 50% phase progress and 2/4→50% overall per phase', () => {
    const tasks = [
      { id: 'T1', title: 'c1', status: 'completed', tag: '', note: '', owner: '', commit: '' },
      { id: 'T2', title: 'c2', status: 'completed', tag: '', note: '', owner: '', commit: '' },
      { id: 'T3', title: 'p1', status: 'pending', tag: '', note: '', owner: '', commit: '' },
      { id: 'T4', title: 'p2', status: 'pending', tag: '', note: '', owner: '', commit: '' },
    ];
    const state = createState({ phases: [{ id: 'p1', number: 1, title: 'Fase', status: 'in-progress', target: '', lead: '', tasks }] });
    const { document } = mountWithPhases(state);
    const pctEl = document.querySelector('.phase-progress-pct');
    assert.notEqual(pctEl, null);
    assert.equal(pctEl.textContent.trim(), '50%');
    const bar = document.querySelector('.phase-bar');
    assert.equal(bar.style.width, '50%');
    const counter = document.querySelector('.phase-task-counter');
    assert.equal(counter.textContent.includes('2 / 4'), true);
  });

  it('empty phase → 0% and placeholder', () => {
    const state = createState({ phases: [{ id: 'p1', number: 1, title: 'Vacía', status: 'pending', target: '', lead: '', tasks: [] }] });
    const { document } = mountWithPhases(state);
    const pctEl = document.querySelector('.phase-progress-pct');
    assert.equal(pctEl.textContent.trim(), '0%');
    const bar = document.querySelector('.phase-bar');
    assert.equal(bar.style.width, '0%');
    const wrapper = document.querySelector('.phase-tasks-wrapper');
    assert.equal(wrapper.textContent.includes('Sin tareas'), true);
  });

  it('Active filter hides completed only, counters intact', () => {
    const state = createState({
      phases: [{ id: 'p1', number: 1, title: 'Fase', status: 'pending', target: '', lead: '', tasks: [
        { id: 'T1', title: 'done', status: 'completed', tag: '', note: '', owner: '', commit: '' },
        { id: 'T2', title: 'pending', status: 'pending', tag: '', note: '', owner: '', commit: '' },
        { id: 'T3', title: 'active', status: 'in-progress', tag: '', note: '', owner: '', commit: '' },
      ]}]
    });
    const { document } = mountWithPhases(state);
    const counterBefore = document.querySelector('.phase-task-counter').textContent;
    assert.equal(counterBefore.includes('1 / 3'), true, 'counter should be 1/3 before filter');

    const btnActive = document.getElementById('btn-filter-active');
    const btnAll = document.getElementById('btn-filter-all');
    assert.notEqual(btnActive, null);
    assert.notEqual(btnAll, null);

    btnActive.click();
    const taskCompleted = document.querySelector('#phases-list [data-task-id="T1"]');
    const taskPending = document.querySelector('#phases-list [data-task-id="T2"]');
    const taskActive = document.querySelector('#phases-list [data-task-id="T3"]');
    assert.equal(taskCompleted.style.display, 'none', 'completed should be hidden');
    assert.equal(taskPending.style.display, '', 'pending should be visible');
    assert.equal(taskActive.style.display, '', 'active should be visible');

    // Counters intact after filter
    const counterAfter = document.querySelector('.phase-task-counter').textContent;
    assert.equal(counterAfter, counterBefore, 'counters must stay intact after filter');

    // All filter shows all again
    btnAll.click();
    assert.equal(taskCompleted.style.display, '', 'completed should be visible again');
  });

  it('persists filter preferences only through the shared tm-ui-preferences boundary', () => {
    const { document, window } = mountWithPhases(createState());
    document.getElementById('btn-filter-active').click();
    assert.equal(window.localStorage.getItem('tm-filter'), null);
    const preferences = JSON.parse(window.localStorage.getItem('tm-ui-preferences'));
    assert.equal(preferences.filters.status, 'active');
    assert.equal(readFileSync(phasesPath, 'utf-8').includes("'tm-filter'"), false);
  });

  it('escapes HTML in phase/task fields to prevent injection', () => {
    const state = createState({
      phases: [{ id: 'p1', number: 1, title: '<script>alert(1)</script>', status: 'pending', target: '', lead: '', tasks: [
        { id: 'T1', title: '<img onerror=alert(1)>', status: 'pending', tag: '<b>tag</b>', note: '<a>note</a>', owner: '<i>owner</i>', commit: '' }
      ]}]
    });
    const { document } = mountWithPhases(state);
    const titleEl = document.querySelector('.phase-title-text');
    assert.equal(titleEl.innerHTML.includes('<script>'), false, 'phase title should be escaped');
    assert.equal(titleEl.textContent.includes('<script>'), true, 'textContent should show literal');
    const taskTitle = document.querySelector('.task-title');
    assert.equal(taskTitle.innerHTML.includes('<img'), false);
    const noteEl = document.querySelector('.task-note');
    assert.equal(noteEl.innerHTML.includes('<a>'), false);
  });

  it('applies text, status, owner, tag, and phase as one AND filter across list and Kanban', () => {
    const state = createState({ phases: [
      { id: 'p1', number: 1, title: 'Core Phase', status: 'in-progress', tasks: [
        { id: 'T1', title: 'Core API', note: 'match', status: 'in-progress', owner: 'AI', tag: 'Core' },
        { id: 'T2', title: 'Core UI', note: '', status: 'in-progress', owner: 'Dev', tag: 'UI' },
        { id: 'T3', title: 'Core done', note: '', status: 'completed', owner: 'AI', tag: 'Core' },
      ] },
      { id: 'p2', number: 2, title: 'Docs Phase', status: 'pending', tasks: [
        { id: 'T4', title: 'Core docs', note: '', status: 'pending', owner: 'AI', tag: 'Core' },
        { id: 'T5', title: 'Other', note: '', status: 'blocked', owner: 'Ops', tag: 'Infra' },
      ] },
    ] });
    const { document, phases } = mountWithPhases(state);
    const set = (id, value, eventName = 'input') => {
      const control = document.getElementById(id);
      assert.notEqual(control, null, id + ' must exist');
      control.value = value;
      control.dispatchEvent(new document.defaultView.Event(eventName, { bubbles: true }));
    };
    set('task-filter-text', 'core');
    set('task-filter-status', 'in-progress', 'change');
    set('task-filter-owner', 'AI', 'change');
    set('task-filter-tag', 'Core', 'change');
    set('task-filter-phase', 'p1', 'change');

    const visibleList = [...document.querySelectorAll('#phases-list .task-item')].filter((el) => el.style.display !== 'none');
    const visibleKanban = [...document.querySelectorAll('#kanban-board-mount .task-item')].filter((el) => el.style.display !== 'none');
    assert.equal(visibleList.length, 1);
    assert.equal(visibleKanban.length, 1);
    assert.equal(document.getElementById('filter-result-count').textContent.includes('1 / 5'), true);
    assert.equal(document.querySelector('.phase-task-counter').textContent.includes('1 / 3'), true);
    assert.equal(phases.getFilterState(document).status, 'in-progress');
  });

  it('announces zero matches and reset restores every task without changing global counters', () => {
    const state = createState({ phases: [{ id: 'p1', number: 1, title: 'Phase', status: 'pending', tasks: [
      { id: 'T1', title: 'One', status: 'completed', owner: 'A', tag: 'X' },
      { id: 'T2', title: 'Two', status: 'pending', owner: 'B', tag: 'Y' },
    ] }] });
    const { document } = mountWithPhases(state);
    const before = document.querySelector('.phase-task-counter').textContent;
    const input = document.getElementById('task-filter-text');
    input.value = 'nonexistent-query-xyz';
    input.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
    assert.equal(document.getElementById('filter-empty-state').hidden, false);
    assert.equal(document.getElementById('filter-empty-state').textContent.includes('No se encontraron tareas coincidentes'), true);
    assert.equal(document.getElementById('filter-result-count').textContent.includes('0 / 2'), true);
    document.getElementById('task-filter-reset').click();
    assert.equal([...document.querySelectorAll('#phases-list .task-item')].filter((el) => el.style.display !== 'none').length, 2);
    assert.equal(document.querySelector('.phase-task-counter').textContent, before);
  });
});

describe('phases — dedicated detail ownership and preview controls', () => {
  it('renders detail only in the dedicated Phases mount, previews long notes, and toggles E both ways', () => {
    const note = 'one\ntwo\nthree\nfour\nfive';
    const state = createState({ phases: [{ id: 'p1', number: 1, title: 'Detailed', status: 'pending', tasks: [
      { id: 'T1', title: 'Long note', status: 'pending', note, owner: 'Dev', tag: 'core', commit: 'abc1234' },
    ] }] });
    const { document, window, hud, phases } = mountWithPhases(state);
    hud.setupNavTabs(document);
    phases.renderPhases(state, undefined, document);

    const mount = document.getElementById('full-phases-mount');
    const task = mount.querySelector('[data-task-id="T1"]');
    assert.notEqual(task, null, 'dedicated mount owns the task');
    assert.notEqual(document.getElementById('view-overview').querySelector('[data-task-id="T1"]'), null, 'Overview owns a read-only task mirror');
    assert.equal(task.querySelector('[data-note-preview]').getAttribute('data-note-lines'), '3');
    const noteToggle = task.querySelector('[data-note-toggle]');
    noteToggle.click();
    assert.equal(task.querySelector('[data-note-preview]').textContent.includes('four'), true);
    document.getElementById('btn-expand-all').click();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'E', bubbles: true }));
    assert.equal(mount.querySelector('.phase-card').classList.contains('collapsed'), false);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'E', bubbles: true }));
    assert.equal(mount.querySelector('.phase-card').classList.contains('collapsed'), true);
    const search = document.getElementById('task-filter-text');
    search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'E', bubbles: true }));
    assert.equal(mount.querySelector('.phase-card').classList.contains('collapsed'), true, 'editable controls ignore E');
  });

  it('opens rich task detail dialog on task click in phases, overview, and kanban', () => {
    const state = createState({
      phases: [{
        id: 'p1', number: 1, title: 'Fase Core', status: 'in-progress', target: 'Sprint 1', lead: 'sdd-tasks', tasks: [
          {
            id: 'T1-01', title: 'Implementar parser reactivo', status: 'in-progress',
            owner: 'sdd-apply', tag: 'Backend', commit: 'abc1234', note: 'Nota técnica detallada',
            blockedReason: 'Falta aprobacion',
            subtasks: [
              { id: 'ST1-1', title: 'Modelar esquema', status: 'completed', done: true },
              { id: 'ST1-2', title: 'Validar tipos', status: 'pending', done: false }
            ]
          }
        ]
      }]
    });
    const { document, phases } = mountWithPhases(state);
    phases.renderPhases(state, undefined, document);

    const dialog = document.getElementById('task-detail-dialog');
    assert.notEqual(dialog, null, 'task detail dialog must exist');

    // Click on task item in phases list
    const taskItem = document.querySelector('#phases-list .task-item');
    assert.notEqual(taskItem, null);
    taskItem.click();

    assert.equal(dialog.dataset.open, 'true');
    assert.equal(dialog.querySelector('#task-detail-id').textContent, 'T1-01');
    assert.equal(dialog.querySelector('#task-detail-owner').textContent, 'sdd-apply');
    assert.match(dialog.querySelector('#task-detail-note').textContent, /Nota técnica/);
    assert.match(dialog.querySelector('#task-detail-blocker-text').textContent, /Falta aprobacion/);
    assert.equal(dialog.querySelectorAll('.task-detail-subtask-row').length, 2);

    // Close dialog
    dialog.querySelector('[data-task-close]').click();
    assert.equal(dialog.dataset.open, 'false');

    // Click on Kanban task card
    const kanbanCard = document.querySelector('#kanban-board-mount .task-item');
    if (kanbanCard) {
      kanbanCard.click();
      assert.equal(dialog.dataset.open, 'true');
      dialog.querySelector('[data-task-close]').click();
    }
  });
});
