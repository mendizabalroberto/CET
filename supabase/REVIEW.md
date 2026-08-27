# REVIEW — Vía A (esquema, RLS, pgTAP, seed)

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Protocolo de 3 pasadas del MASTER_PLAN §7. Este documento es la **pasada 2**
> (revisión crítica adversarial) y el registro de la **pasada 3** (corrección).
>
> Estado: **20 hallazgos · 20 corregidos**. Ninguno pendiente.
> 7 ambigüedades de `DATA_MODEL.md` resueltas por decisión propia, al final —
> **esas son las que hay que revisar a mano.**

---

## Resumen

| Severidad | Nº | Qué son |
|---|---|---|
| **Crítica** | 6 | Fugas de datos o escaladas de privilegio explotables |
| **Alta** | 7 | Defensas que no defendían: código escrito que no hacía nada |
| **Media** | 5 | Integridad, rendimiento y operativa |
| **Baja** | 2 | Claridad y superficie innecesaria |

Los seis críticos tienen un patrón común y merece la pena nombrarlo: **cinco de
ellos son código que parecía proteger y no protegía**. Un `revoke` sin efecto, un
`status` que nadie consultaba, un trigger que se saltaba con un claim ausente. Es
peor que no tener la defensa, porque nadie vuelve a mirar.

---

## CRÍTICOS

### C-1 · `revoke select (columna)` no retira nada — la clave de respuesta era legible
**Dónde:** `DATA_MODEL.md` §9, propuesto literalmente como la defensa de `answer_key`.

DATA_MODEL prescribe:

```sql
revoke select (answer_key) on attempt_items from authenticated;
```

En Postgres, los privilegios de **tabla** y los de **columna** se llevan por
separado. Si el rol tiene `SELECT` a nivel de tabla —que es justo lo que Supabase
concede por defecto a `authenticated` sobre todo lo que se crea en `public`—, un
`revoke select (columna)` **no le quita absolutamente nada**. La sentencia se
ejecuta sin error y sin efecto. Cualquier alumno habría podido leer
`answer_key` a mitad del examen.

**Corregido** (`0013_grants.sql`): el patrón correcto es retirar el privilegio de
tabla y devolver solo las columnas permitidas.

```sql
revoke select on public.attempt_items from authenticated;
grant  select (id, attempt_id, ord, ..., created_at) on public.attempt_items to authenticated;
```

Aplicado a `attempt_items.answer_key`, `attempt_items.item_seed`,
`question_versions.answer_spec` y `students.pin_hash`. Enumerar las columnas
permitidas en vez de las prohibidas tiene además la propiedad correcta: una
columna sensible nueva nace **no concedida**.

**Verificado por:** `rls_answer_key_hidden.sql` comprueba con
`has_column_privilege()` que el privilegio realmente no está —no con un `SELECT`,
que podría fallar por otra razón y dar un falso positivo.

---

### C-2 · `schools.status = 'suspended'` no hacía nada
**Dónde:** `0004_app_helpers.sql`, todos los helpers.

Los helpers exigían `profiles.status = 'active'` pero **nunca miraban el estado
del colegio**. Consecuencias encadenadas:

1. Suspender un colegio no le quitaba el acceso a nadie: su personal seguía
   viendo alumnos, exámenes, notas y auditoría.
2. `schools_update` permite al `school_admin` editar su colegio, y con un
   `grant update` de tabla eso incluía la columna `status`. Es decir: el
   administrador de un colegio suspendido **podía revertir su propia suspensión**.

El mecanismo de suspensión de colegios, sencillamente, no existía.

**Corregido:**
- Los siete helpers exigen ahora `schools.status = 'active'` además de
  `profiles.status = 'active'` (el superadmin, que no tiene colegio, queda
  exento).
- `0013_grants.sql` concede `UPDATE` sobre `schools` **por columnas**, dejando
  fuera `status` y `slug`. (`slug` fuera además por C-3.)

**Verificado por:** `rls_tenant_isolation.sql` parte E y dos aserciones de
`has_column_privilege` en `constraints.sql`.

---

### C-3 · Secuestro del `slug` de otro colegio
**Dónde:** `0013_grants.sql`, descubierto al corregir C-2.

