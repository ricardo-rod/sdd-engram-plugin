// @ts-nocheck
// tests/todo-help.test.mjs — Todo + Help (PR6)

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
const todoHelpPath = path.join(projectRoot, 'modules', '06-todo-help.js');
const hudPath = path.join(projectRoot, 'modules', '03-header-hud.js');
const assemblePath = path.join(projectRoot, 'scripts', 'assemble.mjs');
const portabilityPath = path.join(projectRoot, 'scripts', 'scan-portability.mjs');

function mountWithTodoHelp(state) {
  const html = readSkeleton();
  const { document, window } = createDom(html);
  window.eval(readFileSync(corePath, 'utf-8'));
  window.eval(readFileSync(hudPath, 'utf-8'));
  window.eval(readFileSync(todoHelpPath, 'utf-8'));
  const core = window.TMCore;
  const todoHelp = window.TMTodoHelp;
  todoHelp.renderAllTodoHelp(state, document);
  return { document, window, core, todoHelp };
}

function mountWithTodoHelpState(state, rawState) {
  const html = readSkeleton();
  const { document, window } = createDom(html, rawState === undefined ? state : rawState);
  window.eval(readFileSync(corePath, 'utf-8'));
  window.eval(readFileSync(hudPath, 'utf-8'));
  window.eval(readFileSync(todoHelpPath, 'utf-8'));
  const core = window.TMCore;
  const todoHelp = window.TMTodoHelp;
  todoHelp.renderAllTodoHelp(state, document, state ? core.validateState(state) : undefined);
  return { document, window, core, todoHelp };
}

