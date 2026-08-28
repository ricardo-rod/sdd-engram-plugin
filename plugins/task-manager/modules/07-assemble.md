# Assembly & file:// Checklist — Task-Manager-Portable.html

## Concat Order (classic scripts, no bundler)
1. `modules/01-skeleton.html` — head, :root tokens verbatim, chrome shells, empty tm-state island (no logic scripts)
2. `modules/02-core.js` — parseIsland, validateState, escapeHtml, isEnabled, deriveMetrics, banner hook
3. `modules/03-header-hud.js` — renderHeader, renderHud
4. `modules/04-phases.js` — renderPhases, accordion events, All/Active filter (view-pref localStorage only)
5. `modules/05-panels.js` — renderGit, renderTree, renderCodegraph behind isEnabled + try/catch containment
6. `modules/06-todo-help.js` — renderTodo, help tab, label resolver (meta.labels.es fallback)
7. `scripts/assemble.mjs` — simple string concat in above order → `Task-Manager-Portable.html` (single file), replaces island escaping.

Manual concat command:
```bash
node scripts/assemble.mjs
# reads modules in order, writes Task-Manager-Portable.html at project root
```

## file:// Verification Checklist (per module + final)
Run after each module and final assemble. Tick all:

- [ ] Double-click final `Task-Manager-Portable.html` opens via `file://` with no server
- [ ] DevTools Console: zero errors, zero warnings
- [ ] DevTools Network: zero requests (no fetch, XHR, import, remote src/href)
- [ ] View Source: exactly one `<script type="application/json" id="tm-state">`, no `<script src=`, no `fetch(` / `XMLHttpRequest` / `import` outside comments
- [ ] Island JSON valid (`JSON.parse` succeeds), `schemaVersion: "1.0"`, no raw `</script>` inside island (must be `\u003c/script\u003e`)
- [ ] Chrome shells visible: header, HUD cards, dashboard-layout grid, todo, phases, git/tree/codegraph shells, help tab, hidden error banner
- [ ] Dark theme: `var(--bg-canvas)` background (#0b0e14), tokens match prototype verbatim
- [ ] Spanish labels via `meta.labels.es` fallback works; code/comments remain English
- [ ] Banner behavior: truncated JSON → dismissible banner, never white-screen; hostile `</script>` in task note round-trips
- [ ] Flag gate: with `features.git/tree/codegraph:false` panels hidden or show `sin datos` placeholder; with `true` but empty → `sin datos`; with data → renders verbatim snapshot
- [ ] Help tab: copy-anywhere instructions, AI update protocol, schema summary visible
- [ ] No localStorage of task state (only view prefs allowed per spec)
- [ ] Welcome modal dialog opens on launch with copyable Master Prompt and close buttons

## Portability Scan (automated)
`scripts/scan-portability.mjs` must exit 0:
- No `fetch(`, `XMLHttpRequest`, `import(`, `import ... from`, `export` outside HTML comments
- No `<script src=`, no `href="http`, no `src="http`
- No raw `</script>` inside island JSON
- No test code inside artifact

## Rollback
Delete `Task-Manager-Portable.html`; revert `modules/` and `tests/` slice. Stateless, no migration.
