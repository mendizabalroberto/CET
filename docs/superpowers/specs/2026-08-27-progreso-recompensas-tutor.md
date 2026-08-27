# PROGRESO VISIBLE, PUNTOS Y ACCESO DEL TUTOR — propuesta de diseño

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> **Estado: PROPUESTA. No implementada.** Ni una línea de código, ni una migración, ni un test se
> han escrito para producir este documento. Todo lo que aquí se afirma sobre el estado actual está
> medido contra producción (`clcutoqjdgeggvgyreud`, solo lectura) o leído del repositorio, y la
> consulta o el fichero se citan al lado.
> **Fecha:** 2026-08-27 · Continúa el encargo C de `HANDOFF.md §4`.

---

## 0. Qué pide el usuario, y qué contesta este documento

Sus palabras, literales:

> "debemos mostrar visualmente cuanto esfuerzo mas y ir generando programa de recompensas por
> secciones de estudio, puntos que luego pueda cambiar con su tutor por algo pre establecido
> (tiempo de descanso, apoyo en proyecto etc)"

> "el tutor es generalmente el papa pero puede ser compartido con el profesor, el puede tener
> acceso tambien y ver si esta o no respondiendo correctamente como un feedback"

Son tres cosas distintas con tres calendarios distintos, y este documento las separa a propósito:

| | Qué es | Necesita el rol `guardian` |
|---|---|---|
| **Esfuerzo visible** | "cuánto esfuerzo más" — una meta y una barra hacia ella | **No** |
| **Puntos** | un saldo que se gana estudiando | **No** |
| **Canje con el tutor** | un catálogo que define el padre y una promesa que cumple en casa | **Sí** |
| **Informe al tutor** | "si está o no respondiendo correctamente" | **Sí** |

Las dos primeras se pueden construir esta semana. Las dos últimas están bloqueadas por decisiones
de producto que no me corresponden, y que van en §9.

**Lo que este documento NO decide.** Nada de lo que ya decidió el encargo C: el tutor es un rol
real con email y contraseña, no un enlace firmado ni un PDF. Eso está cerrado y aquí se da por
hecho.

---

## 1. La objeción que hay que atender antes de diseñar nada

El spec de color de este mismo repositorio, §2.4, dice esto:

> "la gamificación mejora motivación intrínseca percibida, autonomía y relación, pero tiene impacto
> mínimo sobre competencia, y la motivación así generada decae con la exposición prolongada. El
> énfasis en recompensas extrínsecas —puntos, monedas, rachas— puede socavar la motivación
> intrínseca y producir implicación superficial."

Y concluye: *"esta propuesta no lo amplía"*. El usuario está pidiendo exactamente lo que ese
documento recomendó no hacer. Ignorarlo sería deshonesto; obedecerlo ciegamente sería no hacer el
encargo. La salida no es ninguna de las dos.

**Lo que separa un sistema de puntos que daña de uno que no.** El resultado clásico sobre
recompensas extrínsecas no dice "las recompensas son malas". Dice, con bastante consistencia, que
lo que erosiona la motivación intrínseca son las recompensas **tangibles, esperadas y contingentes
al rendimiento** — te doy algo si aciertas — mientras que las contingentes a **completar la tarea o
al esfuerzo invertido** dañan mucho menos o nada, y el refuerzo verbal directamente ayuda. El
mecanismo propuesto es el efecto de sobrejustificación: si el niño explica su propia conducta como
"estudio porque me pagan", cuando se retira la paga se retira la conducta.

De ahí salen tres restricciones que atraviesan todo este diseño y que no son negociables por
comodidad de implementación:

1. **No se paga el acierto. Se paga el intento honesto.** (§4.2)
2. **No hay nada que se pierda.** Ningún punto se resta, ninguna racha se rompe. Una recompensa que
   se puede perder funciona como castigo, y el castigo es la forma de contingencia que peor
   envejece. (§4.4)
3. **La recompensa no la da el sistema, la da una persona.** El punto no se cambia por una moneda
   virtual: se cambia por media hora de descanso que concede el padre. Eso lo convierte en un
   **contrato de contingencia entre un niño y un adulto**, que es una intervención conductual con
   mucho mejor historial que una tienda de insignias, y que además tiene el efecto lateral de
   forzar una conversación semanal sobre el estudio entre padre e hijo. Ese efecto lateral puede
   acabar valiendo más que los puntos.

Y una cuarta, que viene del spec de color y se conserva entera: **en el examen no hay puntos, ni
rachas, ni ninguna otra cosa. Nunca.** Meter una recompensa dentro de un examen cronometrado
cambia lo que el examen mide.

Aun con las cuatro restricciones, **esto sigue siendo un riesgo asumido, no un riesgo resuelto**.
§4.6 dice cómo se comprobaría si el riesgo se materializó, y §10 declara lo que no sabemos.

---

## 2. Lo que hoy existe, medido

Todo lo de esta sección es evidencia, no memoria. Es la base sobre la que se construye el resto.

### 2.1 Los números de producción

Consulta ejecutada el 2026-08-27 contra `clcutoqjdgeggvgyreud`:

| Tabla | Filas |
|---|---|
| `learning_events` | **45** |
| `skill_mastery` | **0** |
| `skills` | 23 |
| `students` | 1 |
| `students` con `guardian_email` no nulo | **0** |
| `lessons` / `course_modules` | 8 / 1 |
| `sections` / `section_members` | 1 / 1 |
| `exam_attempts` / `attempt_items` / `attempt_gradings` | 1 / 2 / 3 |
| `questions` | 11 |
| `audit_log` | 1 |
| `profiles` / `schools` | 2 / 1 |

Reparto de los 45 eventos por tipo: `answer_changed` 9, `question_shown` 6,
`lesson_block_viewed` 6, `practice_started` 4, `practice_item_answered` 3, `focus_gained` 3,
`practice_streak` 3, `answer_submitted` 3, `focus_lost` 2, `idle_start` 2, `login_success` 2,
`lesson_opened` 1, `pin_changed` 1.

**La telemetría de aprendizaje emite.** Hay eventos de lección y de práctica, que es lo que
`HANDOFF §3` declaraba ausente. El bloqueo que ese documento pone delante de los encargos B y C
está levantado.

### 2.2 `skill_mastery` está muerta por construcción, y es la dependencia mayor de todo esto

Tres comprobaciones independientes, las tres negativas:

- `select count(*) from public.skill_mastery` → **0**.
- Ninguna función de `app` ni de `public` menciona `skill_mastery` en su cuerpo (consulta sobre
  `pg_get_functiondef` de las 2 esquemas): **0 filas**.
- Sus políticas RLS son **tres, y las tres de `select`** (`skill_mastery_select_own`,
  `_select_staff`, `_select_superadmin`). No existe política de `insert` ni de `update`. Nada
  salvo `service_role` puede escribirla, y nada lo hace.

`DATA_MODEL §7` dice *"actualizado por trigger/job desde los eventos"*. Ese trigger o job **no
existe**. Y sin embargo `apps/web/src/components/learn/queries.ts` ya lee la tabla para calcular
`CourseSummary.mastery`, con el comentario *"`null` si aún no ha practicado"*: hoy es siempre
`null`, y el `MasteryMeter` del alumno enseña un dato que nunca llega. Es un caso de libro de la
regla R3 de `VERIFICATION_PLAN`: dos piezas construidas por separado, el contrato entre ellas roto,
y el fallo se ve como "todavía no ha practicado" en vez de como un error.

**Consecuencia para este spec:** la calibración de §4 depende de saber qué domina el alumno y qué
no. Si eso no se construye, el sistema de puntos no puede distinguir lo fácil de lo difícil, y sin
esa distinción **es exactamente el sistema que enseña a farmear**. Va como Fase 0 en §8.