`schools.slug` es lo que va en la URL de login (`/login/<slug>`). Con `UPDATE` de
tabla, un `school_admin` podía renombrar su colegio a `demo` justo después de que
el colegio real lo liberase, o competir por un slug atractivo. Quien controla el
slug controla la pantalla donde los alumnos de otro colegio teclean su PIN.

**Corregido:** `slug` fuera de la lista de columnas con `UPDATE`. Solo
`service_role`.

---

### C-4 · Escalada de privilegios: la RLS filtra filas, no columnas
**Dónde:** `0012_rls_policies.sql`, política `profiles_update_own`.

`profiles_update_own` permite a cualquiera hacer `UPDATE` de su propia fila —
necesario para que pueda cambiarse el nombre o el idioma. Pero una política RLS
decide **qué filas**, jamás **qué columnas**. Esto habría funcionado desde la
consola del navegador de un niño de 11 años:

```js
supabase.from('profiles').update({ role: 'superadmin', school_id: null }).eq('id', myId)
```

`with check (id = auth.uid())` lo aprueba: la fila resultante sigue siendo suya.

**Corregido:** trigger `app.profiles_guard_escalation()`, que congela `role`,
`school_id`, `status` e `id` salvo para quien tenga derecho a cambiarlos, con la
jerarquía correcta (superadmin todo; school_admin dentro de su colegio y sin
tocar superadmins; el resto nada). Se añadió el trigger gemelo
`app.students_guard_update()` para `pin_hash`, `school_id` y
`failed_pin_attempts`, y `app.exam_attempts_guard_update()` (ver A-6).

**Verificado por:** dos aserciones en `rls_student_cannot_read_peers.sql`
(42501 al intentar el ascenso y el cambio de colegio).

---

### C-5 · Los triggers de guarda se saltaban con un JWT sin `sub`
**Dónde:** `0012_rls_policies.sql`, introducido al escribir C-4.

La primera versión de los guards abría la puerta así:

```sql
if auth.uid() is null then return new; end if;   -- "es el backend"
```

`auth.uid()` es NULL en dos situaciones muy distintas: cuando la petición viene de
`service_role` (correcto) **y cuando viene un JWT con `role: authenticated` pero
sin el claim `sub`**. En el segundo caso el guard entero se desactivaba, y con él
toda la defensa de C-4.

**Corregido:** la condición de bypass es ahora `current_user <> 'authenticated'`.
Lo que abre la puerta es el rol de Postgres desde el que se ejecuta, que no
depende del contenido del JWT. Aplicado a los tres guards.

---

### C-6 · La vista de la clave habría saltado la RLS por completo
**Dónde:** `0009_attempts.sql`, vista `attempt_items_student`.

Una vista se ejecuta por defecto con los privilegios de **su propietario**. Como
`attempt_items_student` la crea `postgres`, sin más ajuste la vista habría leído
`attempt_items` **saltándose la RLS**, y un alumno habría visto los items de todos
los exámenes del sistema — precisamente por la vista creada para protegerlo.

**Corregido:** `with (security_invoker = true, security_barrier = true)`.
`security_invoker` aplica las políticas de quien consulta; `security_barrier`
impide que el planificador empuje una función del usuario por debajo de los
filtros de la vista para inferir las columnas ocultas.

**Verificado por:** `rls_student_cannot_read_peers.sql` comprueba que s1a **no**
ve los items de s2a *a través de la vista*.

---

## ALTOS

### A-1 · `item_seed` regalaba la respuesta correcta
DATA_MODEL §9 solo manda ocultar `answer_key`. Pero `@cet/engine` es código de
**cliente** y su invariante central es el determinismo: `generate(engineKey,
params, seed)` devuelve siempre lo mismo. Con `item_seed` y el `engine_key` (que
viaja en `rendered_body`), un alumno regenera el item **completo, incluida su
clave**. Ocultar `answer_key` y publicar la semilla es teatro de seguridad.

**Corregido:** `item_seed` fuera del `grant select` de `attempt_items` y fuera de
la vista `attempt_items_student`. **Verificado** en `rls_answer_key_hidden.sql`.

---

