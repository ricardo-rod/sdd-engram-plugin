// @ts-nocheck
// tests/helpers.mjs — dev-only test utilities for drop-in-task-manager
// English comments, Spanish labels placeholder for fixture data.
// Provides island fixture builder + happy-dom mount util.

import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Minimal valid island state per design Interfaces
// ---------------------------------------------------------------------------
export const minimalState = {
  schemaVersion: '1.0',
  meta: {
    projectName: 'Drop-In Task Manager',
    version: '1.0.0',
    branch: 'main',
    commit: '',
    syncStatus: '',
    labels: { es: {} },
    features: { git: false, tree: false, codegraph: false },
  },
  phases: [],
  todos: [],
  git: { branch: '', commits: [], syncStatus: '' },
  tree: [],
  codegraph: { nodes: [], edges: [] },
};

// Deep clone helper (pure, no mutation)
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Simple deep merge for test overrides (shallow for arrays, deep for objects)
function deepMerge(target, source) {
  const out = deepClone(target);
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = deepClone(value);
    }
  }
  return out;
}

/**
 * Build a state object by merging overrides onto minimalState.
 * @param {object} overrides - partial state to override
 * @returns {object} new state object (not mutated)
 */
export function createState(overrides = {}) {
  if (Object.keys(overrides).length === 0) return deepClone(minimalState);
  return deepMerge(minimalState, overrides);
}

/**
 * Build a state with example phases/tasks for tests.
 * Spanish labels placeholder per spec (meta.labels.es fallback).
 */
export function createExampleState() {
  return createState({
    meta: {
      projectName: 'Proyecto Ejemplo',
      version: '2.0.0',
      labels: {
        es: {
          overallProgress: 'Progreso Global',
          filterAll: 'Todas',
          filterActive: 'Activas',
        },
      },
      features: { git: true, tree: true, codegraph: true },
    },
    phases: [
      {
        id: 'phase-1',
        number: 1,
        title: 'Configuración Inicial',
        status: 'completed',
        target: 'Q1',
        lead: 'Equipo Arquitectura',
        tasks: [
          { id: 'T1-01', title: 'Definir esquema', status: 'completed', tag: 'Backend', note: 'nota segura', owner: 'Ana', commit: 'abc123' },
          { id: 'T1-02', title: 'Otra tarea', status: 'pending', tag: 'Docs', note: 'pendiente', owner: 'Luis', commit: '' },
        ],
      },
      {
        id: 'phase-2',
        number: 2,
        title: 'Desarrollo',
        status: 'in-progress',
        target: 'Q2',
        lead: 'Equipo Dev',
        tasks: [
          { id: 'T2-01', title: 'Tarea activa', status: 'in-progress', tag: 'Frontend', note: 'en progreso', owner: 'Maya', commit: '' },
          { id: 'T2-02', title: 'Bloqueada', status: 'blocked', tag: 'Infra', note: 'bloqueada', owner: 'DevOps', commit: '' },
        ],
      },
    ],
    todos: [
      { id: 'td-1', text: 'Revisar tokens', priority: 'P0', done: false },
      { id: 'td-2', text: 'Hecho', priority: 'P1', done: true },
    ],
    git: {
      branch: 'main',
      commits: [{ hash: 'abc123', message: 'feat: init' }],
      syncStatus: 'synced',
    },
    tree: [
      { name: 'src/', depth: 0, type: 'dir' },
      { name: 'app.ts', depth: 1, type: 'file' },
    ],
    codegraph: {
      nodes: [{ id: 'n1', label: 'A' }],
      edges: [{ from: 'n1', to: 'n1' }],
    },
  });
}

/**
 * Escape </script> for safe island embedding.
 * MUST encode as \u003c/script\u003e per ai-orchestrator-contract.
 */
export function escapeIslandJson(state) {
  const json = typeof state === 'string' ? state : JSON.stringify(state);
  return json.replace(/<\/script>/gi, '\\u003c/script\\u003e');
}

/**
 * Create a happy-dom Window+Document from an HTML string.
 * Optionally inject island JSON into #tm-state if present.
 *
 * @param {string} html - full HTML string
 * @param {object|string|null} islandState - object to stringify+escape, or raw string, or null to leave untouched
 * @returns {{ window: Window, document: Document }}
 */
export function createDom(html, islandState = null) {
  const window = new Window({ url: 'http://localhost/', settings: { enableJavaScriptEvaluation: true } });
  const document = window.document;
  // Use write to trigger parser like browser does
  document.write(html);
  document.close();

  if (islandState !== null) {
    const island = document.getElementById('tm-state');
    if (island) {
      const jsonText = typeof islandState === 'string' ? islandState : escapeIslandJson(islandState);
      island.textContent = jsonText;
    }
  }

  return { window, document };
}

/**
 * Read skeleton HTML file from disk (relative to project root).
 * @returns {string} file content
 */
export function readSkeleton() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const skeletonPath = path.join(projectRoot, 'modules', '01-skeleton.html');
  return readFileSync(skeletonPath, 'utf-8');
}

/**
 * Mount skeleton with optional state override (happy-dom).
 * Convenience for tests that need a live DOM with island populated.
 * @param {object|string|null} stateOverride - if provided, injects into island
 * @returns {{ window: Window, document: Document, html: string }}
 */
export function mountSkeleton(stateOverride = null) {
  const html = readSkeleton();
  const { window, document } = createDom(html, stateOverride);
  return { window, document, html };
}

/**
 * Read prototype tokens verbatim source (for comparison in tests).
 * @returns {string} prototype index.html content
 */
export function readPrototype() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const protoPath = path.join(projectRoot, 'project-tracking-dashboard', 'index.html');
  return readFileSync(protoPath, 'utf-8');
}