### 2.3 La práctica se corrige en el cliente, y eso decide el diseño

`apps/web/src/app/(student)/practice/[skillCode]/page.tsx`, en su cabecera:

> "El servidor solo resuelve el tema y el idioma. Todo lo demás —generar, corregir y pintar— corre
> en el cliente (AD-5)."

Y el evento que llega, tal cual está en producción (`learning_events`, fila real):

```json
{ "seed": 2970190434090466, "params": {"locale":"es"}, "topicId": "math.compare",
  "engineKey": "math.compare", "isCorrect": true, "maxPoints": 1,
  "skillCode": "math.fractions.compare", "pointsAwarded": 1 }
```

**`isCorrect` y `pointsAwarded` son una declaración del alumno, no un hecho del servidor.**
`/api/events` deriva `school_id` y `student_id` de la sesión —y eso lo hace bien y está bien
argumentado en el fichero—, pero `payload` es `z.record(z.unknown())`: contenido libre. Un niño con
las herramientas de desarrollo abiertas puede emitir mil `practice_item_answered` con
`isCorrect: true` sin resolver nada. Y `practice_item_answered` ni siquiera tiene esquema declarado
en `eventPayloads` de `packages/shared/src/events.ts`, aunque es el evento más rico que se emite:
otro contrato sin verificar.

Un ledger de puntos que confíe en ese campo es un ledger que el propio beneficiario escribe.

Lo interesante es que **la restricción de seguridad y la decisión pedagógica apuntan al mismo
sitio**: no debemos pagar el acierto (§1, restricción 1) y además no podemos verificarlo. Lo que sí
es verdad del servidor es el `server_ts` de cada evento, cuántos eventos hubo y en qué orden. Eso
es esfuerzo, y el esfuerzo es lo que queremos pagar. Esto no es una casualidad afortunada, es la
señal de que la restricción pedagógica estaba bien elegida.

### 2.4 Lo que hay de esfuerzo, y lo que falta

Lo que ya se emite y sirve:

| Señal | Dónde | Fiabilidad |
|---|---|---|
| Duración real de la sesión | `server_ts` del primer y último evento de un `session_id` | **Servidor** |
| Ítems intentados | cuenta de `practice_item_answered` por sesión | Cliente (cuenta, no contenido) |
| Tiempo por ítem, pistas usadas, veces que cambió de opinión | `answer_submitted.payload`: `timeOnItemMs`, `hintsUsed`, `changeCount` | Cliente |
| Ausencia y distracción | `idle_start` / `idle_end` / `focus_lost` / `focus_gained` | Cliente |
| Tema | `payload.skillCode`, `payload.engineKey` | Cliente |

Lo que falta y hace falta:

1. **`skill_id` viene NULL en todos los eventos de práctica.** El código de la skill vive dentro de
   `payload.skillCode`; la columna indexada `(skill_id, server_ts desc)` de `DATA_MODEL §7` no se
   rellena y por tanto no sirve para nada. Agregar por skill obliga hoy a bucear en jsonb.
2. **No hay dificultad en la práctica.** `params` observado es `{"locale":"es"}`. El generador
   determinista no expone un `difficulty` en el evento, aunque el camino del banco sí lo tiene
   (`packages/engine/src/blueprint.ts`). Sin esto, "lo difícil paga más" solo puede apoyarse en la
   dificultad **subjetiva** (mastery del alumno), no en la del ítem — que, como argumenta §4.3, es
   la métrica correcta de todas formas, pero conviene saber que la otra no está disponible.
3. Hay **9 generadores** registrados (`packages/engine/src/generators/index.ts`) más el tema `mix`.
   Ése es el universo real de temas de práctica hoy.

### 2.5 Lo que el profesor ya ve

Esto responde directamente a la parte de "compartido con el profesor", y conviene tenerlo delante
antes de §5:

```
learning_events_select_staff:  school_id = app.current_school_id() AND app.is_staff()
skill_mastery_select_staff:    school_id = app.current_school_id() AND app.is_staff()
```

Un profesor lee **todos** los eventos de aprendizaje de **todos** los alumnos de su colegio, no
solo los de sus secciones. El helper `app.teaches_student(uuid)` existe y `modules/security/CLAUDE.md`
lo declara *"reservado para endurecer M04"*: sigue sin usarse. No es un fallo de este encargo, pero
es el suelo real sobre el que se apoya cualquier frase del tipo "el profesor ya tiene acceso".

---

## 3. El modelo de datos de los puntos

### 3.1 Qué es una "sección de estudio"

El usuario dice "recompensas por secciones de estudio". Hay tres candidatos en el modelo actual:
la lección, el módulo del curso y la sesión de práctica sobre un tema. La propuesta es:

> **La unidad que se acredita es la SESIÓN DE ESFUERZO CERRADA, no el ítem individual y no la
> lección.**

Una sesión de esfuerzo es una de estas tres, y se cierra en el servidor:

| Tipo | Se abre con | Se cierra con | Paga |
|---|---|---|---|
| `practice` | `practice_started` | inactividad > 10 min, o el siguiente `practice_started` de otro tema, o el fin de la ventana de acreditación | Sí |
| `lesson` | `lesson_opened` | `lesson_completed`, o inactividad | Sí |
| `exam` | `attempt_started` | `attempt_submitted` | **No. Nunca.** |

**Por qué la sesión y no el ítem.** Tres razones, en orden de peso:

1. **Es el único nivel donde el anti-farmeo se puede escribir una sola vez.** Los rendimientos
   decrecientes, el tope, el mínimo de tiempo y la comprobación de que el alumno estuvo presente
   necesitan mirar la sesión entera. Si se acredita ítem a ítem, cada regla hay que reimplementarla
   como estado acumulado y cada una es un sitio donde equivocarse.
2. **Pagar por ítem enseña a hacer ítems.** Pagar por sesión enseña a sentarse a estudiar un rato,
   que es la conducta que el usuario quiere ("cuánto esfuerzo más").
3. El ledger crece por sesión, no por clic. Con 30 niños practicando eso es la diferencia entre
   cientos de filas al día y decenas de miles.

**Por qué no la lección como unidad principal.** Porque hay 8 lecciones en producción y 9
generadores de práctica con ítems infinitos: si la lección fuera la unidad, el alumno agotaría el
catálogo de puntos en una tarde. La lección paga, pero **una sola vez por lección** (§4.5).

### 3.2 Ledger append-only con saldo derivado y cadena verificable

**El saldo no es una columna que se actualiza. Es una suma.** El motivo es el que da el encargo, y
es correcto: una columna mutable la corrompe cualquier bug —una condición de carrera, un reintento,
un `update` con el `where` equivocado— y no deja rastro de cuándo dejó de ser cierta. Este proyecto
ya aplicó ese razonamiento tres veces (`question_versions` inmutable, `attempt_responses` una fila
por revisión, `audit_log` append-only); esto es la cuarta.

```
reward_ledger
  id                bigint identity
  school_id         uuid not null
  student_id        uuid not null
  seq               int  not null          -- orden por alumno. unique (student_id, seq)
  delta             int  not null          -- >0 ganado, <0 canjeado. NUNCA 0
  balance_after     int  not null          -- check >= 0
  reason            reward_reason not null -- enum, no texto libre
  source_kind       text not null          -- 'practice_session' | 'lesson' | 'weekly_goal'
                                           -- | 'mastery_gain' | 'redemption' | 'adjustment'
  source_id         text not null          -- session_id, lesson_id, id del canje, semana ISO
  basis             jsonb not null         -- POR QUÉ salió ese número (§3.3)
  actor_kind        text not null          -- 'system' | 'guardian' | 'school_admin'
  actor_id          uuid                   -- null cuando actor_kind='system'
  created_at        timestamptz not null default now()

  unique (student_id, seq)
  unique (student_id, source_kind, source_id)   -- idempotencia. La clave del asunto.
  check  (delta <> 0)
  check  (balance_after >= 0)
```

