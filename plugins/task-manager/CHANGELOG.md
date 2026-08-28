# Changelog

Todos los cambios relevantes se documentan en este archivo siguiendo [Keep a Changelog](https://keepachangelog.com/) y versionado semántico.

## [1.0.1] - 2026-08-25

### Fixed

- Clarificado el nombre del artefacto portable en el prompt del panel de ayuda (?) y en la documentación técnica para apuntar consistentemente a `Task-Manager-Portable.html` (#1).
- Actualizado el contrato de la skill y los paquetes de distribución para priorizar `Task-Manager-Portable.html` manteniendo compatibilidad con `drop-in-task-manager.html`.

## [1.0.0] - 2026-08-25

### Added

- HTML portátil autocontenido y compatible con `file://`.
- Resumen ejecutivo con métricas y detalles accesibles.
- Fases, tareas, filtros y Kanban informativo.
- Paneles Codegraph, estructura del repositorio y Git Stream.
- Consola IA, diagnóstico compacto y exportación del estado.
- Integración declarativa mediante `#tm-state`.
- Suite Node, Playwright, typecheck y scanner de portabilidad.
- Documentación pública con recorrido visual y guía para asistentes de IA.

### Security

- Escape de contenido procedente del estado.
- Contención de JSON inválido sin pantalla en blanco.
- Cero llamadas de red y cero dependencias runtime.