describe('todo-help — file existence and portability', () => {
  it('modules/06-todo-help.js exists and no forbidden APIs', () => {
    const js = readFileSync(todoHelpPath, 'utf-8');
    const withoutComments = js.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/fetch\s*\(/.test(withoutComments), false);
    assert.equal(/XMLHttpRequest/.test(withoutComments), false);
    assert.equal(/\bimport\s+.*from/.test(withoutComments), false);
    assert.equal(/import\s*\(/.test(withoutComments), false);
  });
  it('loads TMTodoHelp global', () => {
    const win = new Window({ settings: { enableJavaScriptEvaluation: true } });
    win.eval(readFileSync(corePath, 'utf-8'));
    win.eval(readFileSync(todoHelpPath, 'utf-8'));
    assert.equal(typeof win.TMTodoHelp, 'object');
    assert.equal(typeof win.TMTodoHelp.renderTodo, 'function');
    assert.equal(typeof win.TMTodoHelp.renderHelp, 'function');
  });
});

describe('todo-help — todo text/priority/done visuals', () => {
  it('renders todos with text, priority badge and done state', () => {
    const state = createState({
      todos: [
        { id: 'td-1', text: 'Revisar tokens', priority: 'P0', done: false },
        { id: 'td-2', text: 'Hecho finalizado', priority: 'P1', done: true },
        { id: 'td-3', text: 'Normal', priority: 'P2', done: false },
      ]
    });
    const { document } = mountWithTodoHelp(state);
    const items = document.querySelectorAll('.todo-item');
    assert.equal(items.length, 3);
    // Check text
    assert.equal(document.querySelector('[data-id="td-1"] .todo-text').textContent, 'Revisar tokens');
    assert.equal(document.querySelector('[data-id="td-2"] .todo-text').textContent, 'Hecho finalizado');
    // Priority badges
    const badge1 = document.querySelector('[data-id="td-1"] .badge');
    assert.equal(badge1.classList.contains('badge-blocked'), true, 'P0 should be blocked red');
    assert.equal(badge1.textContent.includes('P0'), true);
    const badge2 = document.querySelector('[data-id="td-2"] .badge');
    assert.equal(badge2.classList.contains('badge-completed'), true, 'P1 should be completed green');
    const badge3 = document.querySelector('[data-id="td-3"] .badge');
    assert.equal(badge3.classList.contains('badge-pending'), true, 'P2 should be pending');

    // Done visuals remain semantic/read-only without an interactive checkbox.
    const doneItem = document.querySelector('[data-id="td-2"]');
    assert.equal(doneItem.classList.contains('done'), true);
    const pendingItem = document.querySelector('[data-id="td-1"]');
    assert.equal(pendingItem.classList.contains('done'), false);
    assert.equal(doneItem.querySelector('input, button'), null);
  });

  it('keeps Quick Tasks explicitly read-only with no mutation controls', () => {
    const { document } = mountWithTodoHelp(createState({ todos: [{ id: 'td-1', text: 'Observe only', priority: 'P1', done: false }] }));
    const item = document.querySelector('.todo-item');
    assert.notEqual(item, null);
    assert.equal(item.querySelector('input[type="checkbox"]'), null);
    assert.equal(item.querySelector('button'), null);
    assert.equal(item.textContent.includes('Informativo'), true);
  });

  it('presents todos as informational attention signals rather than terminal actions', () => {
    const { document } = mountWithTodoHelp(createState({ todos: [{ id: 'td-1', text: 'Review risk', priority: 'P0', done: false }] }));
    const panel = document.getElementById('todo-scratchpad-panel');
    assert.match(panel.textContent, /Señales de Atención/i);
    assert.match(panel.textContent, /informativo/i);
    assert.equal(/ejecutar|terminal/i.test(panel.textContent), false);
    assert.equal(panel.querySelector('input, .todo-item button'), null);
  });

  it('empty todos shows placeholder sin datos', () => {
    const state = createState({ todos: [] });
    const { document } = mountWithTodoHelp(state);
    const container = document.getElementById('todo-items-container');
    assert.equal(container.textContent.includes('Sin señales de atención'), true);
    const badge = document.getElementById('todo-count-badge');
    if (badge) assert.equal(badge.textContent.includes('0 señales'), true);
  });

  it('escapes HTML in todo text', () => {
    const state = createState({ todos: [{ id: 'td-1', text: '<script>alert(1)</script>', priority: 'P0', done: false }] });
    const { document } = mountWithTodoHelp(state);
    const textEl = document.querySelector('[data-id="td-1"] .todo-text');
    assert.equal(textEl.innerHTML.includes('<script>'), false, 'should escape');
    assert.equal(textEl.textContent.includes('<script>'), true);
  });

  it('opens detailed signal dialog with explanation and action guidance on todo click', () => {
    const state = createState({ todos: [{ id: 'td-1', text: 'Verificar compatibilidad offline', priority: 'P0', done: true }] });
    const { document } = mountWithTodoHelp(state);

    const dialog = document.getElementById('todo-detail-dialog');
    assert.notEqual(dialog, null, 'todo detail dialog must exist');

    const todoItem = document.querySelector('.todo-item');
    assert.notEqual(todoItem, null);
    todoItem.click();

    assert.equal(dialog.dataset.open, 'true');
    assert.equal(dialog.querySelector('#todo-detail-id').textContent, 'td-1');
    assert.match(dialog.querySelector('#todo-detail-title').textContent, /Verificar compatibilidad offline/);
    assert.match(dialog.querySelector('#todo-detail-desc').textContent, /Señales de Atención son alertas tempranas/);
    assert.match(dialog.querySelector('#todo-detail-action-guidance').textContent, /Nivel Crítico/);

    dialog.querySelector('[data-todo-close]').click();
    assert.equal(dialog.dataset.open, 'false');
  });
});

describe('todo-help — help shows copy/AI-update/schema + AI-instructions; labels override', () => {
  it('"?" help shows copy, AI-update, schema and explicit AI-instructions block', () => {
    const state = createState({ meta: { features: {}, labels: { es: {} } }, todos: [] });
    const { document } = mountWithTodoHelp(state);
    const help = document.getElementById('help-panel');
    assert.notEqual(help, null);
    const html = help.innerHTML;
    const text = help.textContent;

    // Copy section
    assert.equal(text.includes('Cómo copiar') || html.includes('Cómo copiar') || text.includes('Copiar'), true, 'help should show copy section');
    // AI update
    assert.equal(text.includes('Cómo la IA actualiza') || html.includes('Cómo la IA actualiza') || text.includes('IA actualiza'), true);
    // Schema
    assert.equal(text.includes('Esquema') || html.includes('Esquema') || html.includes('schemaVersion'), true);
    assert.equal(html.includes('schemaVersion'), true, 'schema should be visible');

    // Explicit AI-instructions block
    const aiBlock = document.getElementById('ai-instructions');
    assert.notEqual(aiBlock, null, 'AI instructions block must exist with id ai-instructions');
    const aiText = aiBlock.textContent;
    const aiHtml = aiBlock.innerHTML;
    assert.equal(aiText.includes('SOLO') || aiHtml.includes('SOLO'), true, 'should mention island-only');
    assert.equal(aiText.includes('schemaVersion') || aiHtml.includes('schemaVersion'), true);
    assert.equal(aiText.includes('\\u003c/script') || aiHtml.includes('\\u003c/script') || aiText.includes('u003c'), true, 'should mention escape');
    // Check that block mentions status values
    assert.equal(aiText.includes('pending') && aiText.includes('in-progress'), true);
    // Check that it mentions island id
    assert.equal(aiHtml.includes('tm-state') || aiText.includes('tm-state'), true);
  });

  it('meta.labels.es overrides filter and todo titles (Spanish defaults fallback)', () => {
    // Custom labels
    const stateCustom = createState({
      meta: { labels: { es: { todoTitle: 'Mis Pendientes', helpTitle: 'Ayuda Custom', filterAll: 'Todo', filterActive: 'Solo Activas' } }, features: {} },
      todos: []
    });
    const { document: docCustom } = mountWithTodoHelp(stateCustom);
    const helpCustom = docCustom.getElementById('help-panel');
    assert.equal(helpCustom.textContent.includes('Ayuda Custom'), true, 'should use custom helpTitle');
    assert.equal(helpCustom.textContent.includes('Solo Activas') || helpCustom.innerHTML.includes('Solo Activas'), true, 'should use custom filterActive label');

    // Default Spanish fallback when no labels
    const stateDefault = createState({ meta: { labels: { es: {} }, features: {} }, todos: [] });
    const { document: docDefault } = mountWithTodoHelp(stateDefault);
    const helpDefault = docDefault.getElementById('help-panel');
    // Should fallback to default help title
    assert.equal(helpDefault.textContent.includes('Ayuda') || helpDefault.innerHTML.includes('Ayuda'), true);
    // Default todo placeholder should be Spanish
    const todoContainer = docDefault.getElementById('todo-items-container');
    // Already tested placeholder Spanish, but also check that help contains Spanish defaults
    assert.equal(helpDefault.textContent.includes('Cómo usar') || helpDefault.textContent.includes('Cómo copiar') || helpDefault.innerHTML.includes('Cómo'), true);
  });

  it('help panel hidden when features.help false', () => {
    const state = createState({ meta: { features: { help: false }, labels: { es: {} } } });
    const { document } = mountWithTodoHelp(state);
    const help = document.getElementById('help-panel');
    assert.equal(help.style.display === 'none' || help.hasAttribute('hidden'), true, 'help should be hidden when flag false');
  });

  it('help contains vibe-coder friendly copy-anywhere instructions', () => {
    const state = createState({ meta: { labels: { es: {} }, features: {} } });
    const { document } = mountWithTodoHelp(state);
    const help = document.getElementById('help-panel');
    const text = help.textContent;
    assert.equal(text.includes('Task-Manager-Portable.html') || text.includes('drop-in'), true);
    assert.equal(text.includes('file://'), true);
    assert.equal(text.includes('Doble clic') || text.includes('doble clic') || text.includes('Copiar'), true);
  });

  it('encapsulates portability documentation in a compact information card', () => {
    const { document } = mountWithTodoHelp(createState());
    const note = document.querySelector('.help-portability-note');
    assert.notEqual(note, null);
    assert.match(note.textContent, /file:\/\//i);
    assert.match(note.textContent, /openspec\/changes\/drop-in-task-manager\//i);
  });

  it('owns Help tools only in its dedicated view and copies the visible prompt with accessible feedback', async () => {
    const { document, window } = mountWithTodoHelp(createState());
    let copied = '';
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { copied = text; } } });
    const dedicated = document.getElementById('full-help-mount');
    const button = dedicated.querySelector('[data-copy-prompt]');
    const prompt = dedicated.querySelector('[data-help-prompt]');
    assert.notEqual(button, null);
    assert.equal(document.getElementById('view-overview').querySelector('[data-help-prompt]'), null);
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(copied, prompt.textContent);
    assert.equal(dedicated.querySelector('[data-copy-prompt-feedback]').getAttribute('role'), 'status');
    const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
    assert.equal(new Set(ids).size, ids.length, 'rendering must keep IDs unique');
  });

  it('keeps Help usable with manual-selection guidance when clipboard copying fails', async () => {
    const { document, window } = mountWithTodoHelp(createState());
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
    document.execCommand = () => false;
    const dedicated = document.getElementById('full-help-mount');
    dedicated.querySelector('[data-copy-prompt]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const feedback = dedicated.querySelector('[data-copy-prompt-feedback]');
    assert.equal(feedback.textContent.includes('Selecciona'), true);
    assert.equal(document.getElementById('tm-state').textContent.includes('schemaVersion'), true);
  });

  it('provides autonomous Master Prompt and initializes Welcome Dialog with copy & close controls', async () => {
    const { document, window } = mountWithTodoHelp(createState());
    const prompt = window.TMTodoHelp.getMasterPrompt();
    assert.equal(prompt.includes('MODO AUTÓNOMO'), true);
    assert.equal(prompt.includes('Task-Manager-Portable.html'), true);
    assert.equal(prompt.includes('subagente'), true);
    assert.equal(prompt.includes('schemaVersion'), true);

    const welcomeDialog = document.getElementById('welcome-dialog');
    assert.notEqual(welcomeDialog, null);
    const welcomePrompt = welcomeDialog.querySelector('[data-welcome-prompt]');
    assert.notEqual(welcomePrompt, null);
    assert.equal(welcomePrompt.textContent, prompt);

    let copied = '';
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { copied = text; } } });
    const welcomeCopyBtn = welcomeDialog.querySelector('[data-copy-welcome-prompt]');
    assert.notEqual(welcomeCopyBtn, null);
    welcomeCopyBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(copied, prompt);

    const closeBtn = welcomeDialog.querySelector('[data-welcome-close]');
    assert.notEqual(closeBtn, null);
    closeBtn.click();
    assert.equal(welcomeDialog.dataset.open, 'false');
  });
});

