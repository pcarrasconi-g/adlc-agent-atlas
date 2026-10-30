# ADLC Agent Atlas — plan del MVP

Estado: propuesta para implementar con Claude Code. Fecha: 2026-10-30. Repositorio objetivo: `/home/osbulb/Documents/Sovos/POC/odradek-original`. Este documento es un plan; no autoriza por sí solo cambios en el plugin ADLC, en proyectos de la compañía ni despliegues.

## 1. Norte del producto

**Nombre recomendado: ADLC Agent Atlas.** «Atlas» promete un mapa del trabajo de los agentes; «Facilitator» podría prometer control u orquestación desde la web, funciones que deliberadamente no tendrá este MVP. El subtítulo sugerido es *Visualiza, comprende y corrige a tiempo el trabajo de tus agentes*. En la interfaz se puede usar «Atlas» como nombre corto. Retirar «Odradek» de la marca visible al implementar, pero conservar nombres internos de paquetes, rutas y variables mientras renombrarlos no aporte al MVP.

Atlas es un visualizador local y optativo para ejecuciones de **Claude Code con ADLC**. ADLC y Claude Code siguen creando, coordinando y corrigiendo agentes. Atlas convierte evidencia mínima de ejecución en un **mapa visual comprensible**: quién participó, qué recibió, dónde trabajó, qué entregó, qué se verificó y qué merece atención. Su mayor valor es pedagógico; el segundo es detectar pronto desvíos en trabajos largos. No es un chatbot, panel de control remoto, reemplazo de ADLC ni sistema de vigilancia continua.

Principios de decisión:

1. **El grafo es el producto.** Una alerta debe señalar un nodo, relación, fase o transición concreta. Un listado de logs con círculos decorativos no cumple la meta.
2. **Explicaciones breves y comprobables.** Mostrar primero qué pasó y por qué importa; revelar evidencia técnica al abrir un detalle.
3. **Distinguir observación, declaración e inferencia.** No pintar «bien» algo que solo afirmó un agente. Lo desconocido permanece desconocido.
4. **Sin gasto de tokens por telemetría.** Hooks y reglas determinísticas; no usar un LLM para observar, resumir o clasificar cada evento.
5. **Opt-in por proyecto y por sesión.** Útil al abrirlo durante una tarea o al revisar una ejecución grabada; no requiere dejar una aplicación encendida siempre.
6. **MVP rápido.** Se acepta deuda técnica localizada, pero no datos engañosos, filtración de secretos ni una demo ficticia presentada como real.

## 2. Base constatada y límites

- El plugin revisado es `/home/osbulb/Downloads/plugins/adlc`. Define exactamente estos tipos de agentes: `frontend-engineer`, `backend-engineer`, `qa-engineer`, `platform-engineer`, `documentation-specialist` y `code-reviewer`. El principal de Claude Code ejecuta las fases y puede tomar decisiones de arquitectura; no se dibujan «architect», «UX» o «UI» como agentes si no existieron realmente.
- ADLC sigue `refine → plan → breakdown → execute → pr`, con ejecución secuencial o en equipo. Atlas debe aceptar ambas. Las fases pueden representarse como contexto del trabajo, no como agentes.
- El plugin tiene hooks `SessionStart`, `SubagentStop`, `TeammateIdle` y `TaskCompleted`; no tiene todavía `SubagentStart`. El adaptador propuesto añade eventos de observación sin alterar el comportamiento de los guards.
- `/home/osbulb/Downloads/plugins/adlc/hooks/verify-guard.sh` usa `ADLC_STOP_VERIFY=lint,typecheck` por defecto y corre en `CLAUDE_PROJECT_DIR`; el propio archivo advierte que puede ser distinto del worktree del subagente. El piloto registró typecheck exitoso y lint fallido. No concluir automáticamente que la implementación falló: podría ser deuda preexistente o una comprobación en un árbol distinto. ADLC también tiene verificación integrada de la ejecución; Atlas debe mostrar ambos hechos sin reemplazar el gate de ADLC.
- La copia objetivo ya tiene cambios de frontend sin confirmar de otro trabajo. Preservarlos; antes de implementar, revisar el diff y decidir qué integrar. No modificar `/home/osbulb/Documents/Sovos/POC/odradek` para este MVP.
- El antiguo contrato de Odradek exige preflight y subagentes propios. **Ese contrato no aplica a Atlas**: solo ADLC/Claude Code orquesta. Durante la implementación, retirar o aislar las instrucciones contradictorias de `AGENTS.md`, `CLAUDE.md`, plantillas y README para que no activen un segundo framework de agentes.