Tres propiedades, y cada una existe por un fallo concreto que evita:

- **`unique (student_id, source_kind, source_id)`** es la idempotencia. `/api/events` no deduplica
  —lo dice su propio comentario: *"la unicidad se trata donde de verdad vive: al LEER"*— así que un
  corte de wifi puede duplicar eventos. Si el acreditador vuelve a procesar la misma sesión, el
  insert choca y no pasa nada. Sin esto, reintentar el job duplica puntos.
- **`balance_after` con `check >= 0` y la cadena verificada por trigger** (`balance_after` de la
  fila `seq` = `balance_after` de `seq-1` + `delta`). No es redundancia con `sum(delta)`: es lo que
  hace que una corrupción sea **detectable**. Un ledger cuyo saldo solo es `sum(delta)` puede tener
  una fila de más y nadie se entera nunca. Con la cadena, una fila de más rompe el eslabón y un
  test lo caza.
- **`delta` es entero.** Ningún niño de once años tiene que entender "tienes 37,4 puntos", y los
  enteros hacen que la comprobación de saldo sea exacta en vez de aproximada.

`reward_ledger` es append-only con el mismo trigger que `audit_log` (`before update or delete →
raise exception`), y entra en `supabase/tests/immutability.sql`, que ya prueba justo eso para dos
tablas.

**Correcciones.** Un error se corrige con una fila `reason='adjustment'` de signo contrario,
`actor_kind='school_admin'` y `basis` explicando por qué. Nunca borrando. Y esa fila se audita.

### 3.3 `basis`: por qué el ledger explica cada número

Cada fila positiva guarda cómo se calculó:

```json
{ "v": 1, "sessionId": "…", "skillCode": "math.fractions.simplify",
  "itemsAttempted": 12, "itemsCredited": 8, "activeSeconds": 430,
  "masteryAtStart": 0.31, "multiplier": 1.0, "dailyCapRemaining": 40,
  "base": 8, "granted": 8 }
```

Dos motivos. El primero: cuando el usuario —o un padre— pregunte "¿por qué le dio 8 puntos?", la
respuesta está en la fila y no hay que reconstruirla desde 45.000 eventos. El segundo, y es el que
importa: **cuando se cambie la calibración, `basis.v` permite recalcular sobre datos viejos** y ver
qué habría pasado con la fórmula nueva sin tocar el saldo de nadie. Sin eso, cada ajuste de
calibración es a ciegas.

### 3.4 Cómo se evita el doble gasto

El caso real: el niño da dos veces al botón de canjear, o tiene la app abierta en la tableta y en
el portátil.

```
reward_accounts (student_id uuid primary key, school_id uuid not null, next_seq int not null)
```

Esta tabla existe **solo para tener una fila que bloquear**. El canje es una función
`security definer` que hace, en una transacción:

1. `select next_seq from reward_accounts where student_id = $1 for update` — serializa todo el
   movimiento de ese alumno, incluidas las acreditaciones concurrentes del job.
2. Lee el `balance_after` de la última fila del ledger.
3. Si `balance < coste`, `raise exception`. **No inserta nada.**
4. Inserta la fila negativa con `seq = next_seq`, `balance_after = balance - coste`.
5. `update reward_accounts set next_seq = next_seq + 1`.

El `check (balance_after >= 0)` es la segunda barrera: aunque el paso 3 tuviera un fallo de lógica,
la base rechaza la fila. Defensa en profundidad, que es como está construido todo lo demás de este
proyecto.

**El test que lo prueba** no es un test de "canjeo y baja el saldo". Es: dos transacciones
simultáneas pidiendo cada una un canje de 50 con un saldo de 60 → **exactamente una** termina en
commit, la otra recibe `insufficient_funds`, y el saldo final es 10. Sin ese test la sección es
prosa.

### 3.5 Lo que NO se guarda

No hay tabla `student_points(balance int)`. Ni caché de saldo, ni columna en `students`. Si algún
día la lectura del saldo pesa —hoy, con 1 alumno y 45 eventos, es una idea graciosa— la respuesta
correcta es una vista materializada refrescada desde el ledger, **nunca** una columna que dos
caminos distintos escriben.

---

## 4. La calibración pedagógica

Es la sección más importante del documento. Un sistema de puntos mal calibrado no es un sistema de
puntos peor: es un sistema que enseña activamente la conducta contraria a la que se buscaba, y lo
hace con eficacia, porque los niños son muy buenos encontrando el camino corto.

### 4.1 Declaración explícita de qué se incentiva y qué no

Esta tabla es el contrato del sistema. Cualquier regla futura que la contradiga está mal.

| Conducta | Qué hace el sistema | Mecanismo |
|---|---|---|
| Sentarse a practicar un rato seguido un tema que se le da mal | **Paga completo** | §4.3 multiplicador por mastery baja |
| Fallar un problema difícil habiéndolo intentado de verdad | **Paga igual que acertarlo** | §4.2 |
| Volver un día después a un tema que falló y ya no fallarlo | **Paga un bono, una sola vez** | §4.5 bono de recuperación |
| Estudiar 4 días de la semana, aunque uno flojito | **Paga bono semanal** | §4.4 |
| Estar enfermo el martes | **No pasa nada. No se pierde nada** | §4.4 |
| Repetir el tema que ya domina | **Paga cada vez menos, hasta casi cero** | §4.3 |
| Encadenar 90 minutos seguidos el mismo día | **Paga decreciente y con tope duro** | §4.5 |
| Responder a toda velocidad sin leer | **No paga nada** | §4.2 mínimo de tiempo |
| Dejar la sesión abierta y marcharse | **No paga** | `idle` descontado del tiempo activo |
| Falsificar `isCorrect` desde la consola | **No cambia nada** | §4.2: el acierto no paga |
| Hacer un examen | **No paga nunca** | §3.1 |
| Compararse con un compañero | **Imposible: el dato no existe en su pantalla** | §7 |

**Lo que se desincentiva, dicho sin rodeos:** repetir lo dominado, correr sin leer, y encadenar
maratones. **Lo que se incentiva:** ir donde falla, aguantar el fallo, y volver mañana.

### 4.2 Se paga el intento honesto, no el acierto

**La regla.** Un ítem cuenta como *intento acreditable* si se cumplen las tres:

- hubo un `answer_submitted` para él (no se saltó);
- `timeOnItemMs` supera un mínimo por tipo de tema — el suelo, no la media: leer el enunciado más
  teclear una respuesta;
- el alumno estaba presente: el ítem no cae dentro de un tramo `idle_start`/`idle_end`.

Acertar **no** entra en la lista. Fallar tampoco resta.

**Por qué.** Es la decisión central del documento y tiene tres apoyos independientes que apuntan al
mismo sitio:

1. **Pedagógico.** Si el acierto paga, la estrategia óptima del niño es ir a lo que ya sabe. Es la
   patología exacta que el encargo pide evitar, y es *racional* por parte del niño: le hemos dicho
   que le pagamos por acertar. Pagar el intento hace que la estrategia óptima sea ir donde se
   aprende más, que es donde se falla.
2. **Motivacional.** Es la distinción de §1: la recompensa contingente al rendimiento es la que
   erosiona la motivación intrínseca; la contingente a completar la tarea, mucho menos.
