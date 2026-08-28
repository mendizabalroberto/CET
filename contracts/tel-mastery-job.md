---
id: tel-mastery-job
model: reasoner
territory: [supabase/migrations/0052_mastery_job.sql, supabase/tests/mastery_job.sql]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, supabase/migrations/0010_telemetry.sql]
context: [supabase/migrations/0010_telemetry.sql, supabase/migrations/0009_attempts.sql, packages/shared/src/events.ts, supabase/tests/constraints.sql]
verify: node scripts/deepseek/validar-sql.mjs supabase/migrations/0052_mastery_job.sql supabase/tests/mastery_job.sql app.rebuild_skill_mastery,app.skill_mastery_watermark
rounds: 4
deadline: 4 rondas o 25 minutos
---

## 1 · El problema

`public.skill_mastery` existe desde `0010_telemetry.sql` —tabla, cinco
constraints, dos indices, RLS, trigger de `updated_at`— y **no la escribe
nadie**. Ni una funcion, ni un trigger, ni un job. La interfaz ya la lee
(`packages/ui/src/data/MasteryMeter.tsx` y
`apps/web/src/components/learn/queries.ts`) y pinta ceros para todos los
alumnos.

Hay que escribir el job que la rellena a partir de `public.learning_events`,
que es la fuente de verdad.

## 2 · La evidencia que ya tenemos

`0010_telemetry.sql` describe la tabla como una CACHE reconstruible, literal:

```
-- Derivado de learning_events y de attempt_gradings por job. Es una CACHÉ
-- reconstruible: si se corrompe, se recalcula desde los eventos, que son la
-- fuente de verdad.
```

Las columnas a rellenar, con sus constraints ya escritas:

```
  mastery           numeric(4,3) not null default 0,   -- 0..1
  confidence        numeric(4,3) not null default 0,   -- 0..1
  attempts_count    integer not null default 0,
  correct_count     integer not null default 0,
  ewma_correct      numeric(4,3) not null default 0,
  avg_time_ms       integer,
  hints_used        integer not null default 0,
  last_practiced_at timestamptz,
```

y las que hacen fallar el insert si el calculo esta mal:

```
  constraint skill_mastery_correct_lte_attempts check (correct_count <= attempts_count),
  constraint skill_mastery_mastery_range check (mastery >= 0 and mastery <= 1),
  constraint skill_mastery_ewma_range check (ewma_correct >= 0 and ewma_correct <= 1),
```

Los eventos de los que sale todo, con su payload segun
`packages/shared/src/events.ts`:

- `answer_submitted` — `{ timeOnItemMs, changeCount, hintsUsed, isCorrect? }`
- `practice_item_answered`
- `hint_requested` — `{ hintIndex, timeBeforeHintMs }`

**`isCorrect` es opcional a proposito**: el contrato dice «solo en practica; en
examen lo decide el servidor». Un evento sin `isCorrect` NO cuenta como fallo:
cuenta como no clasificable y se queda fuera de `attempts_count`. Contarlo como
fallo hundiria la mastery de todo alumno que hace examenes.

La columna `learning_events.skill_id` se rellena desde la ruta de ingesta
(contrato 3.5, ya aplicado). Las filas ANTERIORES a ese arreglo la tienen NULL y
llevan el codigo en `payload->>'skillCode'`. El job debe resolver por
`skill_id` cuando esta, y por `payload->>'skillCode'` contra `public.skills.code`
cuando no. **La columna de codigo de `public.skills` se llama `code`, a secas.**

La tabla esta particionada por `server_ts` y esa es la clave de poda:
toda consulta del job debe filtrar por `server_ts`, o leera las 13 particiones.

## 3 · El criterio de aceptacion

`supabase/migrations/0052_mastery_job.sql` declara:

1. **`app.skill_mastery_watermark`** — una tabla de UNA fila, o una funcion
   sobre una tabla de marcas de agua, que guarda hasta que `server_ts` se ha
   procesado. El nombre `app.skill_mastery_watermark` debe aparecer como
   `create function` (si eliges tabla, anade ademas una funcion con ese nombre
   que devuelva la marca actual).
2. **`app.rebuild_skill_mastery(p_desde timestamptz default null)`** — recorre
   los eventos con `server_ts > coalesce(p_desde, marca)` y hace `insert ... on
   conflict (student_id, skill_id) do update` sobre `skill_mastery`. Con
   `p_desde => '-infinity'` reconstruye desde cero y el resultado debe ser
   IDENTICO a haberla ido actualizando incrementalmente. Devuelve el numero de
   filas tocadas.
3. **EWMA con alfa 0.3**, aplicada en orden de `server_ts` ascendente.
   `mastery` sale de `ewma_correct`; `confidence` crece con `attempts_count` y
   satura (una funcion acotada a 1, por ejemplo `1 - exp(-attempts/10)`).
4. Las dos funciones `security definer`, con `set search_path = ''`, con
   `revoke all ... from public` y `grant execute ... to service_role`. **Ningun
   grant a `anon` ni a `authenticated`**: esto lo llama un cron, no un navegador.
5. Programacion `pg_cron` cada 10 minutos, envuelta en un `do $$ ... $$` que no
   falle si la extension no esta instalada (en una rama de Supabase puede no
   estarlo, y la migracion no puede abortar por eso).

`supabase/tests/mastery_job.sql` es un fichero pgTAP con `begin; select
plan(N); ... select finish(); rollback;` que:

- siembra eventos sinteticos de dos alumnos de DOS colegios distintos,
- llama a `app.rebuild_skill_mastery('-infinity')`,
- comprueba `attempts_count`, `correct_count`, `hints_used` y el rango de
  `mastery` con `is(...)`,
- comprueba que un `answer_submitted` SIN `isCorrect` no incrementa
  `attempts_count`,
- comprueba que reejecutar el job no cambia el resultado (idempotencia),
- comprueba el aislamiento entre colegios: los eventos del colegio B no tocan la
  mastery del alumno del colegio A.

**`plan(N)` debe cuadrar exactamente con el numero de asserts.** El validador lo
cuenta.

## 4 · Que NO cuenta como resuelto

- Una funcion que existe y no se llama nunca en las pruebas. `has_function` no
  es una prueba: ejercela.
- `plan(N)` con un N que no cuadra. pgTAP lo reporta al final, despues de que
  todos los asserts salgan verdes, y es facil leerlo como ruido.
- Un `update` sobre `skill_mastery` sin `where` de particion, o una consulta a
  `learning_events` sin filtro por `server_ts`.
- Contar un `answer_submitted` sin `isCorrect` como fallo.
- Cualquier `grant` que alcance a `anon`. El validador lo rechaza.
- `security definer` sin `set search_path`. El validador lo rechaza, y
  `supabase/tests/constraints.sql` lo cuenta a nivel de base entera.
- Tocar `0010_telemetry.sql`. Esta en `forbidden`: la tabla ya esta bien; lo que
  falta es quien la escribe.
