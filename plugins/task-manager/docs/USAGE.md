# Guía de uso

Esta guía explica la ruta más corta para colocar Task Manager Portable en un proyecto y mantenerlo actualizado.

## Uso básico

1. Descarga `Task-Manager-Portable.html` desde el repositorio o desde la última release.
2. Copia el archivo en la raíz de tu proyecto.
3. Haz doble clic para abrirlo con tu navegador.
4. Conserva el archivo junto al proyecto para que el equipo pueda localizarlo fácilmente.

```text
mi-proyecto/
├── app/
├── tests/
├── package.json
└── Task-Manager-Portable.html
```

No necesitas ejecutar `npm install`, iniciar un servidor ni conectarte a Internet.

## Actualizar los datos

Busca este bloque dentro del HTML:

```html
<script type="application/json" id="tm-state">...</script>
```

Edita únicamente el JSON contenido entre las etiquetas. Después:

1. guarda el archivo;
2. vuelve al navegador;
3. recarga con `Ctrl + R` o `Cmd + R`.

## Estados disponibles

| Estado | Uso |
|---|---|
| `pending` | Trabajo todavía no iniciado |
| `in-progress` | Trabajo activo |
| `completed` | Trabajo finalizado |
| `blocked` | Trabajo detenido por una dependencia o problema |

## Navegación

| Sección | Contenido |
|---|---|
| Resumen / HUD | Progreso, riesgos, distribución e insights |
| Fases & Tareas | Filtros, acordeones y detalle de tareas |
| Tablero Kanban | Distribución visual por estado |
| Codegraph | Módulos y relaciones declaradas |
| Árbol Archivos | Snapshot de la estructura del proyecto |
| Git Stream | Rama, sincronización y commits declarados |
| Consola IA | Guía, prompt, diagnóstico y exportación |

## Compartir con otras personas

Puedes enviar únicamente `Task-Manager-Portable.html` por correo, mensajería, USB o almacenamiento en la nube. El receptor solo debe abrirlo con un navegador moderno.

## Solución de problemas

| Problema | Acción recomendada |
|---|---|
| Aparece un banner de error | Revisa la sintaxis del JSON y `schemaVersion` |
| El progreso no cambia | Actualiza los estados de las tareas; no escribas porcentajes manualmente |
| Un panel aparece vacío | Añade datos a `git`, `tree` o `codegraph` |
| Un texto contiene `</script>` | Sustitúyelo por `\u003c/script\u003e` dentro del JSON serializado |
| El navegador bloquea acceso a carpetas | Es una protección normal de `file://`; declara los datos en el JSON |

## Próximo paso

Consulta [Personalización](CUSTOMIZATION.md) para adaptar el estado a tu proyecto o [Guía para IA](AI-ORCHESTRATOR-GUIDE.md) para automatizar las actualizaciones.