3. **Técnico.** El acierto en práctica lo declara el cliente (§2.3). No es verificable. El tiempo
   entre eventos, sí. Diseñar sobre lo que no se puede verificar es construir sobre arena.

**La objeción obvia, y su respuesta.** "Entonces le da igual acertar." No, por dos razones. Primera:
el bono de recuperación de §4.5 **sí** paga el resultado, pero solo el resultado que representa
aprendizaje —pasar de fallar a acertar de forma sostenida en un tema— y solo una vez por umbral
cruzado, así que no es farmeble. Segunda: la pantalla de práctica **sigue diciendo si acertó o no**,
inmediatamente, como hoy. La retroalimentación sobre la corrección no desaparece; lo que desaparece
es el precio.

**La objeción menos obvia, que sí es un riesgo real.** Un niño listo puede teclear cualquier cosa
esperando el mínimo de tiempo. Contra eso: el mínimo de tiempo no es la defensa principal, es un
suelo. La defensa principal es que **el techo es bajo** (§4.5): con un tope diario modesto, el
farmeo perezoso ahorra diez minutos y no gana nada más. Un sistema con techo bajo no necesita ser
infalsificable, solo necesita que falsificarlo no sea rentable.

### 4.3 La dificultad que cuenta es la del niño, no la del ítem

Un multiplicador por sesión según lo que el alumno domina de ese tema:

| `mastery` del skill al empezar la sesión | Multiplicador |
|---|---|
| sin datos (nunca lo ha tocado) | 1,0 |
| baja | 1,0 |
| media | ~0,6 |
| alta | ~0,25 |

Los tramos y los valores exactos son **una propuesta con forma, no una calibración validada** —ver
hueco H3—. Lo que sí es una decisión firme es la **forma**: monótona decreciente, y que nunca llegue
a cero. Que no llegue a cero importa: si repasar lo dominado pagara literalmente nada, el sistema
le estaría diciendo a un niño que repasar antes de un examen es tirar el tiempo, y eso es peor
consejo que el farmeo que evita.

**Por qué la mastery del alumno y no la dificultad del ítem.** Porque un problema de dificultad 4
es fácil para quien lo domina y una dificultad 2 es un muro para quien no. Premiar la dificultad
nominal premia a quien ya iba bien. Premiar la dificultad *personal* premia al que se está
esforzando, que es lo que el usuario pidió con "cuánto esfuerzo más". Y de paso, la dificultad
nominal **no está disponible en los eventos de práctica** (§2.4), así que la alternativa tampoco
era gratis.

**Esto está bloqueado por `skill_mastery`, que hoy tiene 0 filas y nadie escribe** (§2.2). Sin ella
todos los multiplicadores valen 1,0 y **el sistema pierde su principal defensa contra el farmeo**.
Por eso Fase 0 en §8 no es una recomendación: es un requisito.

**Fallback si Fase 0 se retrasa** —y hay que decidirlo explícitamente, no dejarlo pasar—: calcular
la proporción de aciertos histórica del propio alumno en ese `skillCode` directamente desde
`learning_events`, deduplicando por `(session_id, seq)`. Es peor —usa el `isCorrect` que declara el
cliente— pero para el multiplicador el incentivo de falsificarlo está **invertido**: mentir
diciendo que acierta le baja el multiplicador. Un dato que el usuario no tiene motivo para
falsear en su contra es utilizable donde no lo sería en otro sitio.

### 4.4 Constancia sin castigo

**No hay racha diaria.** La racha clásica —"llevas 7 días, no la rompas"— es la mecánica que peor
encaja con un niño de once años y con la restricción 2 de §1: convierte enfermar, viajar o tener
un mal día en una pérdida, y produce la conducta de abrir la app treinta segundos para "salvarla",
que es estudio de cero valor. El proyecto ya tiene un `StreakMeter` dentro de la sesión de
práctica; se queda como está y **no se extiende a días**.

En su lugar: **días activos de la semana**, un contador que solo sube y se reinicia el lunes sin
que nadie pierda nada.

- Un día cuenta como activo si tuvo al menos una sesión acreditada.
- Al alcanzar el objetivo semanal se paga un bono, una vez por semana ISO
  (`source_id` = `2026-W35`, y la clave única de §3.2 hace el resto).
- **El objetivo semanal lo pacta el tutor con el niño**, dentro de un rango acotado por el sistema
  (3 a 5 días). Que lo pacten los dos es la mitad del valor de esta pieza: es la conversación.
- Si la semana acaba en 2 días, el niño ve "2 de 4 días" y **no ve ningún mensaje de fracaso**. La
  semana siguiente empieza en cero como todas.

El objetivo es acotado por el sistema para que un tutor no pueda pactar 7 días. Un adulto con buena
intención y un contador delante pone metas duras; ese fallo lo evita el rango, no la buena fe.

### 4.5 El resto de la fórmula

**Rendimientos decrecientes dentro de la sesión.** Los primeros ítems acreditables de una sesión
pagan completo; a partir de un umbral, cada uno paga una fracción. Motivo: una sesión de 12 ítems
es estudio; una de 200 es otra cosa.

**Tope diario duro.** Un máximo de puntos por día natural, en la zona horaria del colegio
(`schools.timezone`, que ya se usa para las ventanas de examen). El tope es lo que hace que ningún
fallo de calibración se convierta en un desastre: aunque una fórmula esté mal, el daño máximo del
día está acotado. **El tope se implementa comprobando el ledger, no un contador**, porque un
contador diario es otra vez estado mutable.

**La lección paga una vez.** `lesson_completed` acredita una vez por `(student_id, lesson_id)`,
para siempre. Releerla es bueno y no paga.

**El bono de recuperación.** Cuando el `mastery` de un skill cruza un umbral hacia arriba, se
acredita un bono con `source_kind='mastery_gain'`, `source_id = skill_id + umbral`. Solo una vez
por umbral. Es el único sitio donde se paga un resultado, y paga el resultado correcto: **haber
aprendido algo que antes no sabía**. Depende de Fase 0.

**Nada resta.** Los únicos `delta` negativos del ledger son canjes y ajustes administrativos. No
existe la penalización.

### 4.6 Cómo se comprobaría que la calibración funciona

Sin esto, la sección anterior son opiniones bien escritas. Cuatro instrumentos, en orden de valor:

**1. La función de acreditación es pura, y se ataca con simuladores.**
Es lo más importante y lo único que se puede hacer **hoy, sin base de datos y sin usuarios**.
`creditSession(eventos, masteryPrevia, estadoDelDia) → { delta, basis }` sin E/S, determinista, en
un paquete compartido. Y sobre ella, tres simuladores:

- **El honesto**: temas variados, elige donde falla, ~15 min al día, acierta el 60 %.
- **El farmeador perezoso**: el tema que mejor domina, responde al instante, todo el día.
- **El farmeador listo**: el tema que mejor domina, espera el mínimo de tiempo, tope diario, todos
  los días.

**El criterio de aceptación es una desigualdad:** el farmeador listo no debe superar una fracción
acordada de los puntos del honesto (propuesta: no más del 60 %) pese a dedicar más tiempo. Si la
supera, la calibración está mal y el test lo dice **antes** de que se entere un niño. Este es el
patrón que ya usa `@cet/engine` con su test de propiedad sobre el determinismo, y es el motivo por
el que la función tiene que ser pura: una fórmula enterrada en una RPC de Postgres no se puede
atacar así.

**2. La línea base, tomada ANTES de encender los puntos.**
Hay que registrar, sobre las semanas previas al lanzamiento: distribución de temas practicados por
mastery, minutos activos por día, y proporción de sesiones abandonadas en el primer ítem. **Sin
línea base no se puede demostrar nada después**, y este es el error que resulta imposible de
arreglar más tarde. Hoy hay 45 eventos y 1 alumno: la línea base no existe todavía y hay tiempo
de sobra para tomarla.

