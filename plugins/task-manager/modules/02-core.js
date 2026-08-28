// @ts-nocheck
// modules/02-core.js — Core state parse/validate/derive/escape (PR2, classic script, no imports)
// English comments. Spanish labels handled via meta.labels.es fallback in later renderers.
// Classic script: attaches to window/globalThis as TMCore, no ESM import/export.
(function (global) {
  'use strict';

  /**
   * Parse island JSON text (textContent of #tm-state).
   * MUST handle \u003c/script\u003e escaped form; JSON.parse decodes it.
   * @param {string} text
   * @returns {object} parsed state
   * @throws {SyntaxError} if JSON invalid
   */
  function parseIsland(text) {
    if (typeof text !== 'string') throw new SyntaxError('Island text must be string');
    var trimmed = text.trim();
    if (!trimmed) throw new SyntaxError('Island JSON empty');
    // JSON.parse will correctly decode \u003c
    return JSON.parse(trimmed);
  }

  /**
   * Escape HTML for safe innerHTML insertion.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Escape closing script tag for safe island embedding.
   * MUST encode as \u003c/script\u003e per ai-orchestrator-contract.
   * @param {object|string} state
   * @returns {string}
   */
  function escapeIslandJson(state) {
    var json = typeof state === 'string' ? state : JSON.stringify(state);
    return json.replace(/<\/script>/gi, '\\u003c/script\\u003e');
  }

  /**
   * Check if feature flag enabled.
   * @param {string} feature - git | tree | codegraph | help | todo
   * @param {object} state
   * @returns {boolean}
   */
  function isEnabled(feature, state) {
    if (!state || !state.meta || !state.meta.features) return false;
    return state.meta.features[feature] === true;
  }

  /**
   * Validate state shape.
   * Never throws; returns {ok, errors, warnings} and never white-screens.
   * Unknown status is NOT error (mapped to pending in derive).
   * @param {any} obj
   * @returns {{ok:boolean, errors:string[], warnings:string[]}}
   */
  function validateState(obj) {
    var errors = [];
    var warnings = [];

    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      errors.push('State must be an object');
      return { ok: false, errors: errors, warnings: warnings };
    }

    if (obj.schemaVersion !== '1.0') {
      errors.push('schemaVersion must be "1.0" (got ' + String(obj.schemaVersion) + ')');
    }

    if (!obj.meta || typeof obj.meta !== 'object') {
      errors.push('meta must exist and be object');
    } else {
      if (typeof obj.meta.projectName !== 'string') warnings.push('meta.projectName should be string');
      if (obj.meta.features && typeof obj.meta.features !== 'object') warnings.push('meta.features should be object');
    }

    if (!Array.isArray(obj.phases)) {
      errors.push('phases must be array');
    } else {
      for (var i = 0; i < obj.phases.length; i++) {
        var phase = obj.phases[i];
        if (!phase || typeof phase !== 'object') {
          errors.push('phase[' + i + '] must be object');
          continue;
        }
        if (typeof phase.id !== 'string' || !phase.id) warnings.push('phase[' + i + '].id missing');
        if (!Array.isArray(phase.tasks)) {
          // Per spec: missing tasks array warned, not fatal, but treat as empty for derive
          warnings.push('phase[' + i + '] tasks must be array (got ' + String(phase.tasks) + ')');
          // Normalize to empty for downstream? Don't mutate input, just warn.
        } else {
          for (var j = 0; j < phase.tasks.length; j++) {
            var task = phase.tasks[j];
            if (!task || typeof task !== 'object') {
              warnings.push('task[' + i + '][' + j + '] must be object');
              continue;
            }
            if (typeof task.id !== 'string') warnings.push('task ' + String(task.id) + ' id should be string');
            // status: allow any string, unknown will map to pending in derive
            if (task.status && ['completed', 'in-progress', 'pending', 'blocked'].indexOf(task.status) === -1) {
              // Not error, just note - will be treated as pending
              warnings.push('task ' + task.id + ' has unknown status "' + task.status + '" -> pending');
            }
            // Outside-island text ignored: extra fields are allowed
          }
        }
      }
    }

    // todos, git, tree, codegraph are optional but if present should be correct type
    if (obj.todos !== undefined && !Array.isArray(obj.todos)) warnings.push('todos should be array');
    if (obj.git !== undefined && (typeof obj.git !== 'object' || obj.git === null)) warnings.push('git should be object');
    if (obj.tree !== undefined && !Array.isArray(obj.tree)) warnings.push('tree should be array');
    if (obj.codegraph !== undefined && (typeof obj.codegraph !== 'object' || obj.codegraph === null)) warnings.push('codegraph should be object');

    // Check for raw closing script tag inside stringified state? The island text check is done outside this function,
    // but if obj contains raw closing tag after parse, that's okay (it was escaped as \u003c). We don't error.

    var ok = errors.length === 0;
    return { ok: ok, errors: errors, warnings: warnings };
  }

  /**
   * Normalize status: unknown -> pending
   * @param {string} s
   * @returns {'completed'|'in-progress'|'pending'|'blocked'}
   */
  function normalizeStatus(s) {
    if (s === 'completed' || s === 'in-progress' || s === 'pending' || s === 'blocked') return s;
    return 'pending';
  }

  function normalizeCodegraph(state, diagnostics) {
    var source = state && state.codegraph || {};
    var warnings = diagnostics && Array.isArray(diagnostics.warnings) ? diagnostics.warnings : [];
    function strings(value) { return Array.isArray(value) ? value.filter(function (item) { return typeof item === 'string'; }) : []; }
    var nodes = (Array.isArray(source.nodes) ? source.nodes : []).reduce(function (list, node, index) {
      if (!node || typeof node.id !== 'string' || !node.id) { warnings.push('Invalid Codegraph node at index ' + index); return list; }
      list.push({ id: node.id, label: typeof node.label === 'string' ? node.label : node.id, files: strings(node.files), taskIds: strings(node.taskIds), details: typeof node.details === 'string' ? node.details : '' });
      return list;
    }, []);
    var edges = (Array.isArray(source.edges) ? source.edges : []).reduce(function (list, edge, index) {
      if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') { warnings.push('Invalid Codegraph edge at index ' + index); return list; }
      list.push({ from: edge.from, to: edge.to, label: typeof edge.label === 'string' ? edge.label : '', details: typeof edge.details === 'string' ? edge.details : '' });
      return list;
    }, []);
    return { nodes: nodes, edges: edges };
  }

  /**
   * Derive metrics from state. Pure, no side effects.
   * Handles 0/0 -> 0, no NaN, rounding Math.round.
   * @param {object} state
   * @returns {{overallPct:number, total:number, completed:number, distribution:{completed:number,inprogress:number,pending:number,blocked:number}, perPhase:Array<{id:string,pct:number,total:number,completed:number}>}}
   */
  function deriveMetrics(state) {
    var total = 0;
    var completed = 0;
    var distribution = { completed: 0, 'in-progress': 0, pending: 0, blocked: 0 };
    // Also provide alias inprogress without hyphen for convenience
    distribution.inprogress = 0;
    var perPhase = [];

    if (!state || !Array.isArray(state.phases)) {
      return { overallPct: 0, total: 0, completed: 0, distribution: { completed: 0, inprogress: 0, pending: 0, blocked: 0, 'in-progress': 0 }, perPhase: [] };
    }

    for (var i = 0; i < state.phases.length; i++) {
      var phase = state.phases[i];
      var tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
      var phaseTotal = tasks.length;
      var phaseCompleted = 0;
      for (var j = 0; j < tasks.length; j++) {
        var rawStatus = tasks[j] ? tasks[j].status : 'pending';
        var status = normalizeStatus(rawStatus);
        total++;
        if (status === 'completed') {
          completed++;
          phaseCompleted++;
          distribution.completed++;
        } else if (status === 'in-progress') {
          distribution['in-progress']++;
          distribution.inprogress++;
        } else if (status === 'blocked') {
          distribution.blocked++;
        } else {
          // pending
          distribution.pending++;
        }
      }
      var pct = phaseTotal === 0 ? 0 : Math.round((phaseCompleted / phaseTotal) * 100);
      // Guard NaN
      if (isNaN(pct)) pct = 0;
      perPhase.push({ id: phase.id || ('phase-' + i), pct: pct, total: phaseTotal, completed: phaseCompleted });
    }

    var overallPct = total === 0 ? 0 : Math.round((completed / total) * 100);
    if (isNaN(overallPct)) overallPct = 0;

    // Normalize distribution object to expected shape (tests may check both inprogress and 'in-progress')
    var normalizedDist = {
      completed: distribution.completed,
      inprogress: distribution['in-progress'] || distribution.inprogress || 0,
      'in-progress': distribution['in-progress'] || distribution.inprogress || 0,
      pending: distribution.pending,
      blocked: distribution.blocked
    };
    // Also expose inprogress alias
    normalizedDist.inprogress = normalizedDist['in-progress'];

    return { overallPct: overallPct, total: total, completed: completed, distribution: normalizedDist, perPhase: perPhase };
  }

  function textValue(value) {
    return value == null ? '' : String(value).trim();
  }

  function emptyBucket() {
    return { total: 0, completed: 0, active: 0, blocked: 0 };
  }

  function addToBucket(map, key, status) {
    var bucket = map[key] || (map[key] = emptyBucket());
    bucket.total++;
    if (status === 'completed') bucket.completed++;
    if (status === 'in-progress') bucket.active++;
    if (status === 'blocked') bucket.blocked++;
  }

  function taskRecords(state, diagnostics) {
    var records = [];
    var seenIds = Object.create(null);
    var phases = state && Array.isArray(state.phases) ? state.phases : [];
    for (var i = 0; i < phases.length; i++) {
      var phase = phases[i] || {};
      var tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
      var phaseId = textValue(phase.id) || ('phase-' + i);
      var phaseTitle = textValue(phase.title) || ('Phase ' + (i + 1));
      for (var j = 0; j < tasks.length; j++) {
        var task = tasks[j] && typeof tasks[j] === 'object' ? tasks[j] : {};
        var id = textValue(task.id) || ('task-' + i + '-' + j);
        var title = textValue(task.title);
        var owner = textValue(task.owner) || 'Unassigned';
        var tag = textValue(task.tag) || 'Untagged';
        var status = normalizeStatus(task.status);
        if (seenIds[id]) diagnostics.warnings.push('Duplicate task ID: ' + id);
        seenIds[id] = true;
        if (!title) diagnostics.warnings.push('Task ' + id + ' missing title');
        if (task.owner == null || !textValue(task.owner)) diagnostics.warnings.push('Task ' + id + ' missing owner');
        if (task.tag == null || !textValue(task.tag)) diagnostics.warnings.push('Task ' + id + ' missing tag');
        if (task.risk !== undefined && ['low', 'med', 'high'].indexOf(task.risk) === -1) diagnostics.warnings.push('Invalid risk for task ' + id + ': ' + String(task.risk));
        records.push({
          id: id,
          title: title,
          note: textValue(task.note),
          status: status,
          owner: owner,
          tag: tag,
          risk: ['low', 'med', 'high'].indexOf(task.risk) === -1 ? 'low' : task.risk,
          blockedReason: textValue(task.blockedReason),
          phaseId: phaseId,
          phaseTitle: phaseTitle,
          phaseNumber: phase.number,
          source: task
        });
      }
    }
    return records;
  }

  function normalizeHistory(state, diagnostics) {
    var source = state && state.meta && Array.isArray(state.meta.history) ? state.meta.history : [];
    var valid = [];
    for (var i = 0; i < source.length; i++) {
      var point = source[i];
      var timestamp = point && Date.parse(point.timestamp);
      var completed = point && point.completed;
      var total = point && point.total;
      if (!point || !isFinite(timestamp) || typeof completed !== 'number' || !isFinite(completed) || typeof total !== 'number' || !isFinite(total) || total < 0 || completed < 0 || completed > total) {
        diagnostics.warnings.push('Invalid history entry at index ' + i);
        continue;
      }
      valid.push({ timestamp: new Date(timestamp).toISOString(), completed: completed, total: total, _time: timestamp });
    }
    valid.sort(function (a, b) { return a._time - b._time; });
    valid = valid.slice(-12);
    for (var j = 0; j < valid.length; j++) delete valid[j]._time;
    return valid;
  }

  function deriveForecast(history) {
    var unavailable = { available: false, reason: 'At least three valid history points are required', label: 'Forecast unavailable' };
    if (history.length < 3) return unavailable;
    var first = history[0];
    var last = history[history.length - 1];
    var velocity = (last.completed - first.completed) / Math.max(1, history.length - 1);
    if (!(velocity > 0)) {
      unavailable.reason = 'Positive completion velocity is required';
      return unavailable;
    }
    var remaining = Math.max(0, last.total - last.completed);
    var sessions = remaining / velocity;
    var center = Math.max(0, Math.round(sessions));
    return {
      available: true,
      confidence: 'low',
      range: { min: Math.max(0, Math.floor(center * 0.75)), max: Math.ceil(center * 1.25) },
      sessions: center,
      label: 'Low confidence trend estimate',
      assumptions: ['Recent completion velocity remains representative']
    };
  }

  function deriveInsights(state, validation) {
    var diagnostics = { errors: [], warnings: [] };
    if (validation) {
      if (Array.isArray(validation.errors)) diagnostics.errors = validation.errors.slice();
      if (Array.isArray(validation.warnings)) diagnostics.warnings = validation.warnings.slice();
    }
    var tasks = taskRecords(state, diagnostics);
    var dimensions = { owner: {}, tag: {}, phase: {}, status: {} };
    var blockers = { total: 0, tasks: [] };
    for (var i = 0; i < tasks.length; i++) {
      var record = tasks[i];
      addToBucket(dimensions.owner, record.owner, record.status);
      addToBucket(dimensions.tag, record.tag, record.status);
      addToBucket(dimensions.phase, record.phaseId, record.status);
      addToBucket(dimensions.status, record.status, record.status);
      if (record.status === 'blocked') {
        blockers.total++;
        blockers.tasks.push(record);
      }
    }
    var history = normalizeHistory(state, diagnostics);
    return {
      metrics: deriveMetrics(state),
      tasks: tasks,
      dimensions: dimensions,
      blockers: blockers,
      diagnostics: diagnostics,
      history: history,
      forecast: deriveForecast(history)
    };
  }

  function matchesTask(record, filters) {
    record = record || {};
    filters = filters || {};
    var text = textValue(filters.text || filters.query).toLowerCase();
    var haystack = [record.id, record.title, record.note].map(textValue).join(' ').toLowerCase();
    if (text && haystack.indexOf(text) === -1) return false;
    var status = textValue(filters.status).toLowerCase();
    if (status && status !== 'all' && !(status === 'active' && record.status !== 'completed') && status !== textValue(record.status).toLowerCase()) return false;
    var owner = textValue(filters.owner);
    if (owner && owner.toLowerCase() !== textValue(record.owner).toLowerCase()) return false;
    var tag = textValue(filters.tag);
    if (tag && tag.toLowerCase() !== textValue(record.tag).toLowerCase()) return false;
    var phase = textValue(filters.phase);
    if (phase && phase.toLowerCase() !== textValue(record.phaseId).toLowerCase() && phase.toLowerCase() !== textValue(record.phaseTitle).toLowerCase()) return false;
    return true;
  }

  var UI_PREFERENCES_KEY = 'tm-ui-preferences';
  var UI_PREFERENCE_VERSION = 1;
  var VIEW_IDS = ['overview', 'phases', 'kanban', 'codegraph', 'tree', 'git', 'help'];
  var FILTER_STATUSES = ['all', 'active', 'completed', 'in-progress', 'pending', 'blocked'];

  function defaultUiPreferences() {
    return { version: UI_PREFERENCE_VERSION, activeView: 'overview', filters: { text: '', status: 'all', owner: '', tag: '', phase: '' }, expandedPhaseIds: [], expandedPreviewKeys: [] };
  }

  function boundedString(value, maximum) {
    return typeof value === 'string' && value.length <= maximum ? value : '';
  }

  function uniqueStrings(value, maximumCount, maximumLength) {
    var result = [];
    if (!Array.isArray(value)) return result;
    for (var i = 0; i < value.length && result.length < maximumCount; i++) {
      var item = boundedString(value[i], maximumLength);
      if (item && result.indexOf(item) === -1) result.push(item);
    }
    return result;
  }

  function sanitizeUiPreferences(value) {
    var defaults = defaultUiPreferences();
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== UI_PREFERENCE_VERSION) return defaults;
    var filters = value.filters && typeof value.filters === 'object' && !Array.isArray(value.filters) ? value.filters : {};
    var activeView = VIEW_IDS.indexOf(value.activeView) !== -1 ? value.activeView : defaults.activeView;
    var status = FILTER_STATUSES.indexOf(filters.status) !== -1 ? filters.status : defaults.filters.status;
    return {
      version: UI_PREFERENCE_VERSION,
      activeView: activeView,
      filters: { text: typeof filters.text === 'string' ? filters.text.slice(0, 256) : '', status: status, owner: boundedString(filters.owner, 128), tag: boundedString(filters.tag, 128), phase: boundedString(filters.phase, 128) },
      expandedPhaseIds: uniqueStrings(value.expandedPhaseIds, 100, 128),
      expandedPreviewKeys: uniqueStrings(value.expandedPreviewKeys, 100, 256)
    };
  }

  function createUiPreferenceStore(storage) {
    var current = defaultUiPreferences();
    function load() {
      try { current = sanitizeUiPreferences(JSON.parse(storage && storage.getItem(UI_PREFERENCES_KEY) || 'null')); } catch (_) {}
      return current;
    }
    function save(next) {
      current = sanitizeUiPreferences(next);
      try { if (storage) storage.setItem(UI_PREFERENCES_KEY, JSON.stringify(current)); } catch (_) {}
      return current;
    }
    return { load: load, save: save };
  }

  function storageForDocument(doc) {
    var win = doc && doc.defaultView;
    try {
      if (!win || !win.location || win.location.protocol === 'file:') return null;
      return win.localStorage || null;
    } catch (_) {
      return null;
    }
  }

  function createBootstrapContext(doc, suppliedState) {
    var result = getStateFromDocument(doc);
    var rawIslandBytes = doc && doc.getElementById('tm-state') ? doc.getElementById('tm-state').textContent : '';
    var state = suppliedState || result && result.state || null;
    return { rawIslandBytes: rawIslandBytes, state: state, validation: result && result.validation, viewModels: state ? deriveInsights(state, result.validation) : null, preferences: createUiPreferenceStore(storageForDocument(doc)).load() };
  }

  /**
   * Read island from document by id tm-state, parse and validate, show banner on fail.
   * Never throws uncaught; returns {state, validation, error} or null on failure.
   * Banner element expected: #tm-error-banner (hidden by default)
   * @param {Document} doc
   * @returns {{state:object, validation:object}|{error:string, validation:object}}
   */
  function getStateFromDocument(doc) {
    try {
      var island = doc.getElementById('tm-state');
      if (!island) {
        return { error: 'Island #tm-state not found', validation: { ok: false, errors: ['Island not found'], warnings: [] } };
      }
      // Check raw text contains no unescaped closing script tag (split to avoid HTML parser breaking)
      var raw = island.textContent || '';
      if (raw.includes('<' + '/script>')) {
        // This should have been escaped; treat as error
        return { error: 'Island contains raw <' + '/script> (must be \\u003c/script\\u003e)', validation: { ok: false, errors: ['Raw <' + '/script>'], warnings: [] } };
      }
      var parsed = parseIsland(raw);
      var validation = validateState(parsed);
      if (!validation.ok) {
        return { error: validation.errors.join('; '), validation: validation, state: parsed };
      }
      return { state: parsed, validation: validation };
    } catch (e) {
      return { error: e && e.message ? e.message : String(e), validation: { ok: false, errors: [String(e)], warnings: [] } };
    }
  }

  // Public API
  var TMCore = {
    parseIsland: parseIsland,
    validateState: validateState,
    escapeHtml: escapeHtml,
    escapeIslandJson: escapeIslandJson,
    isEnabled: isEnabled,
    deriveMetrics: deriveMetrics,
    deriveInsights: deriveInsights,
    normalizeCodegraph: normalizeCodegraph,
    matchesTask: matchesTask,
    getStateFromDocument: getStateFromDocument,
    UI_PREFERENCES_KEY: UI_PREFERENCES_KEY,
    defaultUiPreferences: defaultUiPreferences,
    sanitizeUiPreferences: sanitizeUiPreferences,
    createUiPreferenceStore: createUiPreferenceStore,
    storageForDocument: storageForDocument,
    createBootstrapContext: createBootstrapContext,
    _normalizeStatus: normalizeStatus
  };

  // Attach to global for classic script usage
  try {
    if (typeof window !== 'undefined') window.TMCore = TMCore;
  } catch (_) {}
  try {
    if (typeof globalThis !== 'undefined') globalThis.TMCore = TMCore;
  } catch (_) {}
  try {
    if (typeof global !== 'undefined') global.TMCore = TMCore;
  } catch (_) {}

  // Also for Node/CommonJS if required
  try {
    if (typeof module !== 'undefined' && module.exports) module.exports = TMCore;
  } catch (_) {}

})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : this);