### A-2 · `force row level security` habría roto los helpers
Primer intento: FORCE en todas las tablas, por rigor. Es un error. Los helpers son
`security definer` propiedad de `postgres` y **leen `public.profiles`**; con
FORCE, `app.current_school_id()` queda sujeta a las políticas de `profiles`, que a
su vez la llaman. Resultado: recursión, o —peor— un helper que devuelve NULL en
silencio y convierte cada política en "no ves nada" (y cualquiera escrita con
`NOT`, en "lo ves todo").

**Corregido:** FORCE retirado de todas las tablas, con el razonamiento escrito en
`0003_tenancy.sql` para que nadie lo "arregle" en seis meses. FORCE no habría
protegido de `postgres` ni de `service_role`, que son la administración.

---

### A-3 · Política recursiva en `section_members`
`section_members_select` necesitaba preguntar "¿el solicitante está en esta misma
clase?". Escrito como `exists (select 1 from section_members me where ...)`
**dentro de la política de `section_members`**, Postgres aplica las políticas de la
tabla a `me` y aborta con *infinite recursion detected in policy for relation
section_members*. No es una fuga: es la tabla inutilizable.

**Corregido:** helper `app.is_member_of_section()`, `security definer`, que lee la
tabla sin pasar por sus propias políticas.

---

### A-4 · Fuga de tenant por escritura en `questions` y `exam_blueprints`
Las políticas de INSERT solo comprobaban el `school_id` de la **propia fila**. Un
profesor del colegio A podía crear una pregunta con `school_id = A` (que pasa la
política) pero con `course_id` y `skill_id` apuntando al **currículo privado del
colegio B**. No le daba lectura de nada de B, pero envenenaba su taxonomía: las
estadísticas de mastery de una skill de B pasarían a incluir preguntas ajenas.

Una FK garantiza que la fila referenciada **existe**, nunca que sea del mismo
colegio.

**Corregido:** triggers `app.validate_question_tenant()` (0007) y
`app.validate_blueprint_tenant()` (0008). El primero comprueba además que la
skill sea del **mismo curso** que la pregunta: una pregunta de Math etiquetada con
una skill de Science hace que el modelo de mastery mienta.

**Verificado por:** tres aserciones nuevas en `constraints.sql`.

---

