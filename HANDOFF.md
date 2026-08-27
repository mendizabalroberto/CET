# Traspaso — 27 de agosto de 2026, segunda tanda

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Sustituye al traspaso anterior (commit `0504665`), que **quedó desmentido en
> dos puntos importantes**: decía que la telemetría no emitía y que había dos
> paletas de color divergiendo. Ninguna de las dos cosas era cierta. Si alguien
> te pasa aquel documento, usa `git show 0504665:HANDOFF.md` sabiendo eso.
>
> `VERIFICATION_PLAN.md` sigue vigente entero.

---

## 0 · Lo primero, porque bloquea

**El wifi colgado deja al alumno encerrado en el examen.** Es el peor fallo
abierto y ahora sabemos que el destino es una **tableta de colegio compartida
con conexión mala**, así que no es un caso raro: es el caso. Sección 4.1.

**Y siguen las credenciales expuestas.** El usuario pegó en el chat su
contraseña de superadmin y el PIN del alumno de prueba, y `secrets/accounts.env`
sigue en disco. Está en `.gitignore` y sin trackear —verificado— pero la
exposición es real. Recuérdaselo. No las uses.

---

## 1 · Estado actual

**Producción:** https://cet-sable.vercel.app · Supabase `clcutoqjdgeggvgyreud` ·
GitHub `mendizabalroberto/CET`

| | Traspaso anterior | Ahora |
|---|---|---|
| Tests unitarios | 1002 | **1135** |
| Migraciones | 22 | **25**, las tres nuevas aplicadas |
| Suites pgTAP | 6 | **9** |
| Specs entregados | 1 sin aprobar | **3** |

**Despliegue: sigue sin haber integración con GitHub.** Un push a `main` no
despliega. Son dos comandos y hay que hacer los dos:

```bash
git push origin main
npx vercel --prod --yes      # el CLI SÍ está autenticado, comprobado hoy
```

Comprueba siempre que el alias se movió: `npx vercel alias ls | grep sable`.

**Novedad útil que el traspaso anterior no tenía:** `npx vercel logs
cet-sable.vercel.app --json` funciona y **es la herramienta que más rindió hoy**.
Los tres fallos gordos salieron de ahí en un solo comando, después de que dos
agentes se hubieran pasado media hora razonando a ciegas. Úsalo antes de leer
código.

---

## 2 · Lo que se encontró hoy, y por qué el patrón es el mismo

Doce fallos. **Ninguno era un error de lógica.** Los doce eran código escrito,
revisado, desplegado y en producción que no hacía lo que dice hacer. Es la razón
de ser de este proyecto y hoy se confirmó doce veces más.

Los que conviene conocer porque explican cómo está el código:

1. **La lección reventaba en cada carga.** `isRenderableBlockKind` era un
   type-guard puro que vivía en un módulo `"use client"`, y un Server Component
   lo llamaba. En producción eso no es una función, es una referencia de cliente.
   Ni el typecheck ni el build lo cazan.
2. **`tokens.css` no se importaba en ninguna parte.** 175 variables `--cet-*`
   definidas, 0 en `globals.css`, **43 componentes pintándose contra variables
   que no existían**. Por eso las fracciones salían como `56` y `512`.
3. **`learning_events` no tenía ni GRANT ni política de INSERT.** Hacían falta
   *tres* cosas, no una: grant de tabla, `usage` de la secuencia del `id` (un
   permiso invisible) y una política que nunca existió. El comentario del
   Route Handler citaba una política imaginaria.
4. **El esquema `app` no está expuesto en PostgREST**, así que auditar devolvía
   406 y **revelar una clave de respuesta estaba roto entero**.
5. **El superadmin no podía escribir en cuatro tablas.** Toda política de staff
   exige `school_id = app.current_school_id()`, que para él vale NULL —y
   `true AND NULL` es NULL, no false—. Hoy es el único miembro del personal que
   existe en producción, así que la cola de altas no la podía vaciar nadie y la
   calificación manual estaba muerta.
6. **`skill_mastery` está muerta por construcción.** 0 filas, ninguna función la
   escribe, tres políticas RLS y las tres de `select`. `DATA_MODEL §7` promete un
   trigger que no existe y `modules/analytics/CLAUDE.md` promete una RPC que
   tampoco. Y `/learn` la leía: **el medidor de dominio llevaba desde siempre en
   cero.**
7. **El texto en español que ve el alumno estaba sin acentos**, incluidos los
   `rationale` de los ocho correctores, que se le pintan al niño al terminar.
   Los diccionarios de `apps/web` estaban impecables: el problema estaba entero
   en los paquetes, que es donde nadie miraba.

