// scripts/assemble.mjs — Concatenate modules into single drop-in HTML (no bundler)
// Reads modules in order per 07-assemble.md, replaces island with example state, injects classic scripts + bootstrap.

import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const skeletonPath = path.join(projectRoot, 'modules', '01-skeleton.html');
const corePath = path.join(projectRoot, 'modules', '02-core.js');
const hudPath = path.join(projectRoot, 'modules', '03-header-hud.js');
const phasesPath = path.join(projectRoot, 'modules', '04-phases.js');
const panelsPath = path.join(projectRoot, 'modules', '05-panels.js');
const todoHelpPath = path.join(projectRoot, 'modules', '06-todo-help.js');
const portablePath = path.join(projectRoot, 'Task-Manager-Portable.html');

// Example state — full dashboard as user requested "Todo como tu dashboard" (v1 completa)
// Spanish labels, all panels enabled, sample phases/tasks to showcase full UI.
const exampleState = {
  schemaVersion: '1.0',
  meta: {
    projectName: 'Task Manager Portable',
    version: '1.1.0',
    branch: 'main',
    commit: '2faddaa',
    syncStatus: 'Sincronizado',
    harness: 'OpenCode',
    harnessRole: 'Autonomous Multi-Agent Runtime',
    description: 'Single-file offline project dashboard with zero runtime dependencies',
    lastUpdated: '2026-08-26T15:00:00Z',
    labels: {
      es: {
        overallProgress: 'Progreso Global',
        filterAll: 'Todas',
        filterActive: 'Activas',
        todoTitle: 'Tareas Rápidas',
        helpTitle: 'Ayuda — Cómo usar este archivo',
        headerSubtitle: 'Dashboard técnico drop-in — gestionado por orquestador IA',
      }
    },
    features: { git: true, tree: true, codegraph: true, help: true },
    history: [
      { timestamp: '2026-08-18T09:00:00Z', completed: 4, total: 16 },
      { timestamp: '2026-08-20T09:00:00Z', completed: 8, total: 16 },
      { timestamp: '2026-08-24T09:00:00Z', completed: 12, total: 16 },
      { timestamp: '2026-08-26T15:00:00Z', completed: 16, total: 16 }
    ]
  },
  phases: [
    {
      id: 'phase-1',
      number: 1,
      title: 'Planificación y Arquitectura',
      status: 'completed',
      target: 'Fase 1',
      lead: 'Orquestador',
      tasks: [
        {
          id: 'T1-01',
          title: 'Definir esquema de datos y contratos JSON schemaVersion 1.0',
          status: 'completed',
          tag: 'Backend',
          note: 'Esquema JSON inmutable validado con tipado estricto y manejo de errores sin white-screen.',
          owner: 'sdd-spec',
          commit: 'a1b2c3d',
          subtasks: [
            { id: 'ST1-1', title: 'Modelar esquema JSON schemaVersion 1.0', status: 'completed', done: true },
            { id: 'ST1-2', title: 'Definir reglas de validación y límites', status: 'completed', done: true },
            { id: 'ST1-3', title: 'Aprobar contratos con el equipo', status: 'completed', done: true }
          ]
        },
        {
          id: 'T1-02',
          title: 'Diseñar tokens del tema Obsidian Dark y layout responsivo',
          status: 'completed',
          tag: 'Design',
          note: 'Tokens CSS verbatim, variables :root y soporte para viewports de 320px a 1920px.',
          owner: 'sdd-design',
          commit: 'b2c3d4e'
        },
        {
          id: 'T1-03',
          title: 'Mapear estructura modular desacoplada y scripts de ensamblado',
          status: 'completed',
          tag: 'Arch',
          note: 'Estructura modular 01-07 sin empaquetadores externos para portabilidad directa file://.',
          owner: 'sdd-explore',
          commit: 'c3d4e5f'
        }
      ]
    },
    {
      id: 'phase-2',
      number: 2,
      title: 'Núcleo y Métricas Reactivas',
      status: 'completed',
      target: 'Fase 2',
      lead: 'sdd-tasks',
      tasks: [
        {
          id: 'T2-01',
          title: 'Implementar parser seguro, validación y derivación matemática',
          status: 'completed',
          tag: 'Core',
          note: 'Manejo seguro de división 0/0, prevención de NaN y escape de etiquetas script.',
          owner: 'sdd-apply',
          commit: 'd4e5f6a',
          subtasks: [
            { id: 'ST2-1', title: 'Parser con escape seguro \\u003c/script\\u003e', status: 'completed', done: true },
            { id: 'ST2-2', title: 'Derivación de métricas y porcentajes', status: 'completed', done: true }
          ]
        },
        {
          id: 'T2-02',
          title: 'Header y HUD panorámico con métricas derivadas',
          status: 'completed',
          tag: 'Frontend',
          note: 'Cálculo dinámico en tiempo real del progreso global y tarjetas ejecutivas interactivas.',
          owner: 'sdd-apply',
          commit: 'e5f6a7b'
        },
        {
          id: 'T2-03',
          title: 'Hub de cabecera con Reloj Digital 12h/24h y badge de última actualización',
          status: 'completed',
          tag: 'Frontend',
          note: 'Reloj digital en vivo con zona horaria local, switch interactivo 12H/24H y pulso de frescura.',
          owner: 'sdd-apply',
          commit: '2faddaa',
          subtasks: [
            { id: 'ST2-3a', title: 'Reloj digital reactivo con horas, minutos, segundos y fecha', status: 'completed', done: true },
            { id: 'ST2-3b', title: 'Interruptor de formato horario 12H/24H y detector de timezone', status: 'completed', done: true },
            { id: 'ST2-3c', title: 'Badge con cálculo de tiempo relativo de última actualización', status: 'completed', done: true }
          ]
        }
      ]
    },
    {
      id: 'phase-3',
      number: 3,
      title: 'Fases, Tareas y Filtros Interactivos',
      status: 'completed',
      target: 'Fase 3',
      lead: 'sdd-apply',
      tasks: [
        {
          id: 'T3-01',
          title: 'Acordeón colapsable con toggle aislado y vista dedicada',
          status: 'completed',
          tag: 'UI',
          note: 'Event delegation optimizado, persistencia en UI preferences e interactividad fluida.',
          owner: 'sdd-apply',
          commit: 'f6a7b8c',
          subtasks: [
            { id: 'ST3-1', title: 'Event delegation en contenedor de fases', status: 'completed', done: true },
            { id: 'ST3-2', title: 'Aislamiento de toggle individual', status: 'completed', done: true }
          ]
        },
        {
          id: 'T3-02',
          title: 'Toolbar de filtrado múltiple (texto, estado, responsable, tag, fase)',
          status: 'completed',
          tag: 'UI',
          note: 'Filtrado AND unificado en lista y tablero Kanban con contadores reactivos.',
          owner: 'sdd-apply',
          commit: 'a7b8c9d'
        },
        {
          id: 'T3-03',
          title: 'Barra de progreso por fase y checklist visual de subtareas',
          status: 'completed',
          tag: 'UI',
          note: 'Checklists enriquecidos, barras de progreso dinámicas y visualización de bloqueos.',
          owner: 'sdd-apply',
          commit: 'b8c9d0e',
          subtasks: [
            { id: 'ST3-3a', title: 'Cálculo de progreso por subtarea', status: 'completed', done: true },
            { id: 'ST3-3b', title: 'Checklist visual interactivo', status: 'completed', done: true },
            { id: 'ST3-3c', title: 'Animaciones de transición y badges', status: 'completed', done: true }
          ]
        },
        {
          id: 'T3-04',
          title: 'Hardening de seguridad y prueba de escape hostil \\u003c/script\\u003e',
          status: 'completed',
          tag: 'Security',
          note: 'Protección rigurosa contra inyección XSS y preservación de cadenas hostiles.',
          owner: 'sdd-review',
          commit: 'c9d0e1f',
          risk: 'high',
          blockedReason: 'Awaiting security review'
        }
      ]
    },
    {
      id: 'phase-4',
      number: 4,
      title: 'Paneles Opcionales y Visualizaciones',
      status: 'completed',
      target: 'Fase 4',
      lead: 'sdd-apply',
      tasks: [
        {
          id: 'T4-01',
          title: 'Panel Git Stream con historial de commits y estado de sincronización',
          status: 'completed',
          tag: 'Git',
          note: 'Visualización de flujo git offline sin llamadas de red.',
          owner: 'sdd-apply',
          commit: 'd0e1f2a'
        },
        {
          id: 'T4-02',
          title: 'Árbol jerárquico de archivos con navegación e indentación',
          status: 'completed',
          tag: 'Tree',
          note: 'Explorador de arquitectura y estructura del repositorio.',
          owner: 'sdd-apply',
          commit: 'e1f2a3b'
        },
        {
          id: 'T4-03',
          title: 'Mapa interactivo Codegraph SVG con diálogo accesible',
          status: 'completed',
          tag: 'Graph',
          note: 'Grafo SVG de dependencias entre módulos con inspección semántica por nodo.',
          owner: 'sdd-apply',
          commit: 'f2a3b4c'
        }
      ]
    },
    {
      id: 'phase-5',
      number: 5,
      title: 'Consola IA, Ayuda y Verificación Total',
      status: 'completed',
      target: 'Fase 5',
      lead: 'sdd-verify',
      tasks: [
        {
          id: 'T5-01',
          title: 'Scratchpad de Tareas Rápidas (todos P0/P1/P2)',
          status: 'completed',
          tag: 'Docs',
          note: 'Gestión de tareas de atención rápida con etiquetas prioritarias e indicadores de estado.',
          owner: 'sdd-tasks',
          commit: 'a3b4c5d'
        },
        {
          id: 'T5-02',
          title: 'Consola IA con Prompt Maestro Autónomo y selector de modelos',
          status: 'completed',
          tag: 'AI',
          note: 'Generación guiada de comandos para asistentes LLM y auto-actualización del estado.',
          owner: 'Orquestador',
          commit: 'b4c5d6e'
        },
        {
          id: 'T5-03',
          title: 'Modal interactivo de bienvenida y suite de 136 pruebas e2e',
          status: 'completed',
          tag: 'QA',
          note: 'Ventana emergente de bienvenida ¡ATENCIÓN!, checklist de portabilidad y pruebas 100% en verde.',
          owner: 'sdd-verify',
          commit: '2faddaa',
          subtasks: [
            { id: 'ST5-3a', title: 'Ventana emergente modal de bienvenida con ¡ATENCIÓN!', status: 'completed', done: true },
            { id: 'ST5-3b', title: 'Suite de pruebas unitarias automatizadas (136 tests)', status: 'completed', done: true },
            { id: 'ST5-3c', title: 'Validación Playwright e2e en navegador real con 9 viewports', status: 'completed', done: true }
          ]
        }
      ]
    }
  ],
  todos: [
    { id: 'td-1', text: 'Verificar compatibilidad offline file:// sin servidor', priority: 'P0', done: true },
    { id: 'td-2', text: 'Comprobar alternancia de formato de reloj 12H/24H', priority: 'P1', done: true },
    { id: 'td-3', text: 'Validar pulso y cálculo de última actualización', priority: 'P1', done: true },
    { id: 'td-4', text: 'Garantizar persistencia estricta en bloque tm-state', priority: 'P2', done: true }
  ],
  git: {
    branch: 'main',
    commits: [
      { hash: '2faddaa', message: 'chore(release): 1.0.1' },
      { hash: 'd193e1e', message: 'Merge pull request #2 from RamonsDka/fix/issue-1-portable-filename' },
      { hash: '375dac5', message: 'fix: clarify portable filename in help prompt and docs' },
      { hash: '4172efd', message: 'ci: update official GitHub actions' },
      { hash: '1306233', message: 'ci: verify with Node.js 24' }
    ],
    syncStatus: 'Sincronizado'
  },
  tree: [
    { name: 'Task-Manager-Portable.html', depth: 0, type: 'file' },
    { name: 'modules/', depth: 0, type: 'dir' },
    { name: '01-skeleton.html', depth: 1, type: 'file' },
    { name: '02-core.js', depth: 1, type: 'file' },
    { name: '03-header-hud.js', depth: 1, type: 'file' },
    { name: '04-phases.js', depth: 1, type: 'file' },
    { name: '05-panels.js', depth: 1, type: 'file' },
    { name: '06-todo-help.js', depth: 1, type: 'file' },
    { name: 'scripts/', depth: 0, type: 'dir' },
    { name: 'assemble.mjs', depth: 1, type: 'file' },
    { name: 'run-tests.mjs', depth: 1, type: 'file' },
    { name: 'scan-portability.mjs', depth: 1, type: 'file' },
    { name: 'tests/', depth: 0, type: 'dir' },
    { name: 'docs/', depth: 0, type: 'dir' }
  ],
  codegraph: {
    nodes: [
      { id: 'skeleton', label: 'Skeleton', files: ['modules/01-skeleton.html'], details: 'Estructura HTML5 base, tokens y shells.' },
      { id: 'core', label: 'Core', files: ['modules/02-core.js'], taskIds: ['T2-01'], details: 'Parsea, valida y deriva métricas del estado.' },
      { id: 'hud', label: 'HUD & Clock', files: ['modules/03-header-hud.js'], taskIds: ['T2-02', 'T2-03'], details: 'Header, reloj digital, fecha, última act. y métricas.' },
      { id: 'phases', label: 'Phases & Kanban', files: ['modules/04-phases.js'], taskIds: ['T3-01', 'T3-03'], details: 'Acordeón de fases, tareas, subtareas y Kanban.' },
      { id: 'panels', label: 'Panels', files: ['modules/05-panels.js'], taskIds: ['T4-01', 'T4-02', 'T4-03'], details: 'Git stream, árbol de archivos y Codegraph SVG.' },
      { id: 'help', label: 'AI Console & Help', files: ['modules/06-todo-help.js'], taskIds: ['T5-01', 'T5-02', 'T5-03'], details: 'Tareas rápidas, consola IA, prompts y bienvenida.' }
    ],
    edges: [
      { from: 'skeleton', to: 'core' },
      { from: 'core', to: 'hud' },
      { from: 'core', to: 'phases' },
      { from: 'core', to: 'panels', label: 'usa', details: 'Panels consume los helpers de Core.' },
      { from: 'core', to: 'help' },
      { from: 'phases', to: 'panels' }
    ]
  }
};

