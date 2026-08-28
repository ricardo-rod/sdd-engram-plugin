# AI Orchestrator Guide — Drop-In Task Manager

> **Para la IA que mantiene actualizado el Task Manager. Lee esto una vez y guárdalo en tu contexto.**

---

## 1. Dónde está el archivo

```
./Task-Manager-Portable.html   (en la raíz del proyecto donde fue copiado)
```

Siempre en `file://` — sin servidor, sin build. El usuario lo abre con doble clic.

---

## 2. Qué debes editar (y qué NUNCA tocar)

### ✅ Edita SOLO esto:

```html
<!-- AI-EDITABLE: STATE — single source of truth, AI edits only this block -->
<script type="application/json" id="tm-state">
{"schemaVersion":"1.0", "meta":{...}, "phases":[...], "todos":[...], "git":{...}, "tree":[...], "codegraph":{...}}
</script>
```

- Es el **único bloque machine-editable**.
- Todo lo visual (`header`, `HUD`, `phases`, `todo`, `git/tree/codegraph`, `help`) se **deriva** de este JSON.
- Si editas HTML fuera del island, romperás el layout o la portabilidad `file://`.

### ❌ NUNCA hagas:

- No edites CSS/HTML fuera del island
- No añadas `<script src=>`, `fetch(`, `XMLHttpRequest`, `import`, `export`
- No leas `.git` en runtime (no hay servidor)
- No uses `localStorage` para guardar estado de tareas. En `file://`, las preferencias visuales se mantienen únicamente durante la sesión.

---

## 3. Esquema (copia/pega y adapta)

```json
{
  "schemaVersion": "1.0",
  "meta": {
    "projectName": "Mi Proyecto",
    "version": "1.2.0",
    "branch": "main",
    "commit": "a1b2c3d",
    "syncStatus": "Sincronizado",
    "description": "Gestor drop-in — actualizado por IA",
    "labels": {
      "es": {
        "overallProgress": "Progreso Global",
        "filterAll": "Todas",
        "filterActive": "Activas",
        "todoTitle": "Tareas Rápidas",
        "helpTitle": "Ayuda — Cómo usar este archivo"
      }
    },
    "features": { "git": true, "tree": true, "codegraph": true, "help": true }
  },
  "phases": [
    {
      "id": "phase-1",
      "number": 1,
      "title": "Planificación y Diseño",
      "status": "completed",
      "target": "Semana 1",
      "lead": "Ana — Arquitectura",
      "tasks": [
        {
          "id": "T1-01",
          "title": "Definir esquema de datos",
          "status": "completed",
          "tag": "Backend",
          "note": "Esquema validado. Incluye validación de tipos.",
          "owner": "Ana",
          "commit": "a1b2c3d"
        }
      ]
    }
  ],
  "todos": [
    { "id": "td-1", "text": "Revisar tokens", "priority": "P0", "done": false }
  ],
  "git": {
    "branch": "main",
    "commits": [{ "hash": "abc123", "message": "feat: init" }],
    "syncStatus": "Sincronizado"
  },
  "tree": [
    { "name": "src/", "depth": 0, "type": "dir" },
    { "name": "app.ts", "depth": 1, "type": "file" }
  ],
  "codegraph": {
    "nodes": [{ "id": "skeleton", "label": "Skeleton" }],
    "edges": [{ "from": "skeleton", "to": "core" }]
  }
}
```

**Campos obligatorios mínimos para que no falle el banner:**

- `schemaVersion: "1.0"` (exacto)
- `meta: { projectName, version }`
- `phases: []` (array, aunque vacío)
- `todos: []`, `git: {}`, `tree: []`, `codegraph: {}`

Si falta alguno, `validateState` mostrará banner pero **no pantalla blanca**.

---

## 4. Reglas de status y progreso

- **Status válidos para `phase.status` y `task.status`:**
  `pending` | `in-progress` | `completed` | `blocked`

- **Desconocidos → `pending`** (no rompe, solo warning)
- **Progreso por fase:** `completed / total` redondeado (`2/4 → 50%`, `1/3 → 33%`, `0/0 → 0%`, sin `NaN`)
- **Progreso global:** `totalCompleted / totalTasks` redondeado
- **Distribución HUD:** cuenta `completed`, `in-progress`, `pending`, `blocked`
- **Vacío:** fase sin tareas → `0%` y placeholder *“Sin tareas en esta fase — 0%”*

No calcules progreso a mano en el HTML — el JS lo deriva. Solo actualiza `status` en el JSON.

---

## 5. Escapado crítico: `</script>`

Si **cualquier texto** (título, nota, commit message) contiene `</script>`, el HTML se romperá:

```html
<!-- ❌ MAL — rompe el island -->
<script type="application/json" id="tm-state">
{"note": "Texto con </script> hostil"}
</script>
```

```html
<!-- ✅ BIEN — escapado -->
<script type="application/json" id="tm-state">
{"note": "Texto con \u003c/script\u003e hostil"}
</script>
```