describe('todo-help — diagnostics and read-only state inspection', () => {
  it('renders errors and metadata warnings without hiding usable state', () => {
    const state = createState({
      meta: { history: [{ timestamp: 'not-a-date', completed: 2, total: 1 }] },
      phases: [{
        id: 'phase-1',
        title: 'Diagnostics',
        tasks: [
          { id: 'T1', title: 'Usable task', status: 'pending', owner: 'Ana', tag: 'UI' },
          { id: 'T1', title: '', status: 'unknown', risk: 'urgent' },
        ],
      }],
      todos: [{ id: 'todo-1', text: 'Still visible', priority: 'P2', done: false }],
    });
    const { document, window, core } = mountWithTodoHelpState(state);
    const validation = core.validateState(Object.assign({}, state, { schemaVersion: '0.0' }));
    window.TMTodoHelp.renderAllTodoHelp(state, document, validation);

    const diagnostics = document.getElementById('tm-diagnostics');
    assert.equal(diagnostics.textContent.includes('schemaVersion'), true);
    assert.equal(diagnostics.textContent.includes('Advertencias'), true);
    assert.equal(diagnostics.textContent.includes('Duplicate task ID: T1'), true);
    assert.equal(diagnostics.textContent.includes('missing title'), true);
    assert.equal(diagnostics.textContent.includes('Invalid risk for task T1'), true);
    assert.equal(document.querySelectorAll('.todo-item').length, 1, 'usable todo content must remain rendered');
    assert.equal(document.getElementById('help-panel').hidden, false);
  });

  it('shows formatted parsed JSON and preserves the island bytes', () => {
    const state = createState({ meta: { projectName: 'Read Only Project' } });
    const { document } = mountWithTodoHelpState(state, state);
    const island = document.getElementById('tm-state');
    const before = island.textContent;
    const viewer = document.getElementById('tm-state-json');

    assert.equal(viewer.textContent.includes('"schemaVersion": "1.0"'), true);
    assert.equal(viewer.textContent.includes('"projectName": "Read Only Project"'), true);
    assert.equal(viewer.getAttribute('contenteditable'), null);
    assert.equal(island.textContent, before);
  });

  it('escapes malformed raw island text instead of crashing or rewriting it', () => {
    const raw = '{"schemaVersion":"1.0","meta":{"projectName":"<script>bad</script>"';
    const { document } = mountWithTodoHelpState({}, raw);
    const island = document.getElementById('tm-state');
    const viewer = document.getElementById('tm-state-json');

    assert.equal(viewer.textContent, raw);
    assert.equal(viewer.innerHTML.includes('<script>'), false);
    assert.equal(viewer.querySelector('script'), null);
    assert.equal(island.textContent, raw);
  });
});

