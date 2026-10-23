# Propuestas de mejora para Odradek

## Contexto confirmado

La puesta en marcha distinguió dos clases de problemas:

- **Entorno:** inicialmente faltaban Node/npm y Docker Compose; la sesión de la terminal no había recargado el grupo `docker`; y el sandbox de Codex no podía abrir puertos locales ni acceder al socket Docker, aunque el host sí podía hacerlo.
- **Producto:** el observatorio produjo un falso `healthy_foreign` aun cuando los contenedores pertenecían a este checkout. También existe una discrepancia en la verificación de cierre: la API cuenta tres eventos mientras el archivo local cuenta dos, por lo que falla `api_events_match_local`.

## Correcciones ya aplicadas

Se aplicaron y validaron dos correcciones de producto:

1. Polling del watcher para que la importación funcione de forma fiable sobre el bind mount de `agent-kit/output`.
2. Uso del `sessionId` canónico al generar y localizar el probe de ownership, evitando comparar identificadores distintos y el falso `healthy_foreign`.

Estas correcciones deben conservarse junto con sus pruebas de regresión.

## Cambios propuestos

### P0 — Fiabilidad de observabilidad

- Mantener y cubrir con pruebas los dos fixes ya aplicados: polling del bind mount y `sessionId` canónico del probe.
- Corregir la discrepancia entre conteo local y conteo de API en `observatory:verify`. El contrato de comparación debe definir con precisión qué eventos se persisten en cada origen y verificar el mismo conjunto en ambos.
- Hacer visibles los fallos de importación con logs saneados y diagnósticos estructurados; un error no debe degradarse silenciosamente a `healthy_foreign`.

### P1 — Diagnóstico y operación inicial

- Corregir `observatory:setup` para diferenciar `EADDRINUSE` de `EACCES`/`EPERM`. La falta de permiso para hacer bind no debe informarse como «sin puertos libres».
- Añadir `observatory:doctor`, con salida JSON accionable, que compruebe Node/npm, Docker, Docker Compose, acceso al daemon, configuración `.env`, disponibilidad de puerto, salud de API y ownership de la instancia.
- Añadir `observatory:start` como flujo guiado y explícito: validar prerrequisitos, arrancar únicamente el stack del checkout actual y ejecutar el check de ownership. No debe tocar otros proyectos ni volúmenes.

### P2 — Cambios de instancia y mantenimiento

- Tratar un cambio de `ODRADEK_INSTANCE` como una operación con impacto en Compose: cambia nombres de proyecto y puede crear un volumen PostgreSQL nuevo. Mostrar una advertencia y ofrecer una ruta explícita para conservar o migrar datos.
- Limpiar probes temporales exitosos y fallidos, o bien asignarles TTL verificable, para evitar registros residuales en la base de datos.
- Incluir en el diagnóstico la procedencia del directorio observado y del bind mount, de modo que un montaje obsoleto sea distinguible de una instancia ajena.

## README frente a código

El README debe documentar requisitos (Node, Docker, Compose y grupo `docker`), el arranque desde el host, límites de sandboxes y el efecto de `ODRADEK_INSTANCE` sobre los volúmenes.

La documentación no sustituye cambios de código cuando el sistema puede dar un estado falso o no verificable. La identidad del probe, la importación desde bind mounts, la clasificación de errores de bind y la consistencia entre eventos locales y API requieren validación automática en el producto.

## Criterios de aceptación

- En un checkout propio, `observatory:check` devuelve `healthy_own` después de iniciar el stack y no deja probes residuales.
- Un bind denegado devuelve una causa de permisos; un puerto ocupado devuelve `EADDRINUSE`.
- `observatory:verify` compara eventos equivalentes y pasa cuando la sesión está correctamente cerrada y visible.
- `observatory:doctor` identifica de forma accionable una dependencia faltante, falta de acceso al daemon, configuración incompleta, instancia ajena o montaje obsoleto.
- Cambiar `ODRADEK_INSTANCE` avisa del efecto en datos antes de crear un volumen nuevo.

## Fuera de alcance

Este documento no propone borrar contenedores, volúmenes ni datos existentes; ni cambiar permisos globales del host. Tampoco sustituye la autorización explícita para iniciar Docker o modificar infraestructura.