**La lección transversal:** cuando dos piezas se construyeron por separado, el
contrato entre ellas está roto hasta que se demuestre lo contrario, y suele estar
roto **en el sentido de que el comentario describe una defensa que no existe**.
Hoy pasó cuatro veces: el `onConflict` de la telemetría, la política
`student_writes_own`, la política de `anon` para el alta, y el captcha que `0012`
daba por hecho.

---

## 3 · Los invariantes son el activo, no los arreglos

Si solo te llevas una cosa de este traspaso, que sea ésta.

De todo lo escrito hoy, lo que más va a valer no son los doce arreglos: son los
**invariantes de familia**, que cazan a los hermanos del fallo en vez de al
fallo. Prueba de que funcionan: el de frontera RSC se escribió por la mañana y
**cazó una violación nueva, cometida por otro agente, cinco horas después**.

Los que hay, y qué familia cierra cada uno:

| Fichero | Caza |
|---|---|
| `apps/web/src/lib/rsc-boundary.test.ts` | un módulo de servidor importa un **valor** declarado en un `"use client"` |
| `apps/web/src/lib/css-exportado-se-importa.test.ts` | una hoja que un paquete exporta y ninguna app importa |
| `apps/web/src/lib/ortografia-es.test.ts` | texto español de cara al usuario sin tildes |
| `.../learn/progreso-tiene-fuente-viva.test.ts` | un indicador alimentado por una tabla que nadie escribe |
| `packages/ui/__tests__/estados-no-solo-color.test.tsx` | un mapa de estados que solo se distingue por color |
| `packages/ui/__tests__/progreso-viene-de-datos.test.tsx` | una barra decorativa alimentada por una constante |
| `packages/ui/__tests__/enunciado-invariantes.test.tsx` | un enunciado que pierde su texto hablado, o una raya que parece barra |
| `supabase/tests/web_write_paths.sql` | un cliente que escribe donde su rol no tiene permiso |
| `supabase/tests/telemetry_ingest.sql` | una tabla escrita con la sesión sin grant o sin política |
| `supabase/tests/public_rpc_surface.sql` | una función que la web llama y vive solo en un esquema no expuesto |

**Cómo trabajar con ellos, y esto importa:**

- **Si uno se pone rojo, la respuesta por defecto es arreglar el código.** Hoy
  un test rojo protegía que un lector de pantalla dijera «tres cuartos» y no
  «tres cuatro». Antes de actualizarlo hay que demostrar que el requisito se
  conserva, no que el test estorba.
- **Un test que pasa puede estar pasando por el motivo equivocado.** Ocurrió
  tres veces hoy: un invariante que se leía a sí mismo en sus comentarios; otro
  cuyas tres opciones tenían textos distintos y por eso «se distinguían»; otro
  que se dejaba engañar por una constante porque la etiqueta seguía cambiando.
  **Verifica por mutación**: rompe a mano lo que el test dice proteger y
  comprueba que se pone rojo.
- **Ningún invariante puede pasar en vacío.** Los buenos de aquí exigen un
  mínimo de ficheros o de cadenas encontradas. Un escáner que deja de encontrar
  ficheros pasa siempre.

---

## 4 · El trabajo abierto, listo para repartir

Ordenado para lanzarse en paralelo. **El reparto es por territorio de ficheros
disjunto, no por tema** — ver sección 5, que explica por qué.

### 4.1 · Red colgada en el examen — EL MÁS URGENTE

**Territorio:** `apps/web/src/lib/api.ts`, `components/exam-runner/`,
diccionarios de examen.

Medido hoy, con evidencia en `docs/superpowers/specs/2026-08-27-tactil-y-red.md`:

- Red **caída** (la petición se rechaza): funciona perfecto. «Sin conexión» →
  «Reintentando» → recupera. Nada se pierde.
- Red **colgada** (el wifi asociado que ya no encamina, el portal cautivo):
  **diez minutos simulados, un solo envío, cero reintentos, cero avisos.** El
  indicador sigue diciendo «Guardando». Y al pulsar «Sí, entregar», los tres
  botones quedan deshabilitados sin mensaje, con el reloj corriendo.

Causa: `api.ts` no pasa `AbortSignal` con plazo, y `flush()` queda bloqueado por
`inFlight`. **No se pierde ningún dato** —la cola sigue en `localStorage`,
`startAttempt` es idempotente— pero para un niño con el cronómetro corriendo es
indistinguible de perder el examen.

