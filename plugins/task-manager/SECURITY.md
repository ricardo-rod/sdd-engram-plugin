# Seguridad

## Versiones soportadas

La última versión publicada recibe correcciones de seguridad.

## Reportar una vulnerabilidad

No publiques vulnerabilidades explotables ni información sensible en un issue público. Utiliza la función **Report a vulnerability** de GitHub Security Advisories en este repositorio.

Incluye:

- descripción del impacto;
- pasos mínimos para reproducir;
- navegador y sistema operativo;
- archivo o sección afectada;
- propuesta de mitigación, si existe.

## Modelo de seguridad

Task Manager Portable:

- funciona offline;
- no envía telemetría;
- no realiza llamadas de red;
- no lee archivos del proyecto automáticamente;
- no ejecuta comandos;
- trata el JSON embebido como entrada no confiable y escapa su contenido.

## Responsabilidad del usuario

El HTML es un documento compartible. No introduzcas en `#tm-state`:

- tokens o claves API;
- contraseñas;
- secretos de CI/CD;
- información personal o empresarial confidencial;
- contenido que no deba salir del equipo.
