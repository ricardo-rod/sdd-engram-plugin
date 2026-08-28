// @ts-nocheck
// modules/05-panels.js — Flag-gated optional panels: git, tree, codegraph (PR5, classic script)
// Depends on TMCore. Classic script, no fetch/import. Containment try/catch per panel.

(function (global) {
  'use strict';

  function getCore() {
    return (typeof window !== 'undefined' && window.TMCore) || (typeof globalThis !== 'undefined' && globalThis.TMCore) || (typeof global !== 'undefined' && global.TMCore) || null;
  }
  function esc(s) {
    var c = getCore();
    return c ? c.escapeHtml(s) : String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function isEnabled(feature, state) {
    var c = getCore();
    return c ? c.isEnabled(feature, state) : !!(state && state.meta && state.meta.features && state.meta.features[feature] === true);
  }
  function emptyState(dataset, shape, partial) {
    return '<div class="optional-empty" role="status" style="color:#8b949e;font-size:13px;">sin datos de ' + esc(dataset) + ': falta ' + esc(partial || dataset) + '. Añade JSON con la forma <code>' + esc(shape) + '</code>.</div>';
  }

  function commitKind(message) {
    var match = String(message || '').match(/^([a-z]+)(?:\([^)]*\))?!?:/i);
    return match ? match[1].toLowerCase() : 'commit';
  }

  function openGitDetailDialog(commit, branch, syncStatus, state, doc, triggerEl) {
    var dialog = doc.getElementById('git-detail-dialog');
    if (!dialog || !commit) return;

    var hash = commit.hash || '';
    var short = hash ? hash.substring(0, 7) : '—';
    var kind = commitKind(commit.message || commit.msg || '');

    var hashEl = dialog.querySelector('#git-detail-hash');
    var kindEl = dialog.querySelector('#git-detail-kind');
    var msgEl = dialog.querySelector('#git-detail-msg');
    var branchEl = dialog.querySelector('#git-detail-branch');
    var fullHashEl = dialog.querySelector('#git-detail-full-hash');
    var syncEl = dialog.querySelector('#git-detail-sync');
    var tasksEl = dialog.querySelector('#git-detail-tasks');

    if (hashEl) hashEl.textContent = short;
    if (kindEl) kindEl.textContent = kind;
    if (msgEl) msgEl.textContent = commit.message || commit.msg || 'Sin mensaje de commit';
    if (branchEl) branchEl.textContent = branch || 'main';
    if (fullHashEl) fullHashEl.textContent = hash || '—';
    if (syncEl) syncEl.textContent = syncStatus || 'Sincronizado';

    var linkedTasks = [];
    if (state && Array.isArray(state.phases)) {
      state.phases.forEach(function (p) {
        if (Array.isArray(p.tasks)) {
          p.tasks.forEach(function (t) {
            if (t.commit && (t.commit === hash || hash.indexOf(t.commit) !== -1 || (t.commit.length >= 7 && hash.startsWith(t.commit)))) {
              linkedTasks.push((t.id || 'T') + ' (' + (t.title || 'Tarea') + ')');
            }
          });
        }
      });
    }
    if (tasksEl) {
      tasksEl.textContent = linkedTasks.length ? linkedTasks.join(', ') : 'Asociado al hito de desarrollo';
    }

    dialog._trigger = triggerEl;
    dialog.dataset.open = 'true';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');

    var closeBtn = dialog.querySelector('[data-git-close]');
    if (closeBtn) closeBtn.focus();
  }

  function closeGitDetailDialog(doc) {
    var dialog = doc && doc.getElementById('git-detail-dialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    dialog.removeAttribute('open');
    dialog.dataset.open = 'false';
    if (dialog._trigger && typeof dialog._trigger.focus === 'function') dialog._trigger.focus();
  }

  function bindGitDialogControls(doc) {
    var dialog = doc && doc.getElementById('git-detail-dialog');
    if (!dialog || dialog.getAttribute('data-git-dialog-bound') === '1') return;
    dialog.setAttribute('data-git-dialog-bound', '1');

    dialog.querySelectorAll('[data-git-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeGitDetailDialog(doc); });
    });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeGitDetailDialog(doc);
    });
    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeGitDetailDialog(doc);
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

  function renderGit(state, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    var panel = doc.getElementById('git-details-panel');
    if (!panel) return;

    bindGitDialogControls(doc);

    try {
      if (!isEnabled('git', state)) {
        panel.style.display = 'none';
        panel.setAttribute('hidden', '');
        return;
      }
      panel.style.display = '';
      panel.removeAttribute('hidden');

      var body = panel.querySelector('.panel-body');
      if (!body) return;

      var git = (state && state.git) ? state.git : null;
      var gitBranch = git && git.branch ? git.branch : '';
      var branch = gitBranch || (state && state.meta && state.meta.branch) || '';
      var commits = (git && Array.isArray(git.commits)) ? git.commits : [];
      var gitSync = git && git.syncStatus ? git.syncStatus : '';
      var syncStatus = gitSync || (state && state.meta && state.meta.syncStatus) || '';

      // Flag on but empty -> sin datos (check git data only, not meta fallback)
      if (!gitBranch && commits.length === 0 && !gitSync) {
        body.innerHTML = emptyState('Git', '{\"git\":{\"branch\":\"...\",\"commits\":[]}}');
        return;
      }

      // Render snapshot verbatim, zero runtime calls
      var kinds = Object.create(null);
      commits.forEach(function (commit) { var kind = commitKind(commit && (commit.message || commit.msg)); kinds[kind] = (kinds[kind] || 0) + 1; });
      var html = '<div class=\"git-workbench\">';
      if (branch) {
        html += '<div class=\"git-branch-banner\">'
          + '<div><span class=\"git-label\">Rama observada</span><strong>' + esc(branch) + '</strong></div>'
          + (syncStatus ? '<span class=\"badge\" style=\"color:var(--accent-green);border-color:rgba(63,185,80,0.3);font-size:10px;\"><span class=\"badge-dot completed\"></span> ' + esc(syncStatus) + '</span>' : '')
          + '</div>';
      }
      html += '<div class=\"git-summary-grid\"><div><strong>' + commits.length + '</strong><span> commits visibles</span></div><div><strong>' + Object.keys(kinds).length + '</strong><span> tipos detectados</span></div><div><strong>' + (syncStatus ? esc(syncStatus) : 'Sin dato') + '</strong><span> estado informado</span></div></div>';
      if (Object.keys(kinds).length) html += '<div class=\"git-kind-strip\">' + Object.keys(kinds).sort().map(function (kind) { return '<span class=\"git-kind\"><strong>' + esc(kind) + '</strong> ' + kinds[kind] + '</span>'; }).join('') + '</div>';
      if (commits.length > 0) {
        html += '<ol class=\"git-timeline\">';
        for (var i = 0; i < commits.length; i++) {
          var c = commits[i] || {};
          var hash = esc(c.hash || '');
          var msg = esc(c.message || c.msg || '');
          var short = hash ? hash.substring(0, 7) : '';
          var kind = commitKind(c.message || c.msg || '');
          html += '<li class=\"git-event\"><span class=\"git-event-index\">' + String(i + 1).padStart(2, '0') + '</span><span class=\"git-event-node\"></span><div class=\"git-event-card\" role=\"button\" tabindex=\"0\" aria-haspopup=\"dialog\" data-commit-index=\"' + i + '\" title=\"Clic para ver detalles del commit\"><div class=\"git-event-top\"><span class=\"git-kind\">' + esc(kind) + '</span><code>' + esc(short) + '</code></div><strong>' + (msg || 'sin mensaje') + '</strong></div></li>';
        }
        html += '</ol>';
      } else {
        html += '<div style=\"color:#8b949e;font-size:13px;margin-top:8px;\">sin commits</div>';
      }
      html += '</div>';
      body.innerHTML = html;

      // Delegate click on git cards
      function bindGitMount(mountEl) {
        if (!mountEl || mountEl.getAttribute('data-git-events-bound') === '1') return;
        mountEl.setAttribute('data-git-events-bound', '1');
        mountEl.addEventListener('click', function (event) {
          var card = event.target.closest('.git-event-card');
          if (!card || !mountEl.contains(card)) return;
          var idx = parseInt(card.getAttribute('data-commit-index'), 10);
          if (!isNaN(idx) && commits[idx]) {
            openGitDetailDialog(commits[idx], branch, syncStatus, state, doc, card);
          }
        });
        mountEl.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            var card = event.target.closest('.git-event-card');
            if (card && mountEl.contains(card)) {
              event.preventDefault();
              var idx = parseInt(card.getAttribute('data-commit-index'), 10);
              if (!isNaN(idx) && commits[idx]) {
                openGitDetailDialog(commits[idx], branch, syncStatus, state, doc, card);
              }
            }
          }
        });
      }

      bindGitMount(panel);

      // Also mirror to #full-git-mount if available
      var fullGit = doc.getElementById('full-git-mount');
      if (fullGit) {
        fullGit.innerHTML = '<div class=\"panel-card\">'
          + '<div class=\"panel-header\"><div class=\"panel-title\"><span>🌿 Git Commit Timeline & Activity</span></div><span class=\"badge\" style=\"color:var(--accent-purple);\">' + commits.length + ' commits</span></div>'
          + '<div class=\"panel-body\">' + html + '</div>'
          + '</div>';
        bindGitMount(fullGit);
      }
    } catch (e) {
      try {
        var b = panel.querySelector('.panel-body');
        if (b) b.innerHTML = '<div style=\"color:#8b949e;font-size:13px;\">sin datos — error contenido</div>';
        panel.style.display = '';
        panel.removeAttribute('hidden');
      } catch (_) {}
    }
  }

  function renderTree(state, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    var panel = doc.getElementById('project-structure-panel');
    if (!panel) return;
    try {
      if (!isEnabled('tree', state)) {
        panel.style.display = 'none';
        panel.setAttribute('hidden', '');
        return;
      }
      panel.style.display = '';
      panel.removeAttribute('hidden');

      var body = panel.querySelector('.panel-body');
      if (!body) return;

      var tree = state && state.tree;
      if (!Array.isArray(tree)) {
        if (tree != null && typeof tree !== 'undefined') {
          body.innerHTML = emptyState('árbol', '{"tree":[{"name":"...","depth":0}]}', 'tree válido');
          return;
        }
        tree = [];
      }

      if (tree.length === 0) {
        body.innerHTML = emptyState('árbol', '{"tree":[{"name":"...","depth":0}]}');
        return;
      }

      var dirs = 0, files = 0, maxDepth = 0;
      tree.forEach(function (item) { if (!item || typeof item !== 'object') return; if (item.type === 'dir') dirs++; else files++; maxDepth = Math.max(maxDepth, typeof item.depth === 'number' ? item.depth : 0); });
      var html = '<div class="tree-blueprint"><div class="tree-summary-grid"><div><strong>' + dirs + '</strong><span> ' + (dirs === 1 ? 'carpeta' : 'carpetas') + '</span></div><div><strong>' + files + '</strong><span> ' + (files === 1 ? 'archivo' : 'archivos') + '</span></div><div><strong>' + tree.length + '</strong><span> elementos</span></div><div><strong>' + maxDepth + '</strong><span> profundidad ' + maxDepth + '</span></div></div><div class="tree-view">';
      for (var i = 0; i < tree.length; i++) {
        var node = tree[i];
        if (!node || typeof node !== 'object' || typeof node.name !== 'string') {
          continue;
        }
        var name = esc(node.name);
        var depth = typeof node.depth === 'number' && node.depth >= 0 ? node.depth : 0;
        var type = node.type === 'dir' ? 'dir' : 'file';
        var indent = depth * 14;
        var icon = type === 'dir' ? '▣' : '◇';
        var cls = type === 'dir' ? 'tree-node dir' : 'tree-node';
        html += '<div class="' + cls + '" style="padding-left:' + indent + 'px;"><span class="tree-glyph">' + esc(icon) + '</span><span class="tree-path">' + name + '</span><span class="tree-type">' + (type === 'dir' ? 'DIR' : 'FILE') + '</span></div>';
      }
      if (html === '<div class="tree-view"') {
        html += '<div style="color:#8b949e;">sin datos</div>';
      }
      html += '</div></div>';
      body.innerHTML = html;

      var fullTree = doc.getElementById('full-tree-mount');
      if (fullTree) {
        fullTree.innerHTML = '<div class="panel-card">'
          + '<div class="panel-header"><div class="panel-title"><span>📁 Estructura del Repositorio & Blueprint</span></div><span class="badge">' + tree.length + ' elementos</span></div>'
          + '<div class="panel-body">' + html + '</div>'
          + '</div>';
      }
    } catch (e) {
      try {
        var b2 = panel.querySelector('.panel-body');
        if (b2) b2.innerHTML = '<div style="color:#8b949e;font-size:13px;">sin datos — error contenido</div>';
        panel.style.display = '';
        panel.removeAttribute('hidden');
      } catch (_) {}
    }
  }

  function renderCodegraph(state, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    var panel = doc.getElementById('codegraph-panel');
    if (!panel) return;
    try {
      if (!isEnabled('codegraph', state)) {
        panel.style.display = 'none';
        panel.setAttribute('hidden', '');
        return;
      }
      panel.style.display = '';
      panel.removeAttribute('hidden');

      var body = panel.querySelector('.panel-body');
      if (!body) return;

      var core = getCore();
      var graph = core && core.normalizeCodegraph ? core.normalizeCodegraph(state, { warnings: [] }) : { nodes: [], edges: [] };
      var nodes = graph.nodes, edges = graph.edges;

      if (nodes.length === 0 && edges.length === 0) {
        body.innerHTML = emptyState('Codegraph', '{"codegraph":{"nodes":[],"edges":[]}}');
        return;
      }

      var columns = Math.max(2, Math.min(4, Math.ceil(Math.sqrt(nodes.length))));
      var rows = Math.max(1, Math.ceil(nodes.length / columns));
      var cellW = 220, cellH = 160, svgW = Math.max(560, columns * cellW), svgH = Math.max(360, rows * cellH + 60);
      var positions = nodes.map(function (_, index) { var row = Math.floor(index / columns), col = index % columns, count = Math.min(columns, nodes.length - row * columns), offset = (svgW - count * cellW) / 2; return { x: offset + col * cellW + cellW / 2, y: 75 + row * cellH }; });
      var html = '<div class="codegraph-container"><div class="codegraph-summary"><div><strong>' + nodes.length + '</strong><span>módulos</span></div><div><strong>' + edges.length + '</strong><span>relaciones</span></div><p>Nodos interactivos dinámicos: arrastra los módulos con el mouse o haz clic para inspeccionar detalles.</p></div>';
      html += '<svg class="codegraph-svg" id="codegraph-svg-canvas" viewBox="0 0 ' + svgW + ' ' + svgH + '\" width=\"100%\" height=\"' + svgH + '\" role=\"img\" aria-label=\"Mapa de dependencias del proyecto\"><defs><marker id=\"graph-arrow\" markerWidth=\"8\" markerHeight=\"8\" refX=\"7\" refY=\"4\" orient=\"auto\"><path d=\"M0,0 L8,4 L0,8 z\" fill=\"var(--accent-blue)\"></path></marker></defs>';

      for (var e = 0; e < edges.length; e++) {
        var edge = edges[e];
        if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue;
        var fromIdx = -1, toIdx = -1;
        for (var n = 0; n < nodes.length; n++) {
          if (nodes[n].id === edge.from) fromIdx = n;
          if (nodes[n].id === edge.to) toIdx = n;
        }
        if (fromIdx === -1 || toIdx === -1) continue;
        var x1 = positions[fromIdx].x, y1 = positions[fromIdx].y, x2 = positions[toIdx].x, y2 = positions[toIdx].y, bend = Math.max(45, Math.abs(x2 - x1) * 0.28);
        html += '<path class="graph-edge graph-edge-flow" id="edge-' + esc(edge.from) + '-' + esc(edge.to) + '" data-from="' + esc(edge.from) + '" data-to="' + esc(edge.to) + '" d="M ' + x1 + ' ' + y1 + ' C ' + (x1 + bend) + ' ' + y1 + ', ' + (x2 - bend) + ' ' + y2 + ', ' + x2 + ' ' + y2 + '" fill="none" stroke="var(--accent-blue)" stroke-width="2.2" stroke-opacity="0.5" marker-end="url(#graph-arrow)"><title>' + esc(edge.label || (edge.from + ' → ' + edge.to)) + '</title></path>';
      }
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (!node || typeof node.id !== 'string') continue;
        var rawLabel = String(node.label || node.id).replace(/&amp;/g, '&');
        var label = esc(rawLabel);
        var cx = positions[i].x;
        var cy = positions[i].y;
        html += '<g class="graph-node" id="cg-node-' + esc(node.id) + '" data-codegraph-node="' + esc(node.id) + '" data-index="' + i + '" role="button" tabindex="0" aria-label="Abrir relaciones de ' + label + '" aria-expanded="false" transform="translate(' + cx + ',' + cy + ')" style="cursor:grab;">'
          + '<circle class="node-pulse" cx="0" cy="0" r="48"></circle>'
          + '<circle class="node-bg" cx="0" cy="0" r="48"></circle>'
          + '<circle cx="0" cy="0" r="44" fill="var(--bg-surface-secondary)" fill-opacity="0.85"></circle>'
          + '<circle cx="0" cy="-22" r="11" fill="var(--color-inprogress-bg)" stroke="var(--accent-blue)" stroke-width="1.2"></circle>'
          + '<text x="0" y="-18" text-anchor="middle" font-family="var(--font-mono)" font-size="9.5" font-weight="700" fill="var(--accent-blue)">' + esc(String(i + 1).padStart(2, '0')) + '</text>'
          + '<text x="0" y="3" text-anchor="middle" font-family="var(--font-sans)" font-size="12" font-weight="700" fill="#ffffff">' + label + '</text>'
          + '<text x="0" y="19" text-anchor="middle" font-family="var(--font-mono)" font-size="9.5" fill="var(--text-tertiary)">' + node.files.length + ' arch · ' + node.taskIds.length + ' tar</text>'
          + '</g>';
      }
      html += '</svg>';
      html += '<div class="graph-legend" style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;padding-top:10px;border-top:1px solid #30363d;font-size:11px;color:#8b949e;">'
        + '<div class="legend-item" style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:#58a6ff;display:inline-block;box-shadow:0 0 6px #58a6ff;"></span> Nodo Módulo</div>'
        + '<div class="legend-item" style="display:flex;align-items:center;gap:5px;"><span style="width:16px;height:2px;background:#58a6ff;display:inline-block;"></span> Dependencia</div>'
        + '<div class="legend-item">' + nodes.length + ' nodos · ' + edges.length + ' aristas</div>'
        + '</div>';
      if (!edges.length || nodes.some(function (node) { return !node.files.length || !node.taskIds.length || !node.details; })) html += '<p class="optional-empty">Relaciones explícitas disponibles; faltan files, taskIds o details en el JSON.</p>';
      html += '</div>';
      body.innerHTML = html;
      bindCodegraphDialog(doc, graph, positions);

    } catch (e) {
      try {
        var b3 = panel.querySelector('.panel-body');
        if (b3) b3.innerHTML = '<div style="color:#8b949e;font-size:13px;">sin datos — error contenido</div>';
        panel.style.display = '';
        panel.removeAttribute('hidden');
      } catch (_) {}
    }
  }

  function bindCodegraphDialog(doc, graph, initialPositions) {
    var dialog = doc.getElementById('codegraph-dialog');
    var mount = doc.getElementById('codegraph-panel');
    if (!dialog || !mount) return;
    mount._codegraph = graph;
    mount._positions = (initialPositions || []).map(function (p) { return { x: p.x, y: p.y }; });

    var svg = mount.querySelector('.codegraph-svg');

    function updateEdges(nodeId, newX, newY) {
      if (!svg || !graph || !graph.edges) return;
      var nodes = graph.nodes;
      var nodeMap = {};
      for (var n = 0; n < nodes.length; n++) {
        var el = mount.querySelector('#cg-node-' + nodes[n].id);
        if (nodes[n].id === nodeId) {
          nodeMap[nodeId] = { x: newX, y: newY };
        } else if (mount._positions && mount._positions[n]) {
          nodeMap[nodes[n].id] = mount._positions[n];
        }
      }

      graph.edges.forEach(function (edge) {
        if (!edge || !edge.from || !edge.to) return;
        var p1 = nodeMap[edge.from];
        var p2 = nodeMap[edge.to];
        if (!p1 || !p2) return;
        var pathEl = svg.querySelector('#edge-' + edge.from + '-' + edge.to);
        if (pathEl) {
          var bend = Math.max(45, Math.abs(p2.x - p1.x) * 0.28);
          pathEl.setAttribute('d', 'M ' + p1.x + ' ' + p1.y + ' C ' + (p1.x + bend) + ' ' + p1.y + ', ' + (p2.x - bend) + ' ' + p2.y + ', ' + p2.x + ' ' + p2.y);
        }
      });
    }

    // Interactive Drag and Hover Physics
    if (svg && svg.getAttribute('data-drag-bound') !== '1') {
      svg.setAttribute('data-drag-bound', '1');
      var draggingNode = null;
      var dragStartX = 0, dragStartY = 0, nodeStartX = 0, nodeStartY = 0;
      var hasMoved = false;

      svg.addEventListener('mousedown', function (event) {
        var nodeEl = event.target.closest('.graph-node');
        if (!nodeEl) return;
        var nodeId = nodeEl.getAttribute('data-codegraph-node');
        var idx = parseInt(nodeEl.getAttribute('data-index'), 10);
        if (isNaN(idx) || !mount._positions || !mount._positions[idx]) return;

        draggingNode = { el: nodeEl, id: nodeId, index: idx };
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        nodeStartX = mount._positions[idx].x;
        nodeStartY = mount._positions[idx].y;
        hasMoved = false;
        nodeEl.style.cursor = 'grabbing';
      });

      var win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
      if (win) {
        win.addEventListener('mousemove', function (event) {
          if (!draggingNode) return;
          var dx = event.clientX - dragStartX;
          var dy = event.clientY - dragStartY;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;

          var curX = nodeStartX + dx;
          var curY = nodeStartY + dy;
          mount._positions[draggingNode.index].x = curX;
          mount._positions[draggingNode.index].y = curY;

          draggingNode.el.setAttribute('transform', 'translate(' + curX + ',' + curY + ')');
          updateEdges(draggingNode.id, curX, curY);
        });

        win.addEventListener('mouseup', function () {
          if (draggingNode) {
            draggingNode.el.style.cursor = 'grab';
            draggingNode = null;
          }
        });
      }

      // Edge hover highlighting
      mount.addEventListener('mouseover', function (event) {
        var nodeEl = event.target.closest('.graph-node');
        if (!nodeEl) return;
        var nodeId = nodeEl.getAttribute('data-codegraph-node');
        svg.querySelectorAll('.graph-edge').forEach(function (e) {
          var from = e.getAttribute('data-from');
          var to = e.getAttribute('data-to');
          if (from === nodeId || to === nodeId) {
            e.classList.add('active');
          } else {
            e.classList.remove('active');
          }
        });
      });

      mount.addEventListener('mouseout', function (event) {
        var nodeEl = event.target.closest('.graph-node');
        if (!nodeEl) {
          svg.querySelectorAll('.graph-edge').forEach(function (e) { e.classList.remove('active'); });
        }
      });
    }

    if (mount.dataset.codegraphBound) return;
    mount.dataset.codegraphBound = 'true';

    function open(target) {
      var id = target.getAttribute('data-codegraph-node'), node = mount._codegraph.nodes.filter(function (item) { return item.id === id; })[0];
      if (!node) return;
      var edges = mount._codegraph.edges.filter(function (edge) { return edge.from === id || edge.to === id; });
      var related = edges.map(function (edge) { var relatedId = edge.from === id ? edge.to : edge.from; var relatedNode = mount._codegraph.nodes.filter(function (item) { return item.id === relatedId; })[0]; return relatedNode ? relatedNode.label : relatedId; });
      var details = [node.details].concat(edges.map(function (edge) { return edge.details; })).filter(Boolean).join('\n');
      dialog.querySelector('#codegraph-dialog-title').textContent = node.label;
      dialog.querySelector('#codegraph-dialog-description').textContent = 'Relaciones explícitas de Codegraph';
      dialog.classList.add('codegraph-dialog-large');
      var relationRows = edges.map(function (edge) { var outbound = edge.from === id, relatedId = outbound ? edge.to : edge.from, relatedNode = mount._codegraph.nodes.filter(function (item) { return item.id === relatedId; })[0]; return '<li><span class="badge-tag">' + (outbound ? 'sale' : 'entra') + '</span><strong>' + esc(relatedNode ? relatedNode.label : relatedId) + '</strong><span>' + esc(edge.label || 'sin etiqueta') + '</span>' + (edge.details ? '<small>' + esc(edge.details) + '</small>' : '') + '</li>'; }).join('');
      dialog.querySelector('#codegraph-dialog-content').innerHTML = '<div class="codegraph-dialog-stats"><div><strong>' + edges.length + '</strong><span> ' + (edges.length === 1 ? 'relación' : 'relaciones') + '</span></div><div><strong>' + node.files.length + '</strong><span> archivos</span></div><div><strong>' + node.taskIds.length + '</strong><span> tareas</span></div></div><div class="codegraph-dialog-grid"><section><h3>Relaciones explícitas</h3><ul class="codegraph-relation-list">' + (relationRows || '<li>Sin relaciones explícitas</li>') + '</ul></section><section><h3>Archivos vinculados</h3><div class="codegraph-chip-list">' + (node.files.length ? node.files.map(function (file) { return '<code>' + esc(file) + '</code>'; }).join('') : '<span>Sin archivos informados</span>') + '</div><h3>Tareas vinculadas</h3><div class="codegraph-chip-list">' + (node.taskIds.length ? node.taskIds.map(function (taskId) { return '<code>' + esc(taskId) + '</code>'; }).join('') : '<span>Sin tareas informadas</span>') + '</div></section></div><section class="codegraph-details"><h3>Detalle del módulo</h3><pre>' + esc(details || 'Sin detalle informado') + '</pre></section>';
      dialog._trigger = target; dialog.dataset.open = 'true';
      if (dialog.showModal) dialog.showModal();
      (dialog.querySelector('[data-codegraph-close]') || dialog).focus();
    }
    mount.addEventListener('click', function (event) { var target = event.target.closest && event.target.closest('[data-codegraph-node]'); if (target) open(target); });
    mount.addEventListener('keydown', function (event) { var target = event.target.closest && event.target.closest('[data-codegraph-node]'); if (target && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(target); } });
    dialog.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab' || dialog.dataset.open !== 'true') return;
      var focusables = Array.prototype.slice.call(dialog.querySelectorAll('button, [href], [tabindex]')).filter(function (item) { return !item.hidden && !item.disabled && item.getAttribute('tabindex') !== '-1'; });
      if (!focusables.length) return;
      event.preventDefault();
      var index = focusables.indexOf(doc.activeElement);
      var next = event.shiftKey ? (index <= 0 ? focusables.length - 1 : index - 1) : (index === -1 || index === focusables.length - 1 ? 0 : index + 1);
      focusables[next].focus();
    });
    dialog.querySelector('[data-codegraph-close]').addEventListener('click', function () { closeCodegraphDialog(doc); });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeCodegraphDialog(doc);
    });
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); closeCodegraphDialog(doc); });
  }
  function closeCodegraphDialog(doc) { var dialog = doc.getElementById('codegraph-dialog'); if (!dialog) return; if (dialog.close) dialog.close(); dialog.dataset.open = 'false'; if (dialog._trigger && dialog._trigger.focus) dialog._trigger.focus(); }

  function renderAllPanels(state, doc) {
    renderGit(state, doc);
    renderTree(state, doc);
    renderCodegraph(state, doc);
  }

  var TMPanel = {
    renderGit: renderGit,
    renderTree: renderTree,
    renderCodegraph: renderCodegraph,
    closeCodegraphDialog: closeCodegraphDialog,
    renderAllPanels: renderAllPanels
  };

  try { if (typeof window !== 'undefined') window.TMPanel = TMPanel; } catch (_) {}
  try { if (typeof globalThis !== 'undefined') globalThis.TMPanel = TMPanel; } catch (_) {}
  try { if (typeof global !== 'undefined') global.TMPanel = TMPanel; } catch (_) {}
  try { if (typeof module !== 'undefined' && module.exports) module.exports = TMPanel; } catch (_) {}

})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : this);
