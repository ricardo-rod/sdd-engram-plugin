# Contribuir

Gracias por ayudar a mejorar Task Manager Portable.

## Antes de empezar

- Busca issues existentes antes de crear uno nuevo.
- Para cambios grandes, abre primero una propuesta o issue de discusión.
- Mantén el objetivo principal: un solo HTML, offline y sin dependencias runtime.

## Preparar el entorno

```bash
git clone https://github.com/RamonsDka/task-manager-portable.git
cd task-manager-portable
npm install
```

## Criterios de aceptación

- Las pruebas nuevas deben describir comportamiento observable.
- Los cambios de comportamiento deben comenzar con una prueba que falle.
- No se aceptan llamadas de red, scripts externos o estado operativo persistente.
- Los textos del estado deben renderizarse escapados.
- La documentación debe actualizarse junto al comportamiento público.

## Verificación obligatoria

```bash
npm test
npm run check
npm run assemble
npm run test:browser
node scripts/scan-portability.mjs
```

## Commits

Utiliza Conventional Commits:

```text
feat: add metric details
fix: preserve file origin behavior
docs: clarify AI update contract
test: cover malformed state fallback
```

## Pull requests

Incluye:

- problema resuelto;
- alcance y no objetivos;
- capturas si cambia la interfaz;
- comandos ejecutados y resultados;
- riesgos o limitaciones pendientes.
