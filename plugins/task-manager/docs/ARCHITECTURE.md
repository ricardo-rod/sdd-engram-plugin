# Arquitectura

## Objetivo

Mantener un dashboard visual completo dentro de un único HTML que funcione offline y pueda ser actualizado cambiando exclusivamente un bloque JSON.

## Flujo de datos

```text
#tm-state JSON
     │
     ▼
TMCore
├── parseIsland
├── validateState
├── deriveMetrics
└── deriveInsights
     │
     ├── TMHeaderHud → header, métricas y diálogos
     ├── TMPhases    → fases, filtros y Kanban
     ├── TMPanel     → Git, Tree y Codegraph
     └── TMTodoHelp  → señales, ayuda y diagnóstico
```

## Módulos fuente

| Archivo | Responsabilidad |
|---|---|
| `modules/01-skeleton.html` | Estructura semántica, tokens y estilos |
| `modules/02-core.js` | Parseo, validación, normalización y métricas |
| `modules/03-header-hud.js` | Header, HUD, insights y detalles |
| `modules/04-phases.js` | Fases, tareas, filtros y Kanban |
| `modules/05-panels.js` | Git, árbol y Codegraph |
| `modules/06-todo-help.js` | Señales, ayuda, diagnóstico y exportación |

`scripts/assemble.mjs` concatena estos módulos como scripts clásicos dentro de `Task-Manager-Portable.html`.

## Decisiones principales

### Un único estado declarativo

El JSON embebido evita una base de datos, backend o almacenamiento externo. Las métricas se derivan en runtime y no se duplican dentro del estado.

### Cero dependencias runtime

El entregable no usa `fetch`, módulos ES, scripts externos ni recursos remotos. Las dependencias de `package.json` solo existen para desarrollo y pruebas.

### Interfaz informativa

La interfaz no modifica tareas ni ejecuta terminales. Esta restricción protege el contrato de solo lectura y mantiene el HTML seguro para compartir.

### Degradación controlada

Los paneles opcionales contienen datos inválidos o ausentes sin impedir que el resto del dashboard se renderice. Los errores del estado se muestran en un diagnóstico recuperable.

## Seguridad de `file://`

Los navegadores aíslan archivos locales mediante orígenes opacos. Por eso la aplicación:

- no inspecciona carpetas;
- no lee `.git`;
- no solicita permisos de archivos;
- evita persistir el estado del proyecto en `localStorage`;
- consume exclusivamente datos embebidos.

## Accesibilidad

- navegación por teclado;
- focos visibles;
- diálogos nativos con restauración de foco;
- estados acompañados por texto, no solo por color;
- soporte para `prefers-reduced-motion`;
- diseño adaptable y comprobación a 200% de zoom.

## Límites arquitectónicos

Si una función futura necesita leer archivos, ejecutar Git o modificar tareas, debe implementarse fuera del HTML portátil mediante una herramienta explícita. No debe romperse el límite offline para simular automatización dentro del navegador.