function escapeIslandJson(state) {
  const json = JSON.stringify(state);
  return json.replace(/<\/script>/gi, '\\u003c/script\\u003e');
}

function escapeScriptContent(js) {
  // Escape closing script tag inside JS to avoid breaking HTML <script> inlining
  // HTML parser ends <script> on literal </script> even inside JS strings/comments
  return js.replace(/<\/script>/gi, '<\\/script>');
}

function build() {
  const skeleton = readFileSync(skeletonPath, 'utf-8');
  const coreJs = escapeScriptContent(readFileSync(corePath, 'utf-8'));
  const hudJs = escapeScriptContent(readFileSync(hudPath, 'utf-8'));
  const phasesJs = escapeScriptContent(readFileSync(phasesPath, 'utf-8'));
  const panelsJs = escapeScriptContent(readFileSync(panelsPath, 'utf-8'));
  const todoHelpJs = escapeScriptContent(readFileSync(todoHelpPath, 'utf-8'));

  // Escape island
  const islandJson = escapeIslandJson(exampleState);

  // Replace island content in skeleton (keep script tag, replace inner JSON)
  const islandRegex = /<script[^>]*id="tm-state"[^>]*>[\s\S]*?<\/script>/;
  const newIsland = `<script type="application/json" id="tm-state">${islandJson}</script>`;
  let html = skeleton.replace(islandRegex, newIsland);

  // Inject modules as classic scripts before </body>
  // Ensure we have exactly one </body>
  const scriptsBlock = `
<!-- MODULES: classic scripts, no bundler, file:// compatible -->
<script>
// ${'modules/02-core.js'} — inlined
${coreJs}
</script>
<script>
// ${'modules/03-header-hud.js'} — inlined
${hudJs}
</script>
<script>
// ${'modules/04-phases.js'} — inlined
${phasesJs}
</script>
<script>
// ${'modules/05-panels.js'} — inlined
${panelsJs}
</script>
<script>
// ${'modules/06-todo-help.js'} — inlined
${todoHelpJs}
</script>
<script>
// Bootstrap — single init on DOMContentLoaded, never white-screen
document.addEventListener('DOMContentLoaded', function() {
  try {
    var core = window.TMCore;
    var banner = document.getElementById('tm-error-banner');
    var result = null;
    try {
      result = core.getStateFromDocument(document);
    } catch (e) {
      result = { error: (e && e.message) ? e.message : String(e), validation: { ok: false, errors: [String(e)], warnings: [] } };
    }
    if (result && result.error) {
      if (banner) {
        banner.textContent = '⚠️ Error en JSON del Task Manager: ' + result.error + ' — Revisa el bloque #tm-state. El dashboard sigue visible.';
        banner.hidden = false;
        banner.style.display = 'block';
        banner.removeAttribute('hidden');
      }
      // Try to still render with state if available (partial), else fallback to minimal
      var state = result.state || null;
      if (state) {
        try {
          var metrics = core.deriveMetrics(state);
          if (window.TMHeaderHud) window.TMHeaderHud.renderAll(state, document);
          if (window.TMPhases) window.TMPhases.renderPhases(state, metrics, document);
          if (window.TMPanel) window.TMPanel.renderAllPanels(state, document);
          if (window.TMTodoHelp) window.TMTodoHelp.renderAllTodoHelp(state, document, result.validation);
        } catch (e2) { console.error('Render after error failed', e2); }
      }
      if (!state && window.TMTodoHelp) {
        try { window.TMTodoHelp.renderAllTodoHelp(null, document, result.validation); } catch (e3) { console.error('Help fallback render failed', e3); }
      }
      return;
    }
    // Success path
    if (banner) { banner.hidden = true; banner.style.display = 'none'; banner.setAttribute('hidden',''); }
    var state = result.state;
    var metrics = core.deriveMetrics(state);
    if (window.TMHeaderHud) window.TMHeaderHud.renderAll(state, document);
    if (window.TMPhases) window.TMPhases.renderPhases(state, metrics, document);
    if (window.TMPanel) window.TMPanel.renderAllPanels(state, document);
    if (window.TMTodoHelp) window.TMTodoHelp.renderAllTodoHelp(state, document, result.validation);
    // Expose for debugging
    window.__TM_STATE__ = state;
    window.__TM_METRICS__ = metrics;
  } catch (e) {
    console.error('Bootstrap failed', e);
    var b = document.getElementById('tm-error-banner');
    if (b) { b.textContent = 'Error crítico: ' + (e.message || String(e)); b.hidden = false; b.style.display = 'block'; b.removeAttribute('hidden'); }
  }
});
</script>
</body>`;

  if (html.includes('</body>')) {
    html = html.replace('</body>', scriptsBlock);
  } else {
    html += scriptsBlock + '\n</html>';
  }

  // Add header comment — avoid literal <script> inside comment to keep island scan clean
  const headerComment = `<!--
  Task Manager Portable — Single-file, file:// compatible, zero runtime deps
  Generated deterministically by scripts/assemble.mjs
  Source modules: 01-skeleton.html + 02-core.js + 03-header-hud.js + 04-phases.js + 05-panels.js + 06-todo-help.js
  Island: script#tm-state (type=application/json) — AI edits ONLY this block
  Tokens: verbatim dark theme
-->
`;
  html = html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + headerComment);

  writeFileSync(portablePath, html, 'utf-8');

  const stats = statSync(portablePath);
  const sizeKB = (stats.size / 1024).toFixed(1);
  console.log(`✅ Assembled Task-Manager-Portable.html — ${stats.size} bytes (${sizeKB} KB)`);
  console.log(`   Modules: 01-skeleton + 02-core + 03-header-hud + 04-phases + 05-panels + 06-todo-help + bootstrap`);
  console.log(`   Island: exampleState (${exampleState.phases.length} phases, ${exampleState.phases.reduce((a,p)=>a+p.tasks.length,0)} tasks, ${exampleState.todos.length} todos)`);
  console.log(`   Features: git=${exampleState.meta.features.git} tree=${exampleState.meta.features.tree} codegraph=${exampleState.meta.features.codegraph}`);
  console.log('   Size is measured by scan-portability; no hard byte ceiling is applied.');

  // Quick file:// sanity: check no <script src=
  if (html.includes('<script src=')) {
    console.error('❌ Found <script src= — violates file:// portability');
    process.exitCode = 1;
  }
  if (html.includes('fetch(') && !html.includes('no fetch')) {
    // Allow "no fetch" in comments/help but not actual fetch( call outside comments? Simplified check: look for fetch( in script blocks (we already excluded comments)
    // For now, just warn if fetch( appears in script tags
    const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    let hasFetch = false;
    for (const block of scriptBlocks) {
      if (block.includes('id="tm-state"')) continue; // island is JSON, ignore
      const inner = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
      const withoutComments = inner.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (/fetch\s*\(/.test(withoutComments)) hasFetch = true;
    }
    if (hasFetch) {
      console.error('❌ Found fetch( in script — violates file://');
      process.exitCode = 1;
    }
  }
  console.log('✅ Assembly complete — open via file:// double-click to verify');
}

build();