**3. Tres invariantes que se vigilan en producción.**

- **La curva de rendimiento.** Puntos por minuto activo, agrupados por mastery del tema. Debe ser
  **decreciente**. Si crece, el sistema está pagando mejor lo fácil y hay que parar.
- **La dieta de temas.** Proporción de tiempo dedicado a temas de mastery baja. Comparada con la
  línea base, no debe **bajar**. Si baja, el sistema apartó al niño de donde le hace falta.
- **El abandono.** Sesiones que acaban en el primer ítem. Si sube, algo del sistema está
  produciendo frustración.

**4. Lo que ningún dato va a contestar, y hay que preguntar.**
Si el niño sigue estudiando cuando los puntos se retiran o se acostumbra a ellos. Eso es el efecto
de sobrejustificación y se mide en meses, con conducta observada por un adulto, no con telemetría.
Vale más una conversación con el padre a los tres meses —"¿sigue abriendo la app cuando no hay nada
que ganar?"— que cualquier gráfica. Queda como hueco H1.

---

## 5. Quién ve qué

Aquí se ceden datos de un menor a un tercero. `MASTER_PLAN §9` obliga a minimización y a auditar
todo acceso a datos de alumno. La forma de cumplirlo no es enseñar poco por miedo: es decidir qué
pregunta tiene derecho a contestar el tutor, y enseñar exactamente eso.

**La pregunta del tutor, en palabras del usuario:** "si está o no respondiendo correctamente, como
un feedback". Es una pregunta legítima y tiene una respuesta buena que no requiere reproducirle el
cuaderno del niño en el móvil.

### 5.1 Recomendación: agregados, y de los buenos

**El tutor ve agregados. No ve el detalle pregunta a pregunta.** Una recomendación, no un menú.

Lo que **sí** ve:

- **Cuándo y cuánto.** Minutos activos por día, últimas 4 semanas. Franja horaria habitual.
- **Constancia.** Días activos esta semana contra el objetivo pactado.
- **Qué trabajó.** Los temas tocados en el periodo, con tiempo por tema.
- **Cómo le va, por tema.** Y aquí está la respuesta a su pregunta: por cada tema, **acierto
  agregado del periodo en tres tramos** —"le cuesta" / "va bien" / "lo domina"— **acompañado del
  dato crudo agregado**: "fracciones: 4 de cada 10". Eso *es* "si está respondiendo
  correctamente". Es la respuesta útil.
- **Qué reforzar.** Los dos o tres temas más flojos, con el enlace para que el niño practique. No
  una recomendación generada por IA: una ordenación por mastery.
- **Exámenes:** que hubo un examen, cuándo, y el resultado global (`score_pct`, aprobado o no).
- **Puntos:** saldo, cómo se ganó (el `basis` en lenguaje humano) y el historial de canjes.

Lo que **no** ve, y por qué:

| No ve | Por qué |
|---|---|
| El enunciado literal de un ítem (`rendered_body`) | Es el banco de preguntas. Un padre con acceso al banco puede preparar a su hijo sobre las preguntas del examen |
| La respuesta concreta que dio | Minimización. No añade nada al agregado y convierte el informe en un cuaderno de errores |
| Cuántas veces cambió de opinión, `focus_lost`, cada `idle` | Es vigilancia de conducta minuto a minuto, no información pedagógica. Es la parte del informe con la que un padre ansioso hace más daño que bien |
| El desglose ítem a ítem de un examen | Existe para remediar y para recurrir una nota. Eso es del profesor |
| `learning_events` en crudo | Ni existe la vía |
| Nada de ningún otro alumno, ni medias de clase, ni posiciones | §7 |

**El resumen que le da forma al diseño:** el tutor recibe **tendencia y dirección**; el profesor
conserva el **detalle forense**. Son dos preguntas distintas —"¿va bien mi hijo?" contra "¿por qué
falló este ítem?"— y solo la primera es del padre.

### 5.2 El niño lo sabe. No es negociable

**Recomendación: el alumno ve, en `/account`, una pantalla "Lo que ve <nombre del tutor>" que
enseña exactamente los mismos datos, generados por el mismo código.** No un texto que lo describa:
los datos.

Tres razones, y la tercera es la que convence:

1. **Ética y desarrollo.** Un niño de once años vigilado sin saberlo aprende que los adultos miran
   a escondidas. El coste no se paga en la app.
2. **Calidad del dato.** El niño *sí* va a sospechar que el padre ve algo. Un niño que sospecha
   vigilancia y no conoce su alcance cambia su conducta a lo grande —deja de pedir pistas, deja de
   equivocarse en práctica, adivina en vez de intentar— y eso **contamina la telemetría sobre la
   que descansa el producto entero**. La transparencia no es solo lo correcto: es lo que mantiene
   el dato limpio.
3. **Detección.** Si niño y tutor consumen la **misma función**, cualquier fuga en la vista del
   tutor aparece también en la del niño. Es un detector gratis y permanente, y encaja con la regla
   del proyecto de preferir el fallo ruidoso al silencioso.

Además: cuando se aprueba una vinculación, el alumno lo ve **la próxima vez que entra**, con un
aviso que no se puede saltar sin leerlo, en su idioma y con la frase escrita para un niño: *"Ahora
tu tutor puede ver cuánto estudias y en qué temas vas mejor o peor. No ve tus respuestas."*

### 5.3 Cómo se vincula un tutor a un alumno

**Recomendación: autoriza siempre el colegio, y en concreto un `school_admin`.**

El flujo:

1. El tutor se registra con email y contraseña, y verifica el email.
2. Solicita vincularse indicando colegio, `student_code` y nombre del alumno. Queda `pending`.
3. Un **`school_admin`** aprueba o rechaza. No un profesor.
4. Al aprobarse: el enlace pasa a `active`, se escribe en `audit_log`, y el alumno recibe el aviso
   de §5.2.

**Por qué el colegio y no otro.** El colegio es el único que sabe de verdad quién es el padre de
quién; es el que ya tiene esa relación por escrito. Y este proyecto **ya tiene exactamente esta
forma**: `registration_requests` es alta de alumno con aprobación de admin, con `reviewed_by`,
`reviewed_at` y `rejection_reason`. Copiar una forma que ya existe y ya está probada vale más que
inventar una.

**Por qué NO el propio alumno.** Un niño de once años no puede ser la autoridad que concede a un
adulto acceso a sus datos: es presionable por el adulto que tiene delante, y si se equivoca la
responsabilidad no puede ser suya. Se le informa siempre (§5.2), pero no se le pone a decidir.

**Por qué NO basta con conocer el `guardian_email`.** Además del problema evidente —conocer un email
no prueba nada—, hay un hecho medido: **`students.guardian_email` tiene 0 filas pobladas en
producción**. No hay ningún dato contra el que autoverificar aunque quisiéramos.

**Por qué el `school_admin` y no el profesor.** Un profesor tiene 30 alumnos y ninguna forma de
saber si el señor que escribe es el padre. Un `school_admin` tiene la matrícula. Y concentra la
decisión en el rol que ya responde por los datos del colegio.

**Revocación.** El `school_admin` revoca. El tutor puede desvincularse solo. El alumno **puede
pedirlo, y su petición llega al admin, pero no revoca por sí mismo** — si pudiera, cualquier
suspenso desactivaría la supervisión. Esto es una decisión de producto y va como **P4** en §9.

### 5.4 "Compartido con el profesor": no es un permiso nuevo

El usuario dice que el tutor "puede ser compartido con el profesor, él puede tener acceso también".

