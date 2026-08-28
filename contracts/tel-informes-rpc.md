---
id: tel-informes-rpc
model: reasoner
territory: [supabase/migrations/0053_informes_alumno.sql, supabase/tests/informes_alumno.sql, modules/analytics/CLAUDE.md]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, supabase/migrations/0010_telemetry.sql, supabase/migrations/0012_rls_policies.sql]
context: [supabase/migrations/0010_telemetry.sql, supabase/migrations/0004_app_helpers.sql, supabase/migrations/0012_rls_policies.sql, packages/shared/src/events.ts, supabase/migrations/0051_interaccion_de_interfaz.sql]
verify: node scripts/deepseek/validar-sql.mjs supabase/migrations/0053_informes_alumno.sql supabase/tests/informes_alumno.sql app.informe_alumno_resumen,app.informe_alumno_skills,app.informe_alumno_secuencia,app.informe_alumno_habitos,app.informe_alumno_botones
rounds: 4
deadline: 4 rondas o 30 minutos
---

## 1 · El problema

`learning_events` recibe decenas de eventos por minuto y por alumno, y **no hay
una sola consulta que los lea**. `modules/analytics/` contiene un unico fichero,
`CLAUDE.md`, y ninguna vista ni funcion. El panel del administrador y el futuro
informe para el apoderado no tienen nada que consumir.

Hacen falta cinco funciones de informe, en `app`, con el aislamiento entre
colegios dentro.

## 2 · La evidencia que ya tenemos

Los ayudantes de tenancy existen desde `0004_app_helpers.sql` y son los que hay
que usar; no inventes otros:

- `app.current_school_id()` — el colegio de la sesion, `null` para superadmin.
- `app.current_role()` — `superadmin | school_admin | teacher | student`.

`learning_events` esta particionada por RANGE mensual sobre `server_ts` y tiene
estos indices, que son los que deben usar las consultas:

```
create index learning_events_student_ts_idx  on ... (student_id, server_ts desc);
create index learning_events_school_type_ts_idx on ... (school_id, event_type, server_ts desc);
create index learning_events_session_seq_idx on ... (session_id, seq);
create index learning_events_ui_control_idx  on ... ((payload ->> 'control')) where payload ? 'control';
```

Los tipos de evento disponibles estan en `packages/shared/src/events.ts` (34
miembros). Los tres de interfaz son nuevos, de `0051`:

- `session_context` — `{ viewportW, viewportH, dpr, pointer, modality, theme, locale, timezone, reducedMotion, connection }`, una vez por sesion, `seq` 0.
- `ui_interaction` — `{ control, surface, action, value?, ordinal, sinceLastMs, modality }`.
- `nav_route_changed` — `{ from, to, dwellMs }`.

Y los que ya se emitian: `answer_submitted` `{ timeOnItemMs, changeCount,
hintsUsed, isCorrect? }`, `hint_requested` `{ hintIndex, timeBeforeHintMs }`,
`idle_end` `{ idleMs }`, `focus_gained` `{ awayMs }`, `lesson_block_viewed`
`{ blockId, kind, dwellMs }`, `practice_streak` `{ streak }`.

`session_context.timezone` es IANA (`America/Santiago`). **Los habitos por hora
se calculan en la hora del ALUMNO**, no en UTC: un informe que diga «estudia a
las 3 de la madrugada» porque nadie convirtio el huso es peor que no tener
informe.

## 3 · El criterio de aceptacion

`supabase/migrations/0053_informes_alumno.sql` declara cinco funciones, todas
`security definer`, todas con `set search_path = ''`, todas con `revoke all ...
from public` y `grant execute ... to authenticated`, y **todas con la misma
guarda de autorizacion en la primera linea del cuerpo**:

> el llamante debe ser `superadmin`, o bien (`school_admin`/`teacher`) del MISMO
> colegio que el alumno pedido; si no, `raise exception` con
> `errcode = 'insufficient_privilege'`. Un `student` no llama a estas funciones.

