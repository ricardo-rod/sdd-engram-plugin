# Desarrollo y verificación

Esta guía está dirigida a quienes quieran modificar el producto. Los usuarios del HTML portátil no necesitan ninguna de estas herramientas.

## Requisitos

- Node.js 20 o superior; CI utiliza Node.js 24
- npm
- Chromium para el recorrido Playwright

## Preparación

```bash
npm install
```

## Comandos

| Comando | Propósito |
|---|---|
| `npm test` | Ejecuta la suite Node con happy-dom mediante una ruta multiplataforma |
| `npm run check` | Comprueba JavaScript mediante TypeScript checkJs |
| `npm run assemble` | Genera el HTML desde los módulos |
| `npm run test:browser` | Ejecuta el recorrido real de Playwright |
| `node scripts/scan-portability.mjs` | Audita contrato offline, island y tamaño |

## Flujo recomendado

1. Ejecuta las pruebas del módulo que modificarás.
2. Añade primero un caso que falle para el nuevo comportamiento.
3. Implementa el cambio mínimo.
4. Ejecuta las pruebas focales.
5. Ejecuta la suite completa y el typecheck.
6. Ensambla el HTML.
7. Ejecuta Playwright y el scanner de portabilidad.
8. Confirma que las copias de distribución sean idénticas.

```bash
npm test
npm run check
npm run assemble
npm run test:browser
node scripts/scan-portability.mjs
```

## Invariantes que no deben romperse

- Debe existir exactamente un `script#tm-state`.
- El entregable no puede depender de red o servidor.
- El estado de tareas no se guarda en `localStorage`.
- Todo texto procedente del estado se escapa antes de renderizar.
- El archivo debe seguir abriendo directamente mediante `file://`.
- El HTML generado debe producirse desde los módulos; no se edita manualmente.

## Publicar una versión

1. Actualiza `CHANGELOG.md`.
2. Ejecuta todas las verificaciones.
3. Copia el artefacto aprobado a `Task-Manager-Portable.html`.
4. Crea un tag SemVer.
5. Adjunta el HTML a una GitHub Release.