**El profesor ya tiene ese acceso, y mucho más** (§2.5): `learning_events_select_staff` y
`skill_mastery_select_staff` le dan todos los eventos de todos los alumnos de su colegio. El rol
`guardian` no le añade absolutamente nada.

Lo que el usuario está pidiendo de verdad —y es una petición buena— es que **padre y profesor miren
la misma pantalla**. Entonces la respuesta correcta no es un permiso, es una pieza de código:

> La vista del tutor se construye como **una única función de datos**. `/teach` gana un enlace "ver
> el informe del tutor de este alumno" que renderiza esa misma función. No hay una segunda
> implementación del informe.

Ventajas: la conversación padre–profesor pasa sobre los mismos números; el profesor ve exactamente
qué se le está contando a la familia; y hay un solo sitio donde arreglar un error de cálculo. Si
hubiera dos implementaciones, la del profesor y la del tutor divergirían, y este proyecto ya sabe
qué pasa cuando dos piezas construidas por separado se dan la mano (`VERIFICATION_PLAN §2`, R3).

**Hallazgo aparte, que no es de este encargo pero conviene anotar:** que un profesor lea la
telemetría de alumnos a los que no da clase incumple la minimización de `MASTER_PLAN §9` con el
mismo argumento que aplico al tutor. `app.teaches_student(uuid)` existe y está sin usar. Endurecer
esas dos políticas es una tarea acotada y con el helper ya escrito.

### 5.5 Qué se audita del tutor

`MASTER_PLAN §9` exige auditar "todo acceso de staff a datos de alumno". El tutor no es staff,
pero es un tercero mirando datos de un menor: **se audita igual, y con el mismo mecanismo**.

Se registra en `audit_log`:

| Acción | Cuándo |
|---|---|
| `guardian.link_requested` / `link_approved` / `link_rejected` / `link_revoked` | vinculación |
| `guardian.report_viewed` | cada apertura del informe, con el periodo consultado |
| `guardian.catalog_changed` | alta, baja o cambio de precio de una recompensa |
| `guardian.redemption_approved` / `_rejected` / `_fulfilled` | cada canje |
| `guardian.weekly_goal_changed` | cambio del objetivo pactado |

**Y el niño ve ese registro.** En la misma pantalla de §5.2: *"tu tutor miró tu progreso 3 veces
esta semana"*. La simetría es el punto: si al tutor le incomoda que su hijo sepa cuántas veces
mira, esa incomodidad es información sobre la relación y es mejor que salga.

**Tres obstáculos técnicos concretos**, todos comprobados hoy:

1. `public.audit_staff_action` —el envoltorio que la migración 0023 creó para arreglar el 406—
   empieza con `if not (app.is_staff() or app.is_superadmin()) then raise exception`. Un guardian
   **no** pasa. Hace falta un envoltorio propio, `public.audit_guardian_action`, con su propia
   guarda y su propia lista blanca de acciones. No relajar el existente: la guarda cerrada es
   correcta y es lo que arregló un fallo de meses.
2. `audit_log.actor_role` es de tipo `public.user_role`. Añadir `guardian` al enum lo resuelve.
3. `app.audit()` escribe `school_id = app.current_school_id()`. Un guardian necesita `school_id`
   para que su entrada sea visible en el visor del colegio — lo cual enlaza directamente con el
   problema siguiente.

### 5.6 El problema de la constraint, que hay que resolver antes de escribir la migración

`public.profiles` tiene, verificado hoy:

```sql
profiles_superadmin_has_no_school   CHECK ((role = 'superadmin') = (school_id IS NULL))
profiles_staff_needs_email          CHECK ((role = 'student') OR (email IS NOT NULL))
```

La segunda es amable: un guardian tiene email, pasa. **La primera obliga a que todo guardian
pertenezca a exactamente un colegio.** Y un tutor con dos hijos en dos colegios distintos no cabe.

Dos salidas:

- **(a) El guardian pertenece a un colegio.** `school_id not null`. Un tutor con hijos en dos
  colegios necesita dos cuentas con dos emails. No toca la constraint, no toca la RLS de nadie, y
  el guardian encaja en `app.current_school_id()` sin ninguna excepción.
- **(b) Relajar la constraint** para admitir un guardian sin colegio, y resolver el tenant por
  `guardian_links`. Es correcto, y desmonta la constraint que `DATA_MODEL §1` describe como *"la
  que hace imposible el estado inválido"*, además de obligar a revisar todo helper que asuma que
  un perfil activo tiene colegio.

**Recomendación: (a), para la primera versión**, y se declara la limitación en voz alta. El caso de
dos colegios no existe hoy —hay 1 colegio y 1 alumno en producción— y (b) se puede hacer más tarde
sin migrar datos. Va como **P5** en §9.

### 5.7 El quinto rol toca 106 políticas, y 39 no preguntan por el rol

Medido hoy sobre `pg_policy` en `public`: **106 políticas; 39 no mencionan ningún predicado de rol**
(ni `current_role`, ni `is_staff`, ni `is_student`, ni `is_superadmin`, ni `auth.uid`, ni
`current_profile_id`).

La buena noticia: las 39 están todas en 12 tablas de **contenido y currículo** —`subjects`,
`skills`, `courses`, `course_modules`, `lessons`, `lesson_blocks`, `lesson_skills`, `media_assets`,
`questions`, `question_versions`, `exam_blueprints`, `exam_blueprint_sections`—. Ninguna es de datos
de alumno.

Y las escrituras están a salvo: `app.can_write_content()` lista los roles explícitamente
(`superadmin`, `school_admin`, `teacher`, y si no, `false`). Un guardian no escribiría contenido.

**Pero `app.can_read_content()` es ciega al rol**: concede a cualquier perfil activo del colegio. En
el momento en que exista un guardian, **leería todo el currículo y todo el contenido de lección del
colegio** sin que nadie lo haya decidido. Las preguntas no —`questions_select_staff` y
`question_versions_select_staff` exigen `is_staff()`—, así que el banco no se filtra. Aun así:

> **Al introducir `guardian`, `app.can_read_content()` debe pasar a listar roles explícitamente y
> negar al guardian.** Un tutor no necesita el catálogo de lecciones para saber cómo va su hijo, y
> lo que no se necesita no se concede.

Y con ello, un test de familia del estilo de los que mejor han funcionado en este proyecto: **para
cada tabla de `public`, un guardian recién creado no lee ni una fila que no sea de su alumno
vinculado.** Ese test caza el fallo de hoy y todos sus hermanos futuros, incluida la tabla que
alguien añada dentro de seis meses.

---

## 6. El canje

### 6.1 El catálogo lo escribe el tutor, para su hijo

```
reward_catalog_items
  id, school_id, student_id, created_by (guardian), title text, cost int,
  is_active bool, created_at, retired_at
```

**Por alumno, no global.** Cada familia negocia lo suyo: "30 minutos más de tablet" no vale lo
mismo en dos casas y el sistema no tiene ninguna base para decidirlo. El usuario ya lo dijo así
("tiempo de descanso, apoyo en proyecto").

Un ítem retirado **no se borra**: `is_active = false`. Un canje viejo tiene que seguir siendo
legible dentro de un año, igual que `on delete restrict` protege una versión de pregunta que algún
intento usó.

**El texto lo escribe un adulto y lo lee un niño.** Longitud acotada, sin HTML, sin enlaces, sin
imágenes. Y **el `school_admin` puede ver el catálogo** desde el panel: no para aprobarlo, sino
porque un catálogo entre adulto y menor que ninguna institución puede ver es un sitio donde no se
quiere estar. No es censura previa; es que exista una ventana.

### 6.2 El canje, y la promesa que se registra sin mentir

