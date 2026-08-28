// @ts-nocheck
// modules/06-todo-help.js — Todo scratchpad + Help tab & AI Console (PR6, classic script)
// Depends on TMCore. Classic script, no fetch.

(function (global) {
  'use strict';

  function getCore() {
    return (typeof window !== 'undefined' && window.TMCore) || (typeof globalThis !== 'undefined' && globalThis.TMCore) || (typeof global !== 'undefined' && global.TMCore) || null;
  }
  function esc(s) {
    var c = getCore();
    return c ? c.escapeHtml(s) : String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function label(key, state, fallback) {
    if (state && state.meta && state.meta.labels && state.meta.labels.es && typeof state.meta.labels.es[key] === 'string' && state.meta.labels.es[key]) {
      return state.meta.labels.es[key];
    }
    return fallback;
  }

  function priorityBadgeClass(priority) {
    if (priority === 'P0') return 'badge-blocked';
    if (priority === 'P1') return 'badge-completed';
    if (priority === 'P2') return 'badge-pending';
    return 'badge-tag';
  }
  function priorityLabel(priority) {
    if (priority === 'P0') return 'P0 Urgente';
    if (priority === 'P1') return 'P1 Alta';
    if (priority === 'P2') return 'P2 Normal';
    return priority || '—';
  }

  function readState(doc) {
    var island = doc && doc.getElementById('tm-state');
    var raw = island ? (island.textContent || '') : '';
    var core = getCore();
    var parsed = null;
    var validation = { ok: false, errors: [], warnings: [] };
    try {
      parsed = core && typeof core.parseIsland === 'function' ? core.parseIsland(raw) : JSON.parse(raw);
      validation = core && typeof core.validateState === 'function' ? core.validateState(parsed) : validation;
    } catch (e) {
      validation.errors.push(e && e.message ? e.message : String(e));
    }
    if (core && parsed && typeof core.deriveInsights === 'function') {
      var insights = core.deriveInsights(parsed, validation);
      validation.errors = insights.diagnostics.errors;
      validation.warnings = insights.diagnostics.warnings;
    }
    return { island: island, raw: raw, parsed: parsed, validation: validation };
  }

  function formatStateValue(source) {
    try { return JSON.stringify(source, null, 2); } catch (_) { return String(source == null ? '' : source); }
  }

  function projectFileName(state) {
    var name = state && state.meta && state.meta.projectName || 'drop-in-task-manager';
    name = String(name).trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    return (name || 'drop-in-task-manager') + '-state.json';
  }

  function setFeedback(root, selector, message, error) {
    var el = root && root.querySelector(selector);
    if (el) { el.textContent = message; el.setAttribute('data-state-feedback', error ? 'error' : 'ok'); }
  }

  function copyText(doc, text, done) {
    var win = doc && doc.defaultView || (typeof window !== 'undefined' ? window : global);
    var clipboard = win && win.navigator && win.navigator.clipboard;
    function fallback() {
      var ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('data-copy-fallback', '1');
      ta.setAttribute('aria-hidden', 'true');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      doc.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = doc.execCommand('copy'); } catch (_) {}
      if (ta.parentNode) ta.parentNode.removeChild(ta);
      done(ok);
    }
    if (clipboard && typeof clipboard.writeText === 'function') {
      try { Promise.resolve(clipboard.writeText(text)).then(function () { done(true); }, fallback); } catch (_) { fallback(); }
    } else fallback();
  }

  function exportState(doc, state, text) {
    var win = doc && doc.defaultView || (typeof window !== 'undefined' ? window : global);
    var name = projectFileName(state);
    var url = '';
    var link = doc.createElement('a');
    try {
      if (win && typeof win.Blob === 'function' && win.URL && typeof win.URL.createObjectURL === 'function') {
        try { url = win.URL.createObjectURL(new win.Blob([text], { type: 'application/json' })); } catch (_) {}
      } else {
        url = 'data:application/json;charset=utf-8,' + encodeURIComponent(text);
      }
      if (!url) url = 'data:application/json;charset=utf-8,' + encodeURIComponent(text);
      link.href = url; link.download = name; link.style.display = 'none';
      doc.body.appendChild(link); link.click();
      if (link.parentNode) link.parentNode.removeChild(link);
      if (win && win.URL && typeof win.URL.revokeObjectURL === 'function' && url.indexOf('blob:') === 0) win.URL.revokeObjectURL(url);
      return true;
    } catch (_) { if (link.parentNode) link.parentNode.removeChild(link); return false; }
  }

  function renderStateTools(state, doc, validation, mountId) {
    var mount = doc.getElementById(mountId || 'state-inspection-mount');
    if (!mount) return;
    var snapshot = readState(doc);
    var info = validation || {};
    var errorList = (snapshot.validation.errors || []).concat(Array.isArray(info.errors) ? info.errors : []);
    var warningList = (snapshot.validation.warnings || []).concat(Array.isArray(info.warnings) ? info.warnings : []);
    var source = snapshot.parsed || snapshot.raw;
    var text = snapshot.parsed ? formatStateValue(source) : snapshot.raw;
    var errors = errorList.filter(function (item, index, list) { return list.indexOf(item) === index; });
    var warnings = warningList.filter(function (item, index, list) { return list.indexOf(item) === index; });
    var health = errors.length ? 'error' : warnings.length ? 'warning' : 'healthy';
    var title = errors.length ? 'Estado con errores' : warnings.length ? 'Estado utilizable con advertencias' : 'Estado saludable';
    var summary = errors.length ? 'La inspección avanzada se abrió para facilitar la recuperación.' : warnings.length ? 'El panel sigue disponible; revisa las advertencias cuando lo necesites.' : 'No se detectaron problemas en el estado actual.';
    var diagnosticsHtml = '<div id="tm-diagnostics" role="status">'
      + (errors.length ? '<strong>Errores</strong><ul>' + errors.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul>' : '')
      + (warnings.length ? '<strong>Advertencias</strong><ul>' + warnings.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul>' : '')
      + (!errors.length && !warnings.length ? '<p>Sin diagnósticos pendientes.</p>' : '')
      + '</div>';
    mount.innerHTML = '<section class="state-tools" aria-label="Diagnóstico e inspección del estado">'
      + '<div class="state-health-card" data-health="' + health + '"><span class="state-health-icon">' + (errors.length ? '!' : warnings.length ? 'i' : '✓') + '</span><div><strong>' + title + '</strong><p>' + summary + '</p></div><div class="state-health-counts"><span class="badge ' + (errors.length ? 'badge-blocked' : 'badge-completed') + '">' + errors.length + ' errores</span><span class="badge ' + (warnings.length ? 'badge-pending' : 'badge-tag') + '">' + warnings.length + (warnings.length === 1 ? ' advertencia' : ' advertencias') + '</span></div></div>'
      + '<details class="state-tools-advanced"' + (errors.length ? ' open' : '') + '><summary>Inspección avanzada del JSON</summary><div class="state-tools-advanced-body">'
      + diagnosticsHtml
      + '<pre id="tm-state-json" aria-label="Read-only state JSON">' + esc(text) + '</pre>'
      + '<div class="state-tools-actions">'
      + '<button type="button" class="btn btn-secondary btn-sm" data-state-copy>Copy State JSON</button>'
      + '<button type="button" class="btn btn-secondary btn-sm" data-state-export>Export JSON</button>'
      + '<span data-state-copy-feedback aria-live="polite"></span><span data-state-export-feedback aria-live="polite"></span>'
      + '</div></div></details></section>';
    var copy = mount.querySelector('[data-state-copy]');
    var exportButton = mount.querySelector('[data-state-export]');
    if (copy) copy.addEventListener('click', function () { copyText(doc, text, function (ok) { setFeedback(mount, '[data-state-copy-feedback]', ok ? 'Copied' : 'Copy failed', !ok); }); });
    if (exportButton) exportButton.addEventListener('click', function () { var ok = exportState(doc, snapshot.parsed || state, text); setFeedback(mount, '[data-state-export-feedback]', ok ? 'Exported' : 'Export failed', !ok); });
  }

  function openTodoDetailDialog(todo, doc, triggerEl) {
    var dialog = doc.getElementById('todo-detail-dialog');
    if (!dialog || !todo) return;

    var priority = todo.priority || 'P2';
    var pClass = priorityBadgeClass(priority);
    var pLabel = priorityLabel(priority);
    var isDone = !!todo.done;

    var idEl = dialog.querySelector('#todo-detail-id');
    var pBadge = dialog.querySelector('#todo-detail-priority-badge');
    var sBadge = dialog.querySelector('#todo-detail-status-badge');
    var titleEl = dialog.querySelector('#todo-detail-title');
    var pLevelEl = dialog.querySelector('#todo-detail-p-level');
    var stateTextEl = dialog.querySelector('#todo-detail-state-text');
    var actionBox = dialog.querySelector('#todo-detail-action-guidance');

    if (idEl) idEl.textContent = todo.id || 'td';
    if (pBadge) {
      pBadge.className = 'badge ' + pClass;
      pBadge.textContent = pLabel;
    }
    if (sBadge) {
      sBadge.textContent = isDone ? 'Completada / Verificada' : 'Pendiente / Activa';
      sBadge.className = 'badge ' + (isDone ? 'badge-completed' : 'badge-pending');
    }
    if (titleEl) titleEl.textContent = todo.text || 'Señal de Atención';
    if (pLevelEl) {
      pLevelEl.textContent = priority === 'P0' ? 'P0 (Crítico / Bloqueante)' : priority === 'P1' ? 'P1 (Prioridad Alta)' : 'P2 (Prioridad Normal / Rutina)';
    }
    if (stateTextEl) {
      stateTextEl.textContent = isDone ? '✓ Verificada y cumplida en el estado del proyecto' : '⏳ Pendiente de cumplimiento / revisión requerida';
    }
    if (actionBox) {
      var advice = '';
      if (priority === 'P0') {
        advice = '🚨 Nivel Crítico: Esta señal representa un requisito indispensable de portabilidad o arquitectura. El orquestador debe resolverla antes de proceder a la siguiente fase.';
      } else if (priority === 'P1') {
        advice = '⚡ Prioridad Alta: Verificar funcionalidad clave e interactividad (reloj, filtros, sincronización) asegurando que no se rompan las pruebas.';
      } else {
        advice = '📌 Prioridad Normal: Mantener coherencia en el bloque JSON #tm-state y actualizar progresivamente según avances.';
      }
      actionBox.textContent = advice;
    }

    dialog._trigger = triggerEl;
    dialog.dataset.open = 'true';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');

    var closeBtn = dialog.querySelector('[data-todo-close]');
    if (closeBtn) closeBtn.focus();
  }

  function closeTodoDetailDialog(doc) {
    var dialog = doc && doc.getElementById('todo-detail-dialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    dialog.removeAttribute('open');
    dialog.dataset.open = 'false';
    if (dialog._trigger && typeof dialog._trigger.focus === 'function') dialog._trigger.focus();
  }

  function bindTodoDialogControls(doc) {
    var dialog = doc && doc.getElementById('todo-detail-dialog');
    if (!dialog || dialog.getAttribute('data-todo-dialog-bound') === '1') return;
    dialog.setAttribute('data-todo-dialog-bound', '1');

    dialog.querySelectorAll('[data-todo-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeTodoDetailDialog(doc); });
    });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeTodoDetailDialog(doc);
    });
    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeTodoDetailDialog(doc);
    });
    dialog.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab' || dialog.dataset.open !== 'true') return;
      var focusables = Array.prototype.slice.call(dialog.querySelectorAll('button, [href], [tabindex]')).filter(function (item) { return !item.hidden && !item.disabled && item.getAttribute('tabindex') !== '-1'; });
      if (!focusables.length) return;
      event.preventDefault();
      var index = focusables.indexOf(doc.activeElement);
      var next = event.shiftKey ? (index <= 0 ? focusables.length - 1 : index - 1) : (index === -1 || index === focusables.length - 1 ? 0 : index + 1);
      focusables[next].focus();
    });
  }

  function renderTodo(state, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    var container = doc.getElementById('todo-items-container') || doc.querySelector('.todo-list');
    if (!container) return;

    bindTodoDialogControls(doc);

    var todos = (state && Array.isArray(state.todos)) ? state.todos : [];

    // Update todo count badge in header if exists
    var countBadge = doc.getElementById('todo-count-badge');
    if (countBadge) {
      countBadge.textContent = todos.length + ' señales';
    }

    if (todos.length === 0) {
      container.innerHTML = '<div class=\"informational-empty\">Sin señales de atención registradas</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < todos.length; i++) {
      var td = todos[i] || {};
      var id = esc(td.id || ('td-' + (i+1)));
      var text = esc(td.text || '');
      var priority = td.priority || 'P2';
      var done = !!td.done;
      var badgeCls = priorityBadgeClass(priority);
      var pLabel = esc(priorityLabel(priority));

      html += '<div class="todo-item' + (done ? ' done' : '') + '" role="button" tabindex="0" aria-haspopup="dialog" data-id="' + id + '" data-priority="' + priority + '" data-done="' + (done ? '1' : '0') + '" title="Clic para ver detalles y recomendaciones de esta señal">'
        + '<div class="todo-left">'
        + '<span class="todo-text">' + text + '</span>'
        + '</div>'
        + '<div style="display:flex;gap:6px;align-items:center;">'
        + '<span class="badge ' + badgeCls + '">' + pLabel + '</span>'
        + '<span class="badge-tag">Informativo</span>'
        + '</div>'
        + '</div>';
    }
    container.innerHTML = html;

    if (container.getAttribute('data-todo-bound') !== '1') {
      container.setAttribute('data-todo-bound', '1');
      container.addEventListener('click', function (event) {
        var item = event.target.closest('.todo-item');
        if (!item || !container.contains(item)) return;
        var id = item.getAttribute('data-id');
        var matched = todos.find(function (t) { return t && (t.id === id || String(t.id) === id); });
        if (matched) openTodoDetailDialog(matched, doc, item);
      });
      container.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          var item = event.target.closest('.todo-item');
          if (item && container.contains(item)) {
            event.preventDefault();
            var id = item.getAttribute('data-id');
            var matched = todos.find(function (t) { return t && (t.id === id || String(t.id) === id); });
            if (matched) openTodoDetailDialog(matched, doc, item);
          }
        }
      });
    }
  }

  function getMasterPrompt() {
    return 'Usa la skill task-tracker-manager.\n\n'
      + 'Mantén actualizado el archivo ./Task-Manager-Portable.html según avances en el proyecto. Si en el repositorio ya existe ./drop-in-task-manager.html, mantén ese archivo existente. NUNCA crees un archivo HTML nuevo con otro nombre.\n\n'
      + 'MODO AUTÓNOMO (NO HAGAS PREGUNTAS AL USUARIO):\n'
      + '1. Autodescubrimiento:\n'
      + '   - Detecta el nombre del proyecto desde package.json, git remote o el nombre del directorio raíz.\n'
      + '   - Analiza el código y los planes actuales para estructurar o actualizar fases, tareas y sub-tareas.\n'
      + '2. Delegación y Subagente (Recomendado):\n'
      + '   - Si tu entorno soporta subagentes o workers (ej: OpenCode Task, Claude Code agents, sub-workers), puedes delegar la edición de este HTML a un subagente con un modelo rápido o económico.\n'
      + '   - El agente principal solo debe indicarle al subagente: la tarea completada, la próxima tarea y los cambios de estado en las tareas/subtareas.\n'
      + '3. Reglas Técnicas Obligatorias:\n'
      + '   - Edita ÚNICAMENTE el bloque \\x3cscript type="application/json" id="tm-state">. NUNCA toques el HTML ni scripts fuera de esa etiqueta.\n'
      + '   - Mantén schemaVersion: "1.0".\n'
      + '   - Escapa </script> dentro de strings como \\u003c/script\\u003e.\n'
      + '   - Usa solo status: pending | in-progress | completed | blocked (desconocidos → pending).\n'
      + '   - Soporta sub-tareas en tareas con: "subtasks": [{"id": "ST1", "title": "...", "status": "completed"|"in-progress"|"pending"|"blocked"}].\n'
      + '   - No uses fetch, XHR, import ni leas .git en runtime.\n'
      + '   - No hardcodees overallPct — se deriva automáticamente en la interfaz.\n\n'
      + 'Cada vez que completes una tarea o iteración, actualiza las fases/tareas/subtareas en el JSON island, guarda el archivo y confirma brevemente el nuevo progreso (ej: 9/14 tareas → 64%).';
  }

  function dismissWelcome(doc, dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    dialog.removeAttribute('open');
    dialog.dataset.open = 'false';
    if (doc) doc.__tmWelcomeSeen = true;
    var win = doc && doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (win) {
      try { if (win.sessionStorage) win.sessionStorage.setItem('tm-welcome-dismissed', '1'); } catch (_) {}
    }
  }

  function isWelcomeSeen(doc) {
    if (doc && doc.__tmWelcomeSeen) return true;
    var win = doc && doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (!win) return false;
    try {
      if (win.sessionStorage && win.sessionStorage.getItem('tm-welcome-dismissed') === '1') return true;
    } catch (_) {}
    return false;
  }

  function initWelcomeModal(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    var dialog = doc.getElementById('welcome-dialog');
    if (!dialog) return;

    var promptPre = dialog.querySelector('[data-welcome-prompt]');
    if (promptPre) {
      promptPre.textContent = getMasterPrompt();
    }

    var copyBtn = dialog.querySelector('[data-copy-welcome-prompt]');
    var feedback = dialog.querySelector('[data-copy-welcome-feedback]');
    if (copyBtn && copyBtn.getAttribute('data-welcome-bound') !== '1') {
      copyBtn.setAttribute('data-welcome-bound', '1');
      copyBtn.addEventListener('click', function () {
        var text = promptPre ? promptPre.textContent : getMasterPrompt();
        copyText(doc, text, function (ok) {
          if (ok) {
            if (feedback) { feedback.textContent = '¡Copiado con éxito!'; feedback.style.display = 'inline'; }
            copyBtn.textContent = '✓ Copiado al portapapeles!';
            setTimeout(function () {
              if (feedback) feedback.style.display = 'none';
              copyBtn.textContent = '📋 Copiar Prompt Maestro';
            }, 2000);
          } else {
            if (feedback) { feedback.textContent = 'Selecciona y copia el texto manualmente.'; feedback.style.display = 'inline'; }
          }
        });
      });
    }

    var closeButtons = dialog.querySelectorAll('[data-welcome-close]');
    closeButtons.forEach(function (btn) {
      if (btn.getAttribute('data-welcome-bound') !== '1') {
        btn.setAttribute('data-welcome-bound', '1');
        btn.addEventListener('click', function () {
          dismissWelcome(doc, dialog);
        });
      }
    });

    if (dialog.getAttribute('data-backdrop-bound') !== '1') {
      dialog.setAttribute('data-backdrop-bound', '1');
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) {
          dismissWelcome(doc, dialog);
        }
      });
    }

    if (!isWelcomeSeen(doc) && dialog.getAttribute('data-welcome-auto-opened') !== '1') {
      dialog.setAttribute('data-welcome-auto-opened', '1');
      try {
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
          dialog.dataset.open = 'true';
        } else {
          dialog.setAttribute('open', '');
          dialog.dataset.open = 'true';
        }
      } catch (_) {
        dialog.setAttribute('open', '');
        dialog.dataset.open = 'true';
      }
    }
  }

  function renderHelp(state, doc, validation) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    var panel = doc.getElementById('help-panel');
    if (!panel) return;

    // Respect features.help flag if present (default true)
    var core = getCore();
    if (core && state && state.meta && state.meta.features && state.meta.features.help === false) {
      panel.style.display = 'none';
      panel.setAttribute('hidden', '');
      return;
    }
    panel.style.display = '';
    panel.removeAttribute('hidden');

    var todoTitle = label('todoTitle', state, 'Tareas Rápidas');
    var helpTitle = label('helpTitle', state, 'Ayuda — Cómo usar este archivo');
    var filterAll = label('filterAll', state, 'Todas');
    var filterActive = label('filterActive', state, 'Activas');

    var helpHtml = ''
      + '<h3 style="color:#fff;margin-bottom:8px;">' + esc(helpTitle) + '</h3>'
      + '<p style="font-size:13px;color:#a0a0a0;margin-bottom:8px;">Este es un archivo HTML <strong>drop-in</strong>. Cópialo a cualquier carpeta de proyecto y ábrelo con doble clic (<code style="background:#12161d;padding:2px 6px;border-radius:4px;">file://</code>). No necesita servidor ni instalación.</p>'
      + '<div style="background:#12161d;border:1px solid #30363d;border-radius:8px;padding:12px;margin-bottom:12px;">'
      + '<h4 style="color:#fff;font-size:13px;margin-bottom:6px;">📋 Cómo copiar</h4>'
      + '<ol style="font-size:13px;color:#a0a0a0;padding-left:18px;display:flex;flex-direction:column;gap:4px;">'
      + '<li>Copia <code style="background:#1c222b;padding:2px 6px;border-radius:4px;">Task-Manager-Portable.html</code> a la raíz del proyecto</li>'
      + '<li>Doble clic para abrir en el navegador (file://)</li>'
      + '<li>Verás fases, tareas, progreso y paneles opcionales</li>'
      + '</ol>'
      + '</div>'

      + '<div style="background:#12161d;border:1px solid #30363d;border-radius:8px;padding:12px;margin-bottom:12px;">'
      + '<h4 style="color:#fff;font-size:13px;margin-bottom:6px;">🤖 Cómo la IA actualiza</h4>'
      + '<p style="font-size:13px;color:#a0a0a0;margin-bottom:6px;">La IA orquestadora actualiza <strong>SOLO</strong> el bloque <code style="background:#1c222b;padding:2px 6px;border-radius:4px;">#tm-state</code> en JSON. Todo lo visual se recalcula desde ahí.</p>'
      + '<ul style="font-size:13px;color:#a0a0a0;padding-left:18px;display:flex;flex-direction:column;gap:4px;">'
      + '<li>Asigna una IA: &quot;actualiza el task manager según avances en el proyecto&quot;</li>'
      + '<li>La IA edita solo el JSON island y guarda el HTML</li>'
      + '<li>Recarga el archivo en el navegador para ver progreso</li>'
      + '<li>Esquema: <code style="background:#1c222b;padding:2px 6px;border-radius:4px;">meta</code> + <code style="background:#1c222b;padding:2px 6px;border-radius:4px;">phases[]</code> + <code style="background:#1c222b;padding:2px 6px;border-radius:4px;">todos[]</code> + <code style="background:#1c222b;padding:2px 6px;border-radius:4px;">git/tree/codegraph</code></li>'
      + '</ul>'
      + '</div>'

      + '<div style="background:#12161d;border:1px solid #30363d;border-radius:8px;padding:12px;margin-bottom:12px;">'
      + '<h4 style="color:#fff;font-size:13px;margin-bottom:6px;">📐 Esquema</h4>'
      + '<pre style="font-family:var(--font-mono);font-size:11px;color:#a0a0a0;overflow-x:auto;background:#0b0e14;padding:8px;border-radius:4px;">{'
      + '\n  &quot;schemaVersion&quot;: &quot;1.0&quot;,'
      + '\n  &quot;meta&quot;: { &quot;projectName&quot;, &quot;version&quot;, &quot;branch&quot;, &quot;labels&quot;: {&quot;es&quot;:{}}, &quot;features&quot;: {&quot;git&quot;, &quot;tree&quot;, &quot;codegraph&quot;} },'
      + '\n  &quot;phases&quot;: [{ &quot;id&quot;, &quot;title&quot;, &quot;status&quot;, &quot;tasks&quot;: [{&quot;id&quot;, &quot;title&quot;, &quot;status&quot;}] }],'
      + '\n  &quot;todos&quot;: [{&quot;id&quot;, &quot;text&quot;, &quot;priority&quot;, &quot;done&quot;}],'
      + '\n  &quot;git&quot;, &quot;tree&quot;, &quot;codegraph&quot;'
      + '\n}</pre>'
      + '</div>'

      + '<div id="ai-instructions" style="background:rgba(88,166,255,0.08);border:1px solid #58a6ff;border-radius:8px;padding:12px;">'
      + '<h4 style="color:#58a6ff;font-size:13px;margin-bottom:6px;">🧠 Instrucciones para IA Orquestadora (AI-EDITABLE)</h4>'
      + '<ul style="font-size:12px;color:#a0a0a0;padding-left:18px;display:flex;flex-direction:column;gap:4px;">'
      + '<li><strong>SOLO</strong> edita el bloque <code style="background:#1c222b;padding:1px 4px;border-radius:3px;">&lt;script type=&quot;application/json&quot; id=&quot;tm-state&quot;&gt;</code> — nunca toques el HTML fuera del island</li>'
      + '<li>Mantén <code>schemaVersion</code> como <code>&quot;1.0&quot;</code> siempre</li>'
      + '<li>Escapa <code>&lt;/script&gt;</code> como <code>\\u003c/script\\u003e</code> dentro de cualquier texto de tarea/nota para no romper el HTML</li>'
      + '<li>Usa <code>status</code> solo con: <code>pending</code>, <code>in-progress</code>, <code>completed</code>, <code>blocked</code> — desconocidos se mapean a <code>pending</code></li>'
      + '<li>No hagas <code>fetch</code>, <code>XML' + 'HttpRequest</code>, <code>import</code> ni leas <code>.git</code> en runtime — todo es estático</li>'
      + '<li>Ejemplo válido: <code style="background:#1c222b;padding:1px 4px;border-radius:3px;">{&quot;id&quot;:&quot;T1-01&quot;,&quot;title&quot;:&quot;Definir esquema&quot;,&quot;status&quot;:&quot;completed&quot;}</code></li>'
      + '</ul>'
      + '<p style="font-size:11px;color:#8b949e;margin-top:8px;">Filtros: ' + esc(filterAll) + ' / ' + esc(filterActive) + ' · Todo: ' + esc(todoTitle) + ' · Código en inglés, UI en español vía <code>meta.labels.es</code></p>'
      + '</div>'

      + '<div id="prompt-inicial" style="background:#12161d;border:1px solid #3fb950;border-radius:8px;padding:12px;margin-top:12px;">'
      + '<h4 style="color:#3fb950;font-size:13px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">📋 Prompt Maestro para la IA — Copiar y pegar</h4>'
      + '<p style="font-size:12px;color:#8b949e;margin-bottom:8px;">Copia este prompt y envíaselo a tu IA orquestadora al iniciar cada sesión. La IA trabajará de forma autónoma sin hacer preguntas innecesarias:</p>'
      + '<pre id="initial-prompt-text" data-help-prompt style="font-family:var(--font-mono);font-size:11px;color:#c9d1d9;background:#0b0e14;padding:10px;border-radius:6px;overflow-x:auto;white-space:pre-wrap;word-break:break-word;border:1px solid #30363d;line-height:1.5;max-height:280px;overflow-y:auto;">' + esc(getMasterPrompt()) + '</pre>'
      + '<button id="btn-copy-prompt" data-copy-prompt type="button" style="margin-top:8px;background:#238636;border:1px solid #3fb950;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:13px;display:inline-flex;align-items:center;gap:6px;">📋 Copiar prompt</button>'
      + '<span id="copy-feedback" data-copy-prompt-feedback role="status" aria-live="polite" style="margin-left:8px;font-size:12px;color:#3fb950;display:none;"></span>'
      + '</div>'

      + '<aside class="help-portability-note" aria-label="Portabilidad y documentación"><span class="help-portability-icon">i</span><div><strong>Referencia técnica local</strong><p>Documentación: <code>openspec/changes/drop-in-task-manager/</code></p><div class="help-portability-tags"><span>Tokens del prototipo</span><span><code>file://</code> compatible</span><span>Sin dependencias externas</span></div></div></aside>';

    panel.innerHTML = helpHtml + '<div id="state-inspection-mount"></div>';
    renderStateTools(state, doc, validation, 'state-inspection-mount');

    // Attach copy handler for prompt (file:// compatible, no inline script)
    (function(){
      var btn = panel.querySelector('#btn-copy-prompt');
      var pre = panel.querySelector('#initial-prompt-text');
      var fb = panel.querySelector('#copy-feedback');
      var win = doc.defaultView || global;
      if (!btn || !pre) return;
      btn.addEventListener('click', function(){
        var text = pre.textContent;
        function ok(){ if(fb){fb.textContent='¡Copiado!';fb.style.display='inline'; btn.textContent='✓ Copiado!'; setTimeout(function(){if(fb)fb.style.display='none'; btn.textContent='📋 Copiar prompt';},1800);} }
        function fallback(){
          var ta = doc.createElement('textarea');
          ta.value = text;
          ta.style.position='fixed';
          ta.style.opacity='0';
          doc.body.appendChild(ta);
          ta.select();
          var copied = false;
          try{ copied = doc.execCommand('copy'); }catch(e){}
          if(copied) ok(); else if(fb){fb.textContent='No se pudo copiar. Selecciona y copia el prompt manualmente.';fb.style.display='inline';}
          doc.body.removeChild(ta);
        }
        if(win.navigator && win.navigator.clipboard && typeof win.navigator.clipboard.writeText === 'function'){
          win.navigator.clipboard.writeText(text).then(ok).catch(fallback);
        } else {
          fallback();
        }
      });
    })();
  }

  function renderAllTodoHelp(state, doc, validation) {
    renderTodo(state, doc);
    renderHelp(state, doc, validation);
    initWelcomeModal(doc);
  }

  var TMTodoHelp = {
    renderTodo: renderTodo,
    renderHelp: renderHelp,
    renderAllTodoHelp: renderAllTodoHelp,
    renderStateTools: renderStateTools,
    copyText: copyText,
    exportState: exportState,
    getMasterPrompt: getMasterPrompt,
    initWelcomeModal: initWelcomeModal
  };

  try { if (typeof window !== 'undefined') window.TMTodoHelp = TMTodoHelp; } catch (_) {}
  try { if (typeof globalThis !== 'undefined') globalThis.TMTodoHelp = TMTodoHelp; } catch (_) {}
  try { if (typeof global !== 'undefined') global.TMTodoHelp = TMTodoHelp; } catch (_) {}
  try { if (typeof module !== 'undefined' && module.exports) module.exports = TMTodoHelp; } catch (_) {}

})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : this);
