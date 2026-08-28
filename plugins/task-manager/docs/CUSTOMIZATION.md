# Personalización del estado

Task Manager Portable usa el bloque `#tm-state` como única fuente de verdad. No necesitas tocar el HTML, CSS o JavaScript para personalizar el contenido.

## Estructura mínima

```json
{
  "schemaVersion": "1.0",
  "meta": {
    "projectName": "Mi proyecto",
    "version": "1.0.0",
    "features": {
      "git": true,
      "tree": true,
      "codegraph": true,
      "help": true
    }
  },
  "phases": [],
  "todos": [],
  "git": {},
  "tree": [],
  "codegraph": { "nodes": [], "edges": [] }
}
```

## Añadir una fase

```json
{
  "id": "phase-1",
  "number": 1,
  "title": "Preparación",
  "status": "in-progress",
  "target": "Semana 1",
  "lead": "Equipo",
  "tasks": [
    {
      "id": "T1-01",
      "title": "Definir alcance",
      "status": "completed",
      "tag": "Planning",
      "note": "Alcance aprobado",
      "owner": "Ana",
      "commit": "abc1234"
    }
  ]
}
```

Los porcentajes se calculan automáticamente a partir de las tareas con estado `completed`.

## Señales de atención

```json
{
  "id": "todo-1",
  "text": "Revisar accesibilidad",
  "priority": "P1",
  "done": false
}
```

Prioridades admitidas: `P0`, `P1` y `P2`.

## Snapshot Git

```json
{
  "branch": "main",
  "syncStatus": "Sincronizado",
  "commits": [
    { "hash": "abc1234", "message": "feat: add dashboard" }
  ]
}
```

Git Stream es informativo. No lee `.git`, no ejecuta comandos y no inventa fechas o autores.

## Árbol de archivos

```json
[
  { "name": "src/", "depth": 0, "type": "dir" },
  { "name": "app.js", "depth": 1, "type": "file" }
]
```

## Codegraph

```json
{
  "nodes": [
    {
      "id": "core",
      "label": "Core",
      "files": ["src/core.js"],
      "taskIds": ["T1-01"],
      "details": "Valida y deriva métricas."
    }
  ],
  "edges": [
    {
      "from": "core",
      "to": "ui",
      "label": "alimenta",
      "details": "Entrega métricas derivadas."
    }
  ]
}
```

## Escapado obligatorio

Antes de insertar JSON serializado dentro del HTML, escapa cualquier cierre de script:

```js
const islandJson = JSON.stringify(state)
  .replace(/<\/script>/gi, '\\u003c/script\\u003e');
```

## Reglas de seguridad

- No añadas contraseñas, tokens ni claves privadas.
- No incrustes datos personales si el archivo se compartirá.
- No añadas scripts remotos, `fetch`, `XMLHttpRequest` o imports.
- Conserva `schemaVersion: "1.0"`.

## Verificación

Si desarrollas el producto, ejecuta:

```bash
node scripts/scan-portability.mjs
```

Si solo utilizas el HTML portátil, guarda el archivo y recarga el navegador.