El spec recomienda 12 s para guardar y 25 s para entregar, y **nunca un botón
muerto**. Confírmalo con el usuario: es la pregunta 2 de ese documento.

### 4.2 · Escribir `skill_mastery` — desbloquea tres cosas

**Territorio:** `supabase/migrations/`, `modules/analytics/`.

Nadie la escribe. Mientras no exista:

- el panel de profesor enseña una lista de «destrezas más flojas» vacía;
- el progreso por grupo agrega en cliente sobre `learning_events`, O(filas), en
  vez de un `group by` indexado;
- **el sistema de recompensas no se puede construir**, porque sin mastery no hay
  forma de distinguir lo fácil de lo difícil, y ésa es toda la defensa contra el
  farmeo.

Antes hay que rellenar `learning_events.skill_id`, que **viene NULL en el 100 %
de los eventos**: el código vive en `payload.skillCode` y el índice
`(skill_id, server_ts)` no sirve para nada hoy.

Cuando exista, `progreso-tiene-fuente-viva.test.ts` obligará a borrar el hueco
declarado. El hueco se autodestruye solo.

### 4.3 · Los 91 kB del barril

**Territorio:** `packages/ui/src/index.ts` y quien lo importe.

`/learn` pesa **197 kB** de First Load JS y `/practice` **106 kB** haciendo lo
mismo. La diferencia es una línea: `import { EmptyState, ErrorState } from
"@cet/ui"`, un barril que reexporta 63 símbolos incluido `cetPreset`. En una red
de colegio se nota.

### 4.4 · La cabecera desborda en móvil

**Territorio:** `apps/web/src/app/(student)/layout.tsx`.

`scrollWidth 392` contra `clientWidth 345` a 360 px: «Salir» queda medio fuera de
pantalla y **toda la app gana scroll horizontal**. Origen: un `flex` sin
`flex-wrap` con cuatro hijos. A 768 px el raíl lateral tapa la marca por
completo. El spec de táctil pregunta qué se sacrifica; recomienda mudar idioma y
tema a `/account`.

### 4.5 · Offline — decidido el alcance, falta el spec

El usuario ya decidió: **leer lecciones descargadas, practicar sin conexión, y
aguantar cortes breves**. Terminar un examen sin conexión queda **fuera**. Y en
el dispositivo solo puede quedar **contenido, nunca datos del niño**.

**Ojo con la contradicción, que hay que resolver antes de implementar:** la app
ya guarda respuestas de examen en `localStorage` hoy, y es justo lo que evita
perderlas cuando falla la red. Quitar esa cola sin más reintroduce el riesgo que
4.1 quiere cerrar. Esto necesita spec propio.

Nota que ayuda: el motor genera las preguntas de práctica **en el cliente**, así
que practicar sin conexión está mucho más cerca de lo que parece — falta encolar
la telemetría hasta que vuelva la red.

### 4.6 · Los tres specs entregados y sin implementar

- `2026-08-27-sistema-color-pedagogico.md` — **sin aprobar**. Ojo: su diagnóstico
  de «dos paletas conviviendo» era impreciso; era una cargada y otra ausente, ya
  arreglado. Sus medidas de contraste están hechas sobre un fichero que el
  navegador no veía, así que **hay que rehacerlas antes de implementar nada**.
- `2026-08-27-tactil-y-red.md` — inventario medido. 9 preguntas abiertas.
- `2026-08-27-progreso-recompensas-tutor.md` — 8 preguntas abiertas, 15 huecos
  declarados. **Hay un agente ampliándolo ahora mismo** con tareas en equipo,
  recompensas de equipo y comparación entre alumnos: no lo toques hasta que
  cierre.

---

## 5 · Cómo trabajar aquí

### Comandos

```bash
pnpm verify                      # typecheck + lint + 1135 tests + build
pnpm --filter @cet/web test:e2e  # 46 pasan, 12 saltados (piden credenciales)
npx vercel logs cet-sable.vercel.app --json | tail -40
npx vercel --prod --yes
```

pgTAP **no corre en local**: no hay Docker ni psql en esta máquina. Corre en CI
(`db.yml`) con un push que toque `supabase/**`. Para SQL contra producción está
el MCP de Supabase.

**El truco que más ha rendido hoy:** para probar algo destructivo sin dejar
rastro, mételo en un `do $$ ... $$` que termine con `raise exception` — el
mensaje trae tu diagnóstico y la transacción se revierte entera. Así se
reprodujo la escalada de privilegios, se aislaron las tres piezas que faltaban
en la telemetría, y se validaron las políticas de `0025` **antes** de aplicarlas.

### Lo aprendido sobre trabajar con agentes en paralelo