describe('todo-help — compact state inspection', () => {
  it('shows one compact healthy summary and keeps advanced JSON collapsed', () => {
    const state = createState({ meta: { projectName: 'Healthy Project' } });
    const { document } = mountWithTodoHelpState(state, state);
    const card = document.querySelector('.state-health-card');
    const advanced = document.querySelector('.state-tools-advanced');
    assert.notEqual(card, null);
    assert.match(card.textContent, /Estado saludable/);
    assert.equal((card.textContent.match(/salud/gi) || []).length, 1);
    assert.equal(advanced.open, false);
    assert.notEqual(advanced.querySelector('#tm-state-json'), null);
    assert.notEqual(advanced.querySelector('[data-state-copy]'), null);
    assert.notEqual(advanced.querySelector('[data-state-export]'), null);
  });

  it('keeps warning-only diagnostics collapsed but exposes their count', () => {
    const state = createState({ meta: { history: [{ timestamp: 'not-a-date', completed: 1, total: 2 }] } });
    const { document } = mountWithTodoHelpState(state, state);
    assert.match(document.querySelector('.state-health-card').textContent, /1 advertencia/i);
    assert.equal(document.querySelector('.state-tools-advanced').open, false);
  });

  it('opens advanced inspection automatically for errors and keeps hostile raw text escaped', () => {
    const raw = '{"schemaVersion":"0.0","meta":{"projectName":"<script>bad</script>"';
    const { document } = mountWithTodoHelpState({}, raw);
    const advanced = document.querySelector('.state-tools-advanced');
    const viewer = document.getElementById('tm-state-json');
    assert.equal(advanced.open, true);
    assert.match(document.querySelector('.state-health-card').textContent, /error/i);
    assert.equal(viewer.textContent, raw);
    assert.equal(viewer.querySelector('script'), null);
    assert.equal(document.getElementById('tm-state').textContent, raw);
  });
});

