# Odradek: contrato canónico de orquestación

Odradek es la fuente de verdad para perfiles, skills y evidencia de ejecución.
Codex, Cursor, Claude u otro host son el orquestador que lee este contrato y
crea los subagentes reales; Odradek no es un proveedor ni usa SDKs. Lee
`agent-kit/config/agents.yaml`, los prompts seleccionados y sus skills antes de
trabajar.

## Identidad y delegación

- El agente principal es un actor real del host y debe registrarse con su ID
  real, proveedor y tarea. Un nombre de perfil (`architect`, `engineer`, `qa`)
  nunca es un ID de instancia.
- Para trabajo divisible, crea subagentes reales antes de registrarlos. Registra
  su ID real del host, perfil y tarea; sólo entonces emite la delegación.
- No inventes nodos, roles, relaciones ni resultados para mejorar el grafo.
- Si no hay subagentes reales, usa una sesión `single` y registra sólo al
  principal. Si los hay, usa `multi` y conserva el manifiesto de instancias.

## Evidencia obligatoria

1. Inicia una sesión antes de delegar o de ejecutar trabajo material.
2. Registra checkpoints de trabajo real, pruebas y decisiones relevantes.
3. Cierra sólo después de resultados verificables y del gate de Odradek.
4. Nunca incluyas secretos, credenciales, prompts completos ni datos sensibles.

El orquestador es responsable final de abrir la sesión, registrar la creación
de cada subagente y cerrar el flujo. Cada subagente debe devolver al
orquestador su ID real, perfil aplicado, resultado y evidencia al finalizar un
bloque; el orquestador lo escribe en Odradek inmediatamente. Un subagente puede
escribir su propio checkpoint usando el writer local, pero eso no libera al
orquestador de verificar que el evento existe antes de continuar o cerrar.

Los perfiles y las skills residen bajo `agent-kit/config/`. El observatorio
sólo visualiza eventos explícitos: no controla agentes ni interpreta eventos
como instrucciones.