**Regla:** Antes de guardar, haz:

```js
JSON.stringify(state).replace(/<\/script>/gi, '\\u003c/script\\u003e')
```

El `parseIsland` del Task Manager hace `JSON.parse` y decodifica `\u003c` de vuelta a `<`, así que el round-trip preserva el texto original y el HTML no se rompe.

**Test de referencia:** `Texto hostil con </script> debe sobrevivir round-trip vía \u003c/script\u003e` — si tu JSON pasa ese test, estás bien.

---

## 6. Paneles opcionales (flag-gated)

En `meta.features`:

```json
"features": { "git": true, "tree": false, "codegraph": true, "help": true }
```

- `false` → panel oculto (`display: none`)
- `true` pero datos vacíos → muestra *“sin datos — …”* (no rompe)
- `true` con datos → renderiza snapshot verbatim

**Git:** `git.branch` (string), `git.commits[]` (hash + message), `git.syncStatus`. Cero llamadas en runtime — tú copias los datos a mano.

**Tree:** `tree[]` con `{ name, depth, type: "dir"|"file" }`. Indentación `depth * 14px`. Entradas con `type` inválido se contienen (skip) sin romper el resto.

**Codegraph:** `codegraph.nodes[]` (`id`, `label`), `codegraph.edges[]` (`from`, `to`). Renderiza SVG con círculos y líneas + leyenda. Aristas con `from`/`to` inexistentes se ignoran.

Si pasas `tree: "not-an-array"` (tipo erróneo) → el panel muestra *“sin datos — formato inválido contenido”* pero **HUD y fases siguen funcionando** (contención por panel).

---

## 7. Ejemplo de actualización incremental (trabajo real de orquestador)

**Situación:** El usuario te pide *“Añade fase 6: Deploy con 2 tareas pendientes”*

1. Lee `Task-Manager-Portable.html`, extrae JSON de `#tm-state`, `JSON.parse`
2. Haz:

```js
state.phases.push({
  id: "phase-6",
  number: 6,
  title: "Deploy",
  status: "pending",
  target: "Semana 6",
  lead: "Ops",
  tasks: [
    { id: "T6-01", title: "Configurar CI/CD", status: "pending", tag: "Ops", note: "", owner: "Ops", commit: "" },
    { id: "T6-02", title: "Publicar release", status: "pending", tag: "Ops", note: "", owner: "Ops", commit: "" }
  ]
});
```

3. Escapa: `JSON.stringify(state).replace(/<\/script>/gi, '\\u003c/script\\u003e')`
4. Reemplaza contenido de `<script id="tm-state">...</script>` con el JSON escapado
5. Guarda el archivo (no toques nada más)
6. El usuario recarga `file://` y ve Fase 6 con `0%`

**No** recalcules `overallPct` ni `perPhase` a mano — el Task Manager lo deriva.

---

## 8. Validación antes de guardar (checklist que tú debes hacer)

Antes de escribir el archivo, verifica en tu mente:

- [ ] `JSON.parse` del island no lanza
- [ ] `schemaVersion === "1.0"`
- [ ] `phases` es array, cada `phase.tasks` es array
- [ ] Cada `task.status` es uno de los 4 válidos (o lo mapeas a `pending`)
- [ ] Ningún texto contiene `</script>` sin escapar (busca `/<\/script>/i`)
- [ ] `islandJson` no contiene `</script>` literal (debe ser `\u003c/script\u003e`)
- [ ] El crecimiento del archivo está justificado por capacidades verificadas; si el estado crece mucho, archiva fases antiguas
- [ ] No añadiste `fetch`, `import`, `src="http"` ni `<script src>`

Si algo falla, el Task Manager mostrará banner `⚠️ Error en JSON: ...` pero no pantalla blanca — corrige el JSON y guarda de nuevo.

---

## 9. Comandos de verificación (si tienes Node)

```bash
node scripts/scan-portability.mjs   # verifica file://, tamaño, sin fetch, island válida
npm test                            # suite de módulos (actualmente 131 tests)
```

El entregable debe pasar ambos siempre.

---

## 10. Preguntas frecuentes para IA

**¿Puedo añadir un campo nuevo al JSON?** Sí, campos extra se ignoran (outside-island text ignored) y no rompen validación, pero no se renderizarán hasta que el código los soporte. Mejor usa los campos existentes.

**¿Puedo cambiar el orden de las fases?** Sí, se renderizan en el orden de `phases[]`. El HUD toma la primera `in-progress` como *Fase Actual*.

**¿Puedo borrar una fase?** Sí, elimina el objeto de `phases[]` y guarda. El progreso se recalculará.

**¿Qué hago si el archivo crece demasiado?** Archiva fases completadas: mueve fases antiguas a un archivo histórico o resúmelas en una fase *“Archivo”*. Después ejecuta el scanner de portabilidad.

---

**Recuerda: Un solo bloque JSON, bien escapado, y todo lo demás es automático. Así el vibe-coder ve el progreso sin fricción.**