### A-5 · `grant insert on students` dejaba escribir `pin_hash` a mano
El `INSERT` es necesariamente de tabla completa (no existe un "INSERT por
columnas" que sirva, porque `pin_hash` es `NOT NULL`), así que concederlo dejaba a
un `school_admin` escribir directamente el `pin_hash` que quisiera, saltándose el
generador de PIN aleatorio. El `CHECK` de Argon2id no lo impide: quien quiera
puede calcular el hash Argon2id de un PIN conocido.

**Corregido:** sin `grant insert on students`. El alta de alumno pasa entera por
la Server Action con `service_role` —que es donde ya estaba documentada— y que
además es la única que puede crear el `auth.users` previo. La política
`students_insert_admin` se conserva como segunda capa.

---

### A-6 · Un profesor podía reasignar el intento de un alumno a otro
`exam_attempts_update_staff` permite al profesor tocar los intentos de su colegio
(anular, cerrar a mano, ampliar tiempo por adaptación curricular). Legítimo. Pero
por el mismo motivo que C-4, ese `UPDATE` le permitía **reasignar el intento a
otro alumno** o cambiar `seed` y `blueprint_snapshot`: destruir la reconstrucción
forense disfrazándolo de corrección administrativa.

**Corregido:** `app.exam_attempts_guard_update()` congela `assignment_id`,
`student_id`, `school_id`, `attempt_number`, `seed`, `blueprint_snapshot` y
`started_at`. Sigue siendo modificable lo administrativo: estado, entrega,
calificación y deadline.

---

### A-7 · Cualquier alumno podía envenenar el `audit_log`
`app.audit()` es `security definer` y tenía `grant execute ... to authenticated`
sin más comprobación. Un alumno podía llamarla en bucle y llenar la tabla de
auditoría de su colegio con entradas fabricadas. No le daba acceso a nada, pero
inutilizaba la única prueba de lo que hace el personal. Meter ruido en un log
forense es un ataque, no una travesura.

**Corregido:** `app.audit()` exige `app.is_staff() or app.is_superadmin()` cuando
la llama el rol de aplicación.

---

## MEDIOS

### M-1 · `CHECK` con subconsulta: la migración no habría arrancado
La validación de `attempt_items.option_order` ("es una permutación sin repetidos
ni huecos") se escribió inline con `select count(distinct ...) from unnest(...)`.
**Un `CHECK` no admite subconsultas** y Postgres rechaza la sentencia: la
migración 0009 no se habría aplicado.

**Corregido:** función `app.is_permutation(integer[])`, `immutable`, en 0001.

### M-2 · Los triggers append-only hacían imborrables a colegios y alumnos
`learning_events`, `audit_log` y `auth_attempts` bloqueaban `UPDATE` **y**
`DELETE` para todos los roles. Efectos no previstos:

- `learning_events.student_id → profiles ON DELETE CASCADE`: borrar a un alumno
  fallaba. Un derecho de supresión (RGPD, datos de menores) era **inejecutable**.
- `auth_attempts.school_id → schools ON DELETE CASCADE`: dar de baja un colegio
  fallaba.
- `audit_log.school_id → schools ON DELETE SET NULL`: la cascada intenta un
  `UPDATE` sobre `audit_log`... que el propio trigger bloquea.

"Append-only" no puede significar "los datos de un menor son eternos".

**Corregido:** los tres triggers bloquean **solo `UPDATE`** (falsear un registro
sigue siendo imposible para todos los roles). El `DELETE` desde el cliente sigue
siendo imposible por ausencia de GRANT y de política. Además, `audit_log` pierde
sus FK: un registro de auditoría es un hecho que sobrevive al actor y al tenant, y
un `on delete cascade` habría borrado la prueba de lo que hizo el investigado.
**Verificado:** `immutability.sql` comprueba que borrar un perfil de alumno
arrastra su telemetría por cascada.

### M-3 · Índice `UNIQUE` de deduplicación que no deduplicaba
Sobre `learning_events` se había escrito `unique (session_id, seq, server_ts)`
para deduplicar reintentos de la ingesta. En una tabla particionada todo índice
único **debe** incluir la clave de partición, y con `server_ts` dentro el índice
no impide nada: el reintento trae un `server_ts` distinto y pasa tan campante. Un
índice que aparenta garantizar algo es peor que ninguno.

**Corregido:** índice no único `(session_id, seq)` y la deduplicación
explícitamente documentada como responsabilidad del ingestor
(`insert ... where not exists`), que ahora es un lookup y no un scan.

### M-4 · GRANTs sobre las particiones abrían una segunda puerta
Cada partición de `learning_events` recibía `grant select ... to authenticated`.
Es innecesario —consultar por la tabla padre comprueba los privilegios del
**padre**— y crea una vía de acceso directo (`select from
learning_events_2026_08`) que se rige por la RLS de la partición.

**Corregido:** a las particiones se les retira todo y no se les concede nada a los
roles de aplicación, tanto en `0013_grants.sql` como en
`app.create_learning_events_partition()`. La RLS se sigue habilitando en cada
partición: fail-closed en las dos capas.

### M-5 · `identity` sobre tabla particionada exige Postgres 17
`learning_events.id` como `bigint generated always as identity` solo funciona a
partir de PG17. MASTER_PLAN fija PG17, pero una rama de Supabase o un runner de CI
en 15/16 habría fallado al aplicar la migración.

**Corregido:** secuencia explícita (`create sequence` + `default nextval` +
`owned by`). Comportamiento idéntico, funciona en 15/16/17, coste cero.

---

## BAJOS

### B-1 · Política con nombre engañoso
`students_all_superadmin` sugería cubrir todos los comandos y solo cubría
`UPDATE`. Un nombre que promete de más es una trampa para quien audite el fichero
de un vistazo. **Corregido:** renombrada a `students_update_superadmin` y añadida
`students_insert_superadmin`.

### B-2 · `CASE` sin rama `ELSE` en el validador de bloques
`app.validate_lesson_block_content()` cubría los 11 miembros de `block_kind`. Al
añadirse un miembro nuevo, plpgsql lanzaría `CASE_NOT_FOUND` con un mensaje
incomprensible — o, si alguien "arreglaba" el error con un `else null`, el kind
nuevo entraría **sin validar**. **Corregido:** rama `ELSE` que lanza una excepción
explícita nombrando el kind sin validador. Fail-closed.

---

## Comprobaciones que se hicieron y salieron limpias

No todo lo que se revisa está roto; dejarlo escrito evita revisarlo dos veces.

- **RLS en el 100 % de las tablas.** Verificado por un `DO $$` que hace **fallar la
  migración** (`0013_grants.sql`) y repetido como aserción en `constraints.sql`.
  Incluye las tablas de auditoría y las particiones.
- **`search_path` en todas las funciones.** Las 41 funciones del proyecto lo
  fijan, sean `security definer` o no. Verificado en migración y en pgTAP.
- **`on delete` explícito en todas las FK.** Ninguna se deja al default.
- **`to authenticated` en las 104 políticas.** Sin `to`, una política aplica a
  `PUBLIC`, que incluye `anon`.
- **`with check` en todas las políticas de escritura.** Sin él, un profesor coge
  una fila de su colegio y le reescribe el `school_id` al de al lado.
- **`(select ...)` alrededor de cada llamada a helper.** Convierte la función en
  un InitPlan evaluado una vez por sentencia en lugar de una vez por fila.
- **`anon` sin ningún GRANT.** Lo que la pantalla de login necesita antes de
  autenticar lo sirve una Route Handler con `service_role`.
- **Los enums coinciden con `@cet/shared`** miembro a miembro y en orden.
  Verificado con `enum_has_labels` y con el recuento de los 31 miembros de
  `learning_event_type`.
- **Índices razonados uno a uno**, con el porqué en un comentario SQL junto a cada
  uno. Se rechazaron dos por decorativos: un `(lesson_id)` sobre `lesson_blocks`
  (el `unique (lesson_id, ord)` ya lo sirve como prefijo izquierdo) y un
  `(question_id, version)` extra sobre `question_versions` (el UNIQUE ya sirve
  también "dame la última" con `ORDER BY DESC LIMIT 1`).

---

## Ambigüedades de `DATA_MODEL.md` — decisiones tomadas, PENDIENTES DE TU REVISIÓN

Estas siete no son fallos: son puntos donde el contrato no decidía y hubo que
decidir. Son las que conviene que mires.

### D-1 · `courses.status`: el contrato se contradice
DATA_MODEL §2 describe el estado de un curso como `draft`/`published`/`archived`.
`packages/shared/src/enums.ts` define `contentStatus` como
`draft`/`in_review`/`published`/`retired`, y no hay ningún otro enum de estado.

**Decisión:** gana `@cet/shared` (es el contrato citado como autoridad en el
encargo) y se usa **el mismo tipo** `content_status` en cursos, lecciones,
preguntas y blueprints. `retired` cumple el papel de `archived`.
**Si prefieres `archived`, hay que cambiar `enums.ts` y avisar a las cinco vías.**

### D-2 · `submitted_by` tiene 3 valores en §6 y 4 en `enums.ts`
DATA_MODEL §6 dice `student`/`timer`/`teacher`. `enums.ts` añade `system`.
**Decisión:** los 4 de `enums.ts`. `system` cubre el cierre por un job de
mantenimiento, que es un caso real distinto de `timer`.

### D-3 · Dos tipos sin nombre en el contrato
- `attempt_gradings.graded_by` (`auto`/`manual`) → tipo `public.grading_actor`,
  para no colisionar con el nombre de la columna.
- `section_members.role_in_section` → tipo `public.section_role` con
  `student`/`teacher`/**`assistant`**. El tercero cubre al profesor de apoyo, que
  necesita ver la clase pero no calificar.

Ninguno de los dos existe en `@cet/shared`. **Habría que añadirlos** para que el
cliente tipado los conozca.

### D-4 · La clave de corrección para el PROFESOR
DATA_MODEL manda ocultar `answer_key` y `answer_spec` "al rol `authenticated` de
un alumno". Pero los GRANT de Postgres son por **rol**, y alumno y profesor
comparten el rol `authenticated`: no hay forma de distinguirlos con un GRANT.

**Decisión:** se retira la columna a `authenticated` (los dos) y se abre un camino
tasado para el staff: `app.question_version_answer_spec(uuid)` y
`app.attempt_item_answer_key(uuid)`, `security definer`, que comprueban rol **y**
tenant y devuelven **una fila cada vez** — nunca un `select *` sobre el banco.
Efecto lateral positivo: el acceso del profesor a una clave pasa a ser un evento
puntual y auditable en lugar de una lectura de tabla.

### D-5 · Constraint opinionada que DATA_MODEL no pide
Se añadió a `exam_blueprints`:

```sql
check (feedback_mode <> 'immediate' or allow_back = false)
```

Razón: `immediate` + volver atrás permite al alumno probar opciones hasta acertar
y regresar. No es feedback, es la respuesta regalada. **Es una decisión pedagógica
mía, no del contrato — dime si la quieres fuera.**

### D-6 · `learning_events.login_failed` de un código inexistente no se registra
`learning_events.student_id` es `NOT NULL`, así que un `login_failed` contra un
código que no existe no tiene a quién colgarse. Ese caso vive **solo** en
`auth_attempts`, que es la tabla diseñada precisamente para códigos inexistentes.
La alternativa —hacer `student_id` nullable— debilitaría todas las políticas RLS
de telemetría. **Decisión: no se hace nullable.**

### D-7 · Partición `DEFAULT` en `learning_events`: un compromiso
Sin partición `DEFAULT`, un `INSERT` fuera de todo rango **falla**, y se pierde
telemetría (o se cae la Route Handler de ingesta a mitad de una clase). Con
`DEFAULT`, la fila se guarda, pero crear después la partición de ese mes exige
mover primero las filas del default.

**Decisión:** hay `DEFAULT`. Perder datos es peor que una migración manual, y
`app.ensure_learning_events_partitions()` —pensada para un `pg_cron` diario, con
12 meses creados por adelantado— mantiene el default vacío en régimen normal.
**Falta programar ese cron: es trabajo de M13 `deployment`.**

---

## Pendiente fuera del alcance de esta vía

- **`pg_cron`** que llame a `app.ensure_learning_events_partitions(3)` a diario.
  Sin él, el sistema aguanta 12 meses y luego empieza a llenar el default. → M13.
- **Política de retención** de `learning_events` (`DROP` de particiones antiguas).
  → M13.
- **`app.teaches_student()`** existe pero no la usa ninguna política: hoy
  cualquier profesor ve a cualquier alumno de su colegio. Es lo que un colegio
  pequeño espera; uno grande querrá restringirlo. Está escrita para que ese
  endurecimiento sea un cambio de política y no de esquema. → M04.
- **`school_courses` no se aplica en la RLS.** Un curso global activado o no
  activado se **ve** igual; la activación filtra a nivel de aplicación, como
  describe DATA_MODEL §2 ("visibilidad ≠ activación"). Si se quiere que también
  sea invisible, es una política más. → M05.
- **Validación fina de `jsonb` con JSON Schema.** Postgres no lo trae; aquí se
  valida la **estructura** de cada variante (discriminante presente, claves
  obligatorias, coherencia de anchuras). La validación fina (longitudes, allowlist
  de HTML) la hace Zod en `@cet/shared`. Si se quiere JSON Schema en la DB hay que
  añadir `pg_jsonschema`. → decisión tuya.

---

# PASADA 4 — la primera ejecución real de pgTAP (2026-08-27)

> Las 6 suites de `supabase/tests/` **nunca se habían ejecutado**. El plan de
> verificación lo señalaba como el mayor hueco de cobertura del proyecto y tenía
> razón: al ejecutarlas por fin salieron dos fallos que llevaban meses en el
> esquema, uno de ellos explotable en producción.
>
> Estado: **178 tests · `Result: PASS`** (`DB #7`, commit `5275ea4`).

## Por qué no se ejecutaban

`db.yml` moría en la primera migración y los pasos de RLS y pgTAP ni se
alcanzaban. Un job registrado, en rojo, que nadie miraba: la sensación de estar
cubierto sin estarlo. Faltaban tres cosas que Supabase da hechas y un
`postgres:17` desnudo no: el esquema `extensions`, los roles `anon` /
`authenticated` / `service_role`, y el esquema `auth` con `users` y `uid()`.

Detalle que conviene recordar: el paso de CI creaba `pgcrypto` y `citext` sin
esquema, o sea en `public`, y **parecía funcionar**. `create extension if not
exists ... with schema extensions` NO mueve una extensión que ya existe, ni
avisa: dice "skipping". La tercera, `pg_trgm`, fue la primera que no existía
todavía y destapó todo.

## Hallazgo A — CRÍTICO · los cuatro guards eran inertes (0022)

Cuatro funciones `security definer` decidían con `current_user <> 'authenticated'`.
Dentro de una `SECURITY DEFINER`, `current_user` es el **propietario**. Medido
contra producción:

```
DEFINER  -> current_user=postgres        role=authenticated
INVOKER  -> current_user=authenticated   role=authenticated
```

Vale siempre `postgres`, la condición se cumple siempre, y los cuatro guards
salían por la primera línea sin comprobar nada. Reproducido con el JWT de un
alumno real (dentro de un bloque que termina lanzando excepción, así que se
revirtió):

```
update public.profiles set status = 'suspended' where id = <el mismo>;
-> 1 fila. Sin error.
```

| Guard | Lo que no impedía |
|---|---|
| `profiles_guard_escalation` | cambiarse rol, colegio o estado |
| `students_guard_update` | reescribir `pin_hash`, anular el lockout del PIN |
| `exam_attempts_guard_update` | reescribir `seed` y `blueprint_snapshot` |
| `audit` | que un no-staff escribiera en el `audit_log` |

Lo único que frenaba la escalada a superadmin era, por casualidad, la constraint
`profiles_staff_needs_email`. Un profesor —que sí tiene email— habría pasado.

**Cómo llegó ahí:** el comentario del propio trigger presume del cambio. Se
comprobaba con `auth.uid() is null` y se pasó a `current_user` "corregido en la
pasada 2" para tapar el caso del JWT sin claim `sub`. La corrección era razonable
en intención y desactivó la defensa entera. Es exactamente el patrón que ya
nombra el resumen de arriba: **código que parecía proteger y no protegía**.

**Corregido:** la regla vive en `app.is_app_user()`, que lee el GUC `role` — lo
que PostgREST fija con `SET LOCAL ROLE` y lo único que sobrevive intacto dentro
de un `SECURITY DEFINER`. Se descartó `session_user`: bajo PostgREST vale
`authenticator`, no `authenticated`.

Verificado contra producción tras aplicar: `status=42501 rol=42501 colegio=42501
audit=42501`.

## Hallazgo B — ALTO · una CHECK con un regex que no compila (0021)

`media_assets_storage_path_shape` pedía `{0,511}`. El motor de regex de Postgres
limita las repeticiones de un bound a **255**:

```
select 'alfa/shape.png' ~ '^[A-Za-z0-9][A-Za-z0-9/._-]{0,511}$';
ERROR: 2201B: invalid regular expression: invalid repetition count(s)
```

`ADD CHECK` no compila el patrón si la tabla está vacía, y `media_assets` tiene 0
filas: la constraint llevaba meses con aspecto correcto y habría estallado en el
primer insert de contenido con imágenes — como error de expresión regular, que
manda a depurar el sitio equivocado.

## Hallazgo C — deriva de esquema (0020)

`app.sync_role_claims()` y su trigger existían en producción pero en ninguna
migración. Quien reconstruyera la base desde `supabase/migrations/` obtendría un
sistema donde ningún JWT lleva `cet_role` y la matriz de roles del middleware
queda inerte sin que nada falle.

## Tres invariantes nuevos, que es lo que de verdad queda

Los tests concretos cubren estos tres casos. Los invariantes cubren la familia:

- ninguna CHECK de `public`/`app` usa un bound de regex por encima de 255
- ninguna función `security definer` decide con `current_user`
- (ya existían) ninguna tabla sin RLS, ninguna `security definer` sin `search_path`

## Riesgos aceptados / abiertos

- **El audit del superadmin es invisible.** `app.audit()` escribe
  `school_id = app.current_school_id()`, que para un superadmin es NULL, y el
  visor filtra por `school_id`. Sus acciones sobre datos de un colegio quedan
  registradas pero **no aparecen en el log de ese colegio**. Sin corregir.
- **Los seeds no se ejecutan en CI**, a propósito: atan filas de `public` a
  cuentas que ya existen en GoTrue. Se verifican contra un proyecto con Auth de
  verdad, no aquí.
- **`window.confirm` en el panel.** "Regenerar PIN" y "Desbloquear" son las dos
  acciones destructivas del panel y ningún e2e puede cubrirlas: el diálogo nativo
  bloquea toda automatización.
- **Leaked password protection desactivada** en Supabase Auth (WARN del linter).