## 3. Lo que verá una persona

### Vista principal

```text
Sesión / proyecto / fase / EN VIVO o GRABADA / última señal

  Claude Code (principal)
       ├── frontend-engineer ── tarea A ── verificación
       ├── qa-engineer       ── tarea B ── hallazgo
       └── code-reviewer     ── revisión ── decisión

  [Señal visual anclada al nodo o transición: «lint falló 3 veces»]
  [Historia guiada: 1. Delegó → 2. Implementó → 3. Se verificó → 4. Se ajustó]

  Detalle al seleccionar: Qué hizo / Qué sabemos / Por qué importa / Evidencia
```

- Mostrar **todos los agentes reales** de la sesión, incluso los terminados, con relación principal→subagente y, cuando exista, subagente→subagente. Usar ID real emitido por Claude Code; el tipo ADLC es una etiqueta, no una identidad. Un agente relanzado es otra instancia.
- El nodo comunica estado con texto e icono además de color: pendiente, ejecutando, esperando, terminado, fallido, sin señal reciente o desconocido. Pulso verde discreto **solo** para ejecución observada recientemente; detenerlo si vence el plazo de frescura. Respetar `prefers-reduced-motion`.
- Una tarea y su verificación son visibles como relación o pequeña insignia junto al agente, sin convertir cada log en un nodo. Las señales importantes cambian la lectura del mapa: borde, ruta, insignia o comparador antes/después. Pocas señales simultáneas; priorizar la más accionable.
- Al abrir un nodo: tres bloques cortos: «Encargo», «Resultado observado» y «Qué mirar ahora». Evidencia expandible: fuente, hora, tarea, comando, código de salida, branch/worktree cuando existan. Evitar volcar transcript completo.
- Dos recorridos sobre el **mismo grafo**: «Aprender» cuenta una historia guiada de cuatro a seis pasos; «Diagnóstico» muestra gates, worktrees, retrasos y procedencia. No crear dos productos separados ni esconder la evidencia a expertos.
- Distinguir claramente **Seguir en vivo** de **Reproducir historia**. En vivo sigue el último evento con nuevas consultas/SSE y muestra edad de la señal; reproducir mueve un cursor sobre eventos guardados. Si el usuario rebobina o selecciona un paso, pausar el seguimiento sin saltos inesperados. Botón explícito «Volver al presente».
- La intervención ocurre en Claude Code. Atlas puede ofrecer una **sugerencia contextual copiable**: «En Claude Code, comprueba si este lint es baseline y si el guard corrió fuera del worktree; no desactives gates sin decidirlo». Nunca enviar órdenes ni detener agentes desde la web en el MVP.

### Semántica de confianza

Cada afirmación visible lleva una de estas procedencias: **observado por hook**, **verificado por comando**, **declarado por agente** o **inferido por regla**. Ejemplo: «`qa-engineer` terminó» puede venir de `SubagentStop`; «las pruebas pasaron» requiere salida de una comprobación, no una frase del QA. «No hay señal» no equivale a «terminó» ni a «falló». No inferir baseline solo por el volumen de errores: exigir una medición comparable anterior.

## 4. Contrato mínimo de datos y adaptador

El adaptador de Claude Code es pequeño, local y optativo. Puede vivir inicialmente junto a Atlas y configurarse en el proyecto ADLC de demo; si demuestra valor, empaquetarlo luego como integración oficial del plugin. No cambiar el algoritmo de ADLC para instrumentarlo. Antes de escribir hooks, verificar en la versión instalada de Claude Code los nombres de eventos, payloads e IDs reales; no inventar campos ausentes.

Evento normalizado mínimo: `schema_version`, `session_id`, `event_id`, `timestamp`, `source`, `principal_id`/`agent_id`/`parent_id` cuando existan, `agent_type` ADLC, `task_id`, `phase`, `kind`, `status`, `summary` breve, `evidence_ref`, `cwd`/`worktree`/`branch` solo cuando estén disponibles. IDs y rutas son internos; la UI no debe usar la ruta como nombre público. Un `event_id` estable hace idempotente la importación. No bloquear el flujo de Claude Code si la escritura de telemetría falla.