Hoy se lanzaron nueve. Funcionó, pero con cicatrices que conviene evitar:

1. **Reparte por territorio de ficheros disjunto, no por tema.** Dos agentes con
   temas distintos acabaron los dos en `packages/ui/` y se pisaron. Escribe en
   cada encargo qué ficheros son suyos **y cuáles son de otro**.
2. **No te fíes de un `pnpm verify` que reporte un agente.** Cuando varios
   escriben a la vez, su lectura puede ser una carrera. Hoy uno reportó rojo por
   un cambio ajeno a medio escribir. **Verifica tú el árbol entero de una pieza
   antes de commitear.**
3. **Un solo Chrome.** Dos agentes conduciendo el navegador y dos servidores de
   desarrollo corrompieron el `.next` compartido. El que lo resolvió acabó
   compilando la hoja con el CLI de Tailwind y capturando por `file://`, que es
   reproducible y no disputa puertos.
4. **Exige capturas a quien toque interfaz.** Un test de render pasa en verde con
   las fracciones ilegibles. Los tres fallos visuales de hoy los encontró el
   usuario mandando una imagen, no la suite.
5. **Verifica las afirmaciones fuertes de un agente.** Hoy uno reportó una tabla
   afectada y eran cuatro; su invariante comparaba textos de predicados en vez de
   comportamiento. Y otro corrigió acertadamente un diagnóstico mío. **Los dos
   sentidos pasan.**
6. **Dale a cada agente la evidencia que ya tengas.** Los que recibieron la traza
   de producción tardaron minutos; los que empezaron a ciegas, media hora.

### Reglas

Las siete de `VERIFICATION_PLAN.md §6` siguen vigentes. Las que más valieron hoy:

1. **Verifica ejecutando.** Pega la salida literal. Nunca «debería funcionar».
2. **Un dato plausible no es un dato correcto.** Los doce fallos de hoy producían
   salida creíble, y cuatro producían pantallas que parecían correctas.
3. **Ausente no es denegado, y silencioso es peor que ruidoso.** Hoy: un 406
   tragado en un `console.error`, un `track()` vacío, un UPDATE de 0 filas
   devolviendo 204, y un autoguardado colgado diciendo «Guardando».
4. **Nunca debilites una defensa para que un test pase.** Ni una política porque
   incomode: hoy la respuesta correcta a «`anon` no puede insertar» fue cambiar
   el código, no dar el grant que `0012` niega a propósito.
5. **En un INSERT la RLS grita; en un UPDATE y en un DELETE calla.** Vale la pena
   tenerlo presente al elegir dónde poner una defensa.

---

## 6 · Decisiones que esperan al usuario

Ninguna la puede tomar un agente. Están todas planteadas y sin responder:

| | Qué | Por qué no puede decidirla un agente |
|---|---|---|
| 1 | **Captcha del alta pública** | Necesita cuenta de proveedor y un secreto en Vercel. `0012` lo daba por hecho y no existe. Es lo único que para a un bot distribuido |
| 2 | **Leaked password protection** de Supabase | Es un interruptor en el panel. Lleva apagado desde el traspaso anterior |
| 3 | **`skill_mastery`: ¿ahora o después?** | Desbloquea 4.2, pero es trabajo de fondo sin resultado visible |
| 4 | **Qué ve un niño del progreso de otro** | Es ceder datos de un menor a otros menores. `MASTER_PLAN §9` |
| 5 | **El spec de color: implementar, recortar o aparcar** | Entregado hace un día y sin aprobar |
| 6 | **Halo de foco de 7 px** | Entró con `tokens.css`; nadie lo pidió. Se quita con una línea |
| 7 | **El examen de 20 ítems de M09** | Necesita que el usuario teclee el PIN. **No introduzcas credenciales tú** |

El alumno `Y6A-001` sigue listo y la asignación `Timed mock exam — 20 marks`
tiene la ventana abierta hasta el 10 de septiembre, sin intentos todavía.

---

## 7 · Lo que nadie ha visto nunca

Sé honesto sobre esto, porque es donde están los fallos que quedan:

- **Ninguna pantalla tras login se ha visto con `tokens.css` cargado** por un
  humano. Se metieron 175 variables en una app que llevaba meses sin ellas.
- **Nadie ha abierto esto en una tableta real**, que es el dispositivo de
  destino.
- **El tema oscuro** no se ha revisado desde ninguno de los cambios de hoy.
- **El examen completo de 20 ítems de punta a punta** sigue sin ejecutarse: M09
  entero está sin verificar.
- **Nada se ha probado con un niño.**