describe('todo-help — state copy and JSON export', () => {
  it('copies formatted JSON through navigator.clipboard and confirms success', async () => {
    const state = createState({ meta: { projectName: 'Clipboard Project' } });
    const { document, window } = mountWithTodoHelpState(state, state);
    let copied = '';
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => { copied = text; } },
    });

    document.querySelector('[data-state-copy]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(copied.includes('"projectName": "Clipboard Project"'), true);
    assert.equal(document.querySelector('[data-state-copy-feedback]').textContent, 'Copied');
  });

  it('uses hidden textarea execCommand fallback and reports failure clearly', async () => {
    const state = createState({ meta: { projectName: 'Fallback Project' } });
    const { document, window } = mountWithTodoHelpState(state, state);
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: undefined });
    let command = '';
    document.execCommand = (name) => {
      command = name;
      return true;
    };

    document.querySelector('[data-state-copy]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(command, 'copy');
    assert.equal(document.querySelector('textarea[data-copy-fallback]'), null);
    assert.equal(document.querySelector('[data-state-copy-feedback]').textContent, 'Copied');
  });

  it('reports copy failure when both clipboard paths are unavailable', async () => {
    const state = createState({ meta: { projectName: 'Failed Copy' } });
    const { document, window } = mountWithTodoHelpState(state, state);
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
    document.execCommand = () => false;

    document.querySelector('[data-state-copy]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const feedback = document.querySelector('[data-state-copy-feedback]');
    assert.equal(feedback.textContent, 'Copy failed');
    assert.equal(feedback.getAttribute('data-state-feedback'), 'error');
  });

  it('exports a safe project-derived filename without mutating the island', () => {
    const state = createState({ meta: { projectName: 'Project / Name' } });
    const { document, window } = mountWithTodoHelpState(state, state);
    const island = document.getElementById('tm-state');
    const before = island.textContent;
    const downloads = [];
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: () => 'blob:test-state',
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: () => {} });
    window.HTMLAnchorElement.prototype.click = function () {
      downloads.push({ href: this.href, download: this.download });
    };

    document.querySelector('[data-state-export]').click();

    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].download, 'Project-Name-state.json');
    assert.equal(downloads[0].href.includes('blob:test-state'), true);
    assert.equal(document.querySelector('[data-state-export-feedback]').textContent, 'Exported');
    assert.equal(island.textContent, before);
  });

  it('falls back to a data URL when Blob URLs are unavailable', () => {
    const state = createState({ meta: { projectName: 'Fallback Export' } });
    const { document, window } = mountWithTodoHelpState(state, state);
    const downloads = [];
    Object.defineProperty(window, 'Blob', { configurable: true, value: undefined });
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: undefined });
    window.HTMLAnchorElement.prototype.click = function () {
      downloads.push({ href: this.href, download: this.download });
    };

    document.querySelector('[data-state-export]').click();

    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].download, 'Fallback-Export-state.json');
    assert.equal(downloads[0].href.startsWith('data:application/json'), true);
    assert.equal(document.querySelector('[data-state-export-feedback]').textContent, 'Exported');
  });

  it('reports export failure when the browser cannot create a download URL', () => {
    const state = createState({ meta: { projectName: 'Failed Export' } });
    const { document, window } = mountWithTodoHelpState(state, state);
    Object.defineProperty(window, 'Blob', { configurable: true, value: function Blob() { throw new Error('blocked'); } });
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: () => { throw new Error('blocked'); } });
    window.HTMLAnchorElement.prototype.click = function () { throw new Error('download blocked'); };

    document.querySelector('[data-state-export]').click();

    const feedback = document.querySelector('[data-state-export-feedback]');
    assert.equal(feedback.textContent, 'Export failed');
    assert.equal(feedback.getAttribute('data-state-feedback'), 'error');
  });
});

describe('integration scripts — representative optional state and measured portability report', () => {
  it('assembles optional risk, blockedReason, and bounded history data', () => {
    const source = readFileSync(assemblePath, 'utf-8');
    assert.match(source, /risk:\s*['"](?:low|med|high)['"]/);
    assert.match(source, /blockedReason\s*:/);
    assert.match(source, /history\s*:\s*\[/);
  });

  it('declares uncapped size-report fields and portability invariants', () => {
    const source = readFileSync(portabilityPath, 'utf-8');
    assert.doesNotMatch(source, /MAX_BYTES/);
    assert.match(source, /BASELINE_BYTES/);
    assert.match(source, /ACCEPTED_CAPABILITY_JUSTIFICATION/);
    assert.match(source, /islandMatches\.length\s*!==\s*1/);
    assert.match(source, /No test code in artifact/);
  });
});