El cumplimiento pasa **fuera de la app**: el padre concede el descanso en casa. El sistema no puede
saber si ocurrió. Diseñar como si pudiera es mentirle al niño, y la mentira se descubre el primer
día que marque "conseguido" algo que nadie le dio.

Cuatro estados:

| Estado | Quién | Qué pasa con el saldo |
|---|---|---|
| `requested` | el alumno | **El delta negativo se inserta YA.** El saldo baja en ese momento |
| `approved` / `rejected` | el tutor | Si rechaza: fila positiva de devolución. **No se borra la negativa** |
| `fulfilled` | **solo el tutor** | Nada. El saldo ya se movió |

**Por qué el saldo baja al pedir y no al cumplirse.** Si bajara al final, un niño con saldo para una
cosa podría pedir cinco y el sistema tendría que decidir cuál falla, y encima decidirlo tarde. Se
reserva al pedir: es lo honesto y es lo simple.

**Cómo se lo cuenta al niño, literalmente.** La pantalla nunca dice "conseguido" por su cuenta.
Dice:

> *"Pediste **30 minutos de descanso**. Papá dijo que sí el martes. Cuando lo hagáis, él lo marca
> aquí."*

Y mientras tanto hay un estado visible **"esperando a que tu tutor lo marque"** con la fecha desde
la que espera. **No se autocompleta jamás**, ni a los 7 días ni a los 30. El niño puede pulsar "ya
lo hicimos", y eso **no cambia el estado**: avisa al tutor. La asimetría es deliberada y es la
pieza honesta del diseño: el sistema registra una promesa entre dos personas y dice que es una
promesa. Si el padre no cumple, el sistema no lo tapa — y esa visibilidad es, probablemente, lo que
hace que se cumpla.

**Quién aprueba si hay dos tutores.** Propuesta: cualquiera de los vinculados, y queda registrado
quién. Va como **P6** en §9.

**El colegio no aprueba canjes.** No es asunto suyo lo que un padre pacte con su hijo.

### 6.3 Doble gasto

Ya está en §3.4: bloqueo de la fila de `reward_accounts`, comprobación del saldo dentro de la misma
transacción, `check (balance_after >= 0)` como segunda barrera, clave de idempotencia por petición
para el doble clic, y el test de concurrencia como criterio de aceptación.

---

## 7. Qué NO se construye

YAGNI, y algunas de estas están además prohibidas por §1.

**Prohibido siempre, no "todavía no":**

- **Tabla de clasificación, ranking, o cualquier comparación entre alumnos.** Ni "vas el 3.º de tu
  clase", ni "la media de tu clase es 7". El coste socioemocional en primaria no lo sabemos
  evaluar, y el spec de color ya lo descartó.
- **Puntos en el examen.** Ninguno, de ninguna clase.
- **Restar puntos.** Nunca. Ni por fallar, ni por faltar, ni por caducidad.
- **Racha diaria que se rompe.** §4.4.
- **Confeti, insignias, animaciones de celebración, sonidos, mascota.** Spec de color §1.2 y §2.4.
- **Canje por dinero, o cualquier cosa con valor económico.** Puntos entre un niño y su tutor y
  nada más.
- **Transferir puntos entre alumnos.** Crea un mercado, y un mercado entre niños crea coacción.

**Fuera de la primera versión, por parsimonia:**

- Catálogo global o "tienda" del sistema. Lo define el tutor.
- Notificaciones por email o push al tutor. Añade proveedor, consentimiento y datos de un menor
  saliendo del sistema. El tutor entra y mira.
- Exportación a PDF del informe. Un PDF es una copia que se reenvía y que nadie audita.
- Recomendación automática de qué estudiar generada por IA. `HANDOFF §4C` la pide; depende de
  `skill_mastery`, que no existe, y es otro encargo. La v1 ordena por mastery y ya.
- App o dominio separado para el tutor. Misma web, otra área de rutas.
- Caducidad de puntos. Es presión artificial y una fuente segura de discusiones. Si el saldo se
  vuelve absurdo, el problema es la calibración.
- Metas personalizadas más allá del objetivo semanal de días.
- Multiplicadores por "temporada", eventos o promociones.

---

## 8. Orden de ejecución y dependencias

**No dupliques al agente B.** Está implementando ahora mismo el progreso visible por grupo. Todo lo
de la Fase 1 se apoya en lo que él deje, no lo reescribe. Antes de tocar una pantalla de progreso,
lee lo suyo.

### Fase 0 — Alguien tiene que escribir `skill_mastery` · **BLOQUEANTE, y no es de este spec**

Sin esto no hay multiplicador por dificultad (§4.3), no hay bono de recuperación (§4.5), no hay
"temas fuertes y débiles" para el tutor (§5.1), y el `MasteryMeter` del alumno sigue vacío para
siempre. Es la dependencia mayor de todo el documento.

Lo mínimo: un reductor con `service_role` que agregue `learning_events` —deduplicando por
`(session_id, seq)`, porque la ingesta no deduplica— sobre `skill_mastery`. Y **antes de eso**,
rellenar `learning_events.skill_id` en el emisor: hoy viene NULL en el 100 % de los eventos de
práctica y el índice `(skill_id, server_ts desc)` no sirve para nada. Rellenarlo en origen es más
barato que resolver `skills.code → id` en cada lectura, para siempre.

### Fase 1 — Esfuerzo visible, sin puntos · **se puede hacer ya**

No necesita guardian, ni ledger, ni Fase 0. Es literalmente "mostrar visualmente cuánto esfuerzo
más": una meta y una barra hacia ella, calculada desde `learning_events` con `server_ts`. Y aquí es
donde hay que **tomar la línea base de §4.6 antes de encender nada más**.

### Fase 2 — El ledger y la acreditación · depende de Fase 0 para calibrar

En este orden, que importa:

1. La función pura `creditSession` en un paquete compartido, con los tres simuladores de §4.6. **La
   calibración se acepta o se rechaza aquí, antes de que exista una sola tabla.**
2. `reward_ledger`, `reward_accounts`, trigger de inmutabilidad, trigger de cadena, y el test de
   concurrencia.
3. El acreditador del servidor, idempotente.
4. La pantalla del niño: saldo, y el porqué de cada punto.

No necesita el rol guardian. El niño acumula puntos y los ve; el canje llega después.

### Fase 3 — El rol `guardian` · **BLOQUEADA por las preguntas de §9**

Enum, `guardian_links`, RLS nueva, matriz de rutas, alta con verificación de email, recuperación de
contraseña, `public.audit_guardian_action`, el endurecimiento de `app.can_read_content()`, el test
de familia de §5.7, y el informe como función única compartida con `/teach` (§5.4).

Es, con diferencia, la fase más cara. Antes de empezarla hay que tener contestadas P1–P6.

### Fase 4 — Catálogo y canje · depende de 2 y 3

### Tareas sueltas que salen de aquí y que convendría no perder

- `practice_item_answered` y `lesson_completed` **no tienen esquema en `eventPayloads`**
  (`packages/shared/src/events.ts`), y el primero es el evento más rico que se emite.
- La dificultad del ítem generado no viaja en el evento de práctica (§2.4).
- Un profesor lee la telemetría de alumnos a los que no da clase; `app.teaches_student()` existe y
  está sin usar (§5.4).

---

## 9. Preguntas al usuario

Decisiones de producto que no me corresponden. Cada una con mi recomendación.

**P1 · ¿El tutor ve el detalle pregunta a pregunta, o solo agregados?**
*Recomiendo: solo agregados, con el acierto por tema en crudo ("fracciones: 4 de cada 10") y en tres
tramos.* Contesta su pregunta —"si está respondiendo correctamente"— sin reproducirle el cuaderno
del niño. El detalle forense se queda con el profesor. **Si contesta que sí quiere el detalle**, hay
que decidirlo con `MASTER_PLAN §9` delante, porque es la decisión de minimización más gorda del
producto.