| Origen | Evento para Atlas | Finalidad |
| --- | --- | --- |
| `SessionStart` | sesión iniciada; principal | Abrir mapa y asociar ejecución ADLC. |
| `SubagentStart` | instancia y delegación | Aparición inmediata del agente con ID real, tipo y parent si el payload lo da. |
| `SubagentStop` | resultado terminal | Cerrar estado del agente y asociar resultado sin atribuirle verificaciones no observadas. |
| `TaskCreated` / `TaskCompleted` | tarea y transición | Asociar trabajo a instancia; comprobar disponibilidad de IDs en payload real. |
| `TeammateIdle` y otras señales disponibles | espera/actividad | Contexto temporal, no prueba única de liveness. |
| Hook acotado en comandos de verificación o envoltorio del guard ADLC | gate iniciado/terminado, receta, exit code, cwd | Distinguir fallo, repetición, árbol de ejecución y fuente; no copiar salida completa. |
| Checkpoint explícito opcional del principal | fase, decisión y motivo breve | Cubrir refine/plan/breakdown y decisiones humanas donde no haya hook. |

Para presencia real, usar señal reciente de hook o heartbeat local barato del adaptador mientras la instancia sea observable. Si Claude Code no expone un latido fiable por agente, etiquetar «actividad reportada hace X» y pasar a «estado incierto» tras un umbral configurable; **no** sostener el pulso verde indefinidamente. La ausencia de `SubagentStop` no prueba que siga corriendo. Registrar también pérdida de eventos o adaptador apagado, para no confundir silencio con inactividad.

Escribir solo campos permitidos: IDs, tiempos, tipo, tarea breve, fase, estado, comando de verificación permitido, exit code, fingerprint y referencia a evidencia local. Excluir prompts completos, respuestas, archivos de usuario, tokens, secretos, variables de entorno y salida cruda de comandos. Aplicar sanitización y truncado antes de guardar. Retención local corta y borrado por sesión. El mecanismo existente de API/archivos puede reutilizarse si soporta estos eventos; extender el esquema solo donde haga falta. No añadir un servicio externo ni requerir APIs del proveedor.

## 5. Señales visuales determinísticas

Implementar primero cuatro señales, todas ligadas a evidencia y con una acción pedagógica:

1. **Fallo repetido del mismo gate.** Agrupar por receta, exit code y fingerprint normalizado; mostrar contador, primer/último intento y nodo afectado. Evitar declarar causa automáticamente.
2. **Verificación fuera del worktree esperado.** Si hay worktree conocido y cwd del gate distinto, marcar la discrepancia de contexto. No llamarla bug de ADLC sin comprobar qué gate es: el guard de `SubagentStop` admite explícitamente esa limitación.
3. **Baseline frente a regresión.** Mostrar comparación solo si existe medición previa de la misma receta, revisión/árbol y configuración comparables. Si falta, «origen no determinado». Distinguir «falla preexistente» de «cambio empeoró la línea base».
4. **Trabajo largo sin señal fresca.** Señal temporal de baja confianza; mostrar edad y última evidencia, sugerir revisión en Claude Code, no diagnosticar bucle o bloqueo sin más datos.

Una tarjeta de señal debe tener: hecho observable, grado de confianza, impacto posible, evidencia y próxima pregunta concreta. Limitar a las tres señales principales por sesión y agrupar duplicados. No gastar tokens en análisis continuo.

## 6. Demo real por defecto

La demo inicial debe contar **una historia real** reproducible, no un conjunto de nodos inventados. Ejecutar ADLC en un fixture local y aislado inspirado en el piloto Angular: línea base de lint problemática, tarea pequeña que sí puede verificarse por typecheck, y guard que repite lint desde el proyecto raíz mientras el agente trabaja en worktree. Grabar una ejecución corta con los agentes ADLC que efectivamente se lancen; no forzar roles para llenar el grafo. Evitar Jira, Azure, PR remoto y datos privados. Si se reutiliza evidencia del piloto real, anonimizarla y eliminar rutas/identificadores sensibles antes de empaquetarla.

Secuencia narrativa deseada:

1. El principal planea y delega; el mapa se construye a medida que aparecen IDs reales.
2. Un `frontend-engineer` o `backend-engineer` ejecuta un cambio pequeño; un `qa-engineer` y/o `code-reviewer` solo si ADLC realmente los usa en esa ejecución.
3. Typecheck del cambio pasa; el guard de cierre informa lint fallido en el directorio raíz. Atlas ilumina visualmente el gate y la relación con el agente, muestra que hay **dos contextos de verificación** y que el origen del lint aún requiere comparación.
4. Se registra una medición baseline comparable. Atlas actualiza la explicación: fallo preexistente o regresión, según los datos, con referencia a evidencia; nunca adivina.
5. La persona decide en Claude Code cómo ajustar el trabajo o el harness (`ADLC_STOP_VERIFY`, receta más específica o verificación en worktree). Atlas muestra la decisión como checkpoint y el efecto en la ejecución posterior.

Entregar una **grabación congelada y anonimizada** que la web cargue sin Claude Code ni servidor activo, etiquetada «Demo grabada». Añadir un comando de demo en vivo, opcional, que corra localmente con límite breve y costes explicados. La demo grabada debe ser el camino de primera impresión, confiable y barato. Si el caso real no produce todos los pasos, no rellenar huecos con ficción: dejar la ausencia visible o volver a ejecutar el fixture.

## 7. Casos educativos y expertos

Para juniors, el modo Aprender debe responder visualmente: «¿Quién hizo qué?», «¿qué hizo el principal antes de delegar?», «¿por qué un resultado del agente no basta para decir que pasó QA?», «¿el fallo es nuevo o ya existía?» y «¿en qué momento convenía preguntar o intervenir?». Cada paso resalta una ruta del grafo, ofrece una frase simple y permite abrir la evidencia sin perder el contexto.

Para expertos, dos usos iniciales: (a) observar varios fallos repetidos y la diferencia raíz/worktree para decidir si cambiar el guard o configurar gates por repositorio; (b) detectar espera prolongada o verificaciones redundantes para ajustar el harness de ADLC y los límites de delegación. Atlas muestra patrones y trazas; **no** modifica el harness por sí mismo ni propone desactivar controles como salida automática.

## 8. Trabajo por incrementos y aceptación

### Incremento 0 — Alinear contrato y proteger la copia

- Confirmar diff existente y separar cambios ajenos. Actualizar marca visible y documentación para que Atlas sea observador de ADLC, no un segundo orquestador. Retirar/aislar instrucciones obligatorias de arquitecto, perfiles, preflight y writer de Odradek en entry points; conservarlas solo como legado explícitamente archivado si son útiles.
- Definir esquema y ejemplos de eventos reales de Claude Code/ADLC (sin datos sensibles). Verificar payloads de hooks en la instalación concreta.
- Aceptación: ninguna instrucción activa obliga a crear agentes extra; una ejecución sin Atlas conserva el comportamiento de ADLC; hay contrato de datos versionado y semántica de confianza documentada.

### Incremento 1 — Mapa e historia grabada

- Construir proyección del grafo desde eventos reales, sin roles ficticios. Añadir filtros por fase/tarea, estados y panel de detalle corto. Implementar modo Aprender con pasos anclados al grafo y modo Diagnóstico sobre los mismos datos.
- Corregir el seguimiento de eventos en la copia: hoy el handler de `/api/stream` refresca la lista de sesiones pero no vuelve a cargar necesariamente los eventos/grafo de la sesión seleccionada; la selección también reinicia cursor. Separar estado de reproducción, seguimiento en vivo y llegada de nuevos eventos.
- Aceptación: abrir demo grabada muestra mapa completo y relato comprensible; un nuevo evento actualiza la sesión visible sin recarga manual; al rebobinar no salta solo al final; «Volver al presente» funciona.

### Incremento 2 — Adaptador y presencia en vivo

- Añadir hooks de observación optativos sin cambiar los guards ADLC. Mapear IDs reales, tareas, fases y resultados; añadir verificación/gate con cwd y salida acotada. Hacer importación idempotente y tolerante a fallo.
- Presencia con frescura/latido cuando sea fiable; estado incierto cuando no lo sea. La UI debe poder seguir una ejecución de 30 minutos sin quedarse congelada y sin afirmar actividad inexistente.
- Aceptación: dos agentes reales concurrentes aparecen como instancias distintas; el pulso solo dura mientras hay evidencia fresca; los estados terminales se actualizan; un hook roto no bloquea ADLC ni filtra contenido.