Escribe esa guarda UNA vez, en `app.puede_ver_informe(p_student_id uuid)`, y
llamala desde las cinco. Cinco copias de la misma comprobacion son cinco sitios
donde se puede olvidar una.

Las cinco, con `p_student_id uuid, p_desde timestamptz, p_hasta timestamptz`
(salvo la tercera):

1. **`app.informe_alumno_resumen`** — una fila: minutos de estudio (suma de
   ventanas de actividad descontando `idle_end.idleMs` y `focus_gained.awayMs`),
   numero de sesiones distintas, lecciones abiertas y completadas, items
   respondidos, porcentaje de acierto, examenes entregados, pistas pedidas,
   racha maxima.
2. **`app.informe_alumno_skills`** — una fila por skill desde `skill_mastery`,
   con el nombre de la skill, ordenadas por `mastery` ascendente. La mas floja
   primero: es la que el profesor necesita ver.
3. **`app.informe_alumno_secuencia(p_session_id uuid)`** — la secuencia literal
   de una sesion, ordenada por `seq`, con `event_type`, `payload`, `server_ts` y
   los milisegundos transcurridos desde el evento anterior. Es la
   reconstruccion forense de lo que hizo el alumno, paso a paso.
4. **`app.informe_alumno_habitos`** — distribucion por hora del dia y dia de la
   semana EN LA ZONA HORARIA DEL ALUMNO (la del ultimo `session_context`, con
   `UTC` como respaldo si no hay ninguno), tiempo medio por item, tasa de idle,
   tasa de `focus_lost` por hora de estudio, media de `changeCount` (cuanto
   cambia de opinion antes de fijar) y proporcion de items en los que pidio
   pista antes de responder.
5. **`app.informe_alumno_botones`** — los controles mas pulsados
   (`payload->>'control'` de `ui_interaction`) con su cuenta y el
   `sinceLastMs` mediano, mas las transiciones de pantalla mas frecuentes
   (`nav_route_changed`, pares `from -> to`) con su `dwellMs` mediano.

Todas devuelven `table(...)`, nunca `json`: un `table` lo tipa PostgREST solo y
el front-end lo recibe tipado.

Reescribe `modules/analytics/CLAUDE.md` documentando las cinco: firma,
que devuelve cada columna, y quien puede llamarlas.

`supabase/tests/informes_alumno.sql` es pgTAP (`begin; select plan(N); ...
select finish(); rollback;`) y debe:

- sembrar una sesion sintetica completa de un alumno del colegio A: un
  `session_context`, varios `ui_interaction` con `ordinal` correlativo, un
  `nav_route_changed`, dos `answer_submitted` (uno correcto, uno no), un
  `hint_requested` y un `idle_end`;
- sembrar ademas un alumno del colegio B;
- llamar a las CINCO funciones y comprobar valores concretos con `is(...)`, no
  solo que devuelven filas;
- comprobar que la secuencia sale en orden de `seq` y no de `server_ts`;
- comprobar que un `teacher` del colegio B recibe `insufficient_privilege` al
  pedir el informe del alumno del colegio A (`throws_ok`).

**`plan(N)` debe cuadrar exactamente con el numero de asserts.**

## 4 · Que NO cuenta como resuelto

- Una funcion sin la guarda de `app.puede_ver_informe`. Una consulta
  `security definer` sin guarda es una fuga: se salta la RLS por definicion.
- Comprobar el aislamiento con un `is_empty` en vez de un `throws_ok`. Devolver
  cero filas y denegar son cosas distintas: la primera dice «este alumno no ha
  hecho nada», la segunda «no es asunto tuyo».
- Habitos por hora calculados en UTC.
- `plan(N)` que no cuadra con los asserts.
- Cualquier `grant` que alcance a `anon`.
- Consultar `learning_events` sin filtro por `server_ts`: leeria las trece
  particiones.
- Tocar `0012_rls_policies.sql`. Esta en `forbidden`: la autorizacion de estas
  funciones va DENTRO de ellas, porque `security definer` se salta la RLS y por
  eso mismo tiene que traer la suya.