**P2 · ¿El niño ve lo que ve su tutor?**
*Recomiendo: sí, y la misma pantalla, generada por el mismo código.* No solo por ética: un niño que
sospecha vigilancia sin conocer su alcance cambia su conducta y contamina la telemetría de la que
depende todo lo demás. Es la que menos me gustaría que se decidiera al revés.

**P3 · ¿Quién autoriza la vinculación de un tutor a un alumno?**
*Recomiendo: siempre un `school_admin`, con el mismo flujo que `registration_requests`.* Ni el
alumno (no puede ser la autoridad sobre sus propios datos frente a un adulto), ni el profesor (no
sabe quién es el padre de quién), ni el autoservicio por email (`guardian_email` tiene 0 filas
pobladas).

**P4 · ¿Puede el alumno revocar el acceso de su tutor?**
*Recomiendo: no directamente; puede pedirlo y su petición llega al `school_admin`.* Si pudiera
revocar, el primer suspenso apagaría la supervisión. Pero es una decisión con dos lados —hay
situaciones familiares en las que un niño debería poder cortar— y no me corresponde.

**P5 · Un tutor con hijos en dos colegios, ¿dos cuentas o relajamos la constraint?**
*Recomiendo: dos cuentas en la v1.* La alternativa desmonta `profiles_superadmin_has_no_school`, que
`DATA_MODEL §1` describe como la constraint que hace imposible el estado inválido, y obliga a
revisar todo helper que asuma que un perfil activo tiene colegio. Hoy hay un colegio; el caso no
existe. Se puede cambiar después sin migrar datos.

**P6 · Con dos tutores vinculados, ¿quién aprueba un canje?**
*Recomiendo: cualquiera de los dos, y queda registrado quién.* Exigir los dos bloquea el canje
cuando uno está de viaje, y eso hace que el sistema deje de cumplirse, que es la única forma
verdadera de que fracase.

**P7 · ¿Cuál es el objetivo semanal por defecto y el tope diario de puntos?**
*Recomiendo: objetivo por defecto 4 días, ajustable por el tutor entre 3 y 5; y un tope diario que
un niño alcance en unos 20–25 minutos de estudio honesto.* Los números concretos no los puedo fijar
con lo que hay (§10, H3): salen de los simuladores de §4.6 y de una semana de datos reales de un
niño de verdad.

**P8 · ¿Se lanzan los puntos a la vez que la barra de esfuerzo, o después?**
*Recomiendo: después, y con al menos dos semanas de separación.* Es lo que produce la línea base de
§4.6. Sin línea base no se podrá demostrar nunca si los puntos ayudaron o si desviaron al niño hacia
lo fácil, y esa es la única pregunta que de verdad importa aquí.

---

## 10. HUECOS

Lo que este documento no ha podido determinar. Un hueco declarado vale más que una recomendación
inventada.

**Sobre la pedagogía**

1. **Nada de esto se ha probado con un niño.** Ni el nivel de los puntos, ni si "días activos" se
   entiende mejor que una racha, ni si el estado "esperando a que tu tutor lo marque" produce
   ilusión o frustración. Todas las decisiones de §4 son razonamiento desde principios y desde el
   trabajo del spec de color, no medición.
2. **El riesgo de sobrejustificación queda mitigado, no eliminado.** §1 argumenta que las
   recompensas por esfuerzo dañan menos que las de rendimiento y que un contrato con un adulto es
   distinto de una tienda de insignias. Es un argumento razonable, no una garantía. La comprobación
   real —¿sigue estudiando cuando se retiran los puntos?— tarda meses y no la contesta la
   telemetría. Es el riesgo mayor y hay que asumirlo con los ojos abiertos.
3. **Todos los números de §4 son forma, no calibración.** Los tramos de multiplicador, el mínimo de
   tiempo por ítem, el umbral de rendimientos decrecientes, el tope diario y el bono semanal son
   valores de partida elegidos para que la *forma* de la función sea la correcta. Salen de los
   simuladores y de datos reales, no de este documento.
4. **La literatura de §1 no la he verificado en esta sesión.** El argumento sobre recompensas
   contingentes al rendimiento contra contingentes a la tarea, y el efecto de sobrejustificación,
   los expongo de memoria y en dirección, sin cifras. El spec de color sí hizo el trabajo de
   fuentes para su §2.4; éste no. Si la decisión va a apoyarse en eso, hay que rehacer las fuentes.
5. **No sé qué pasa con un niño que gana muchos puntos y cuyo tutor nunca cumple.** Es un fallo
   humano, no técnico, y el diseño de §6.2 lo hace visible pero no lo resuelve. Puede ser peor que
   no haber tenido puntos.

**Sobre los datos y la técnica**

6. **`skill_mastery` está vacía y nadie la escribe.** Verificado por tres vías (§2.2). Es la
   dependencia mayor del documento y su diseño no está en este spec. Hasta que exista, la
   calibración pierde su defensa principal contra el farmeo.
7. **No hay línea base y todavía no existe.** 45 eventos y 1 alumno en producción. Cualquier
   afirmación futura del tipo "los puntos mejoraron la constancia" es indemostrable si no se toma
   la línea base antes (§4.6, P8).
8. **La duración de una sesión medida con `server_ts` es aproximada.** Los eventos llegan en lotes
   cada 5 s, así que `server_ts` es la hora del lote, no la del evento. Sirve para acotar una sesión
   y para topes, no para medir tiempo por ítem. El tiempo por ítem solo lo dice el cliente.
9. **No sé cuánto se puede farmear dejando la app abierta.** El descuento por `idle` depende de
   detectores del cliente (`idle_start`, `focus_lost`) que un cliente manipulado no emite. La
   defensa real es el tope diario, no la detección. No he cuantificado el hueco.
10. **La deduplicación por `(session_id, seq)` no está probada contra datos reales.** El comentario
    de `/api/events` dice que quien agregue debe deduplicar por ese par. Con 45 eventos no he podido
    comprobar si hay duplicados de verdad ni con qué frecuencia aparecen.
11. **No he medido el coste de las consultas del informe.** Con 1 alumno todo es instantáneo. El
    informe del tutor agrega semanas de `learning_events` por skill sobre una tabla particionada, y
    el `skill_id` viene NULL, así que hoy obligaría a bucear en jsonb. Con 30 niños puede ser otra
    conversación.
12. **No he auditado la matriz de rutas para un quinto rol.** Medí las políticas de base de datos
    (§5.7). `PROTECTED_AREAS` y el middleware no los he revisado, y `HANDOFF §2.5` demuestra que ahí
    es exactamente donde este proyecto se ha hecho daño antes.
13. **No sé si `sections`/`section_members` deberían entrar en el informe del tutor.** Hay 1 sección
    y 1 miembro en producción. Si el colegio organiza por secciones, el tutor podría querer contexto
    de grupo, y eso roza la comparación entre alumnos que §7 prohíbe. No lo he resuelto.
14. **El texto del catálogo lo escribe un adulto y lo lee un menor, y nadie lo modera.** §6.1
    propone que el `school_admin` pueda verlo. No sé si eso es suficiente, y no estoy cualificado
    para decidir qué salvaguarda corresponde aquí.
15. **No he verificado si la ingesta soporta el volumen que este diseño produce.** No añade eventos
    nuevos, pero sí convierte `learning_events` en la fuente de un cálculo con dinero simbólico
    dentro. Una tabla que solo alimentaba analítica pasa a alimentar un saldo, y eso sube el listón
    de lo que significa perder un evento.