### Incremento 3 — Señales y demo de valor

- Implementar las cuatro reglas determinísticas y la comparación baseline cuando haya medición. Capturar la demo real descrita arriba, congelarla y anonimizarla. Mostrar la decisión humana y el antes/después en el grafo.
- Aceptación: una persona junior explica la cadena principal→agente→gate y distingue afirmación de verificación; una persona experta identifica el posible problema de contexto del guard en menos de dos minutos; ninguna alerta atribuye culpa o baseline sin evidencia.

### Incremento 4 — Adopción en proyectos distintos

- Preparar instalación optativa por proyecto, desinstalación simple, configuración de ruta/retención y guía de 10 minutos. Probar un proyecto con worktrees y otro secuencial sin ellos. No imponer un `justfile`, stack, nombres de rama ni política única a cientos de repositorios.
- Aceptación: el mismo adaptador puede activarse y apagarse sin tocar la lógica de ADLC; proyectos sin gate disponible muestran «no observado» y no falso éxito; demo grabada funciona sin infraestructura encendida.

## 9. Verificación proporcionada al prototipo

- Pruebas unitarias de proyección, IDs, idempotencia, orden fuera de secuencia, estados terminales y reglas de señales; fixture de eventos pequeño y legible.
- Prueba de integración de hooks con payloads reales y datos saneados; confirmar que el fallo del writer no altera exit codes ni bloquea ADLC.
- Prueba manual corta del frontend: live-follow, pausa, play, rebobinado, nueva señal, pérdida de conexión, reconexión y `prefers-reduced-motion`.
- Demo guiada de 10 minutos con una persona junior y otra experta. Registrar qué entendieron sin explicación adicional; ajustar texto y jerarquía visual antes de añadir nuevas señales.
- No correr suites enormes ni una ejecución de horas para aprobar este MVP. La demo grabada cubre la historia larga; una prueba viva de pocos minutos confirma frescura.

## 10. Deuda aceptada, riesgos y fuera de alcance

Se acepta: componentes React inicialmente grandes, reglas heurísticas simples, configuración local/manual, almacenamiento local existente y una sola integración Claude Code+ADLC. No se acepta: identidades inventadas, estados `running` perpetuos, secretos en eventos, alertas presentadas como certeza cuando son inferencias, ni una demo simulada rotulada como real.

Fuera del MVP: chatbot, órdenes de stop/redirección desde Atlas, control de agentes, soporte de Codex/Cursor, resumen continuo con LLM, analítica centralizada de la compañía, métricas de productividad individual, comparación entre empleados, streaming de transcript completo, cambios automáticos en `ADLC_STOP_VERIFY` o en políticas de calidad.

Riesgos principales: payloads de hooks varían con la versión de Claude Code; algunos eventos no revelan worktree o tarea; Agent Teams y subagentes secuenciales pueden emitir evidencias distintas; el baseline no siempre es comparable; el frontend actual tiene estado acoplado de reproducción y actualización; un proyecto grande puede generar demasiados eventos. Mitigaciones de MVP: validación de payload real, campos opcionales, etiquetas «desconocido», muestreo/agrupación, salida acotada y prueba en dos modos de ADLC.

## 11. Decisiones que quedan para la implementación

1. Confirmar «ADLC Agent Atlas» como marca; si no convence, mantener el concepto *Atlas* y cambiar solo la etiqueta visible.
2. Elegir fixture demo sin datos privados: reproducir el patrón del piloto Angular en una muestra mínima o usar una copia saneada autorizada. Por defecto, muestra mínima con fallo real y baseline medible.
3. Verificar qué payloads y correlación de IDs proporciona la versión instalada de Claude Code; cuando falte una relación, mostrarla como no establecida y no fabricarla.
4. Decidir si el adaptador se distribuye inicialmente como configuración local del demo o como pieza instalable del plugin ADLC. Para velocidad, comenzar local, pero dejar contrato y comando de activación preparados para empaquetar.

La implementación puede empezar con estas decisiones por defecto. Solo hay que volver al usuario si una elección exige acceso a código/datos privados de otro proyecto, cambia el comportamiento de ADLC o implica un despliegue externo.
