---
id: plan-2-calendario
model: chat
territory: [supabase/migrations/0092_*, supabase/seed/calendario_2026.sql, supabase/tests/calendario_escolar.sql]
forbidden: [supabase/tests/helpers/fixture.psql, supabase/migrations/0087_telegram_del_tutor.sql]
context: [supabase/migrations/0087_telegram_del_tutor.sql, supabase/tests/rls_tutor.sql]
verify: node scripts/db-test.mjs calendario_escolar
rounds: 4
deadline: 4 rondas o 25 min
---

## 1 · El problema

El plan de estudio necesita saber qué días no hay clase, cuándo son los
exámenes finales y cuál es el hito más cercano. Hoy el calendario escolar no
existe en la base. Te toca **la tabla `public.calendario_eventos`
(`supabase/migrations/0092_calendario_escolar.sql`), el seed
`supabase/seed/calendario_2026.sql` y el pgTAP
`supabase/tests/calendario_escolar.sql`**. Otro agente escribe `0091_*` en
paralelo: no crees nada con ese número ni dependas de él.

## 2 · La evidencia que ya tenemos

- Solo existe un colegio en la base (`demo`) y el alumno real no pertenece a
  ninguno. Por eso `school_id` es NULLABLE y **NULL significa global**, la misma
  convención que `subjects.school_id` y `courses.school_id` (AD-2). El seed de
  2026 entra global.
- `0087_telegram_del_tutor.sql` (te lo doy) es la forma de la casa: cabecera con
  el porqué, `revoke all … from authenticated, anon`, `grant` explícito,
  `comment on`.
- `supabase/tests/rls_tutor.sql` (te lo doy) muestra cómo sembrar un tutor
  (`auth.users` + `profiles` role `guardian`, `school_id` null, con email) y cómo
  suplantar con `set local role authenticated` + `request.jwt.claims`.
- `app.current_school_id()` existe (0004) y devuelve el colegio de la sesión o
  NULL.
- `scripts/db-test.mjs` corre cada fichero de `supabase/tests/` dentro de su
  `begin; … rollback;` contra la base real y resuelve `\ir ruta` relativo al
  fichero. La migración Y el seed se aplican dentro del test con `\ir` y el
  rollback los deshace.
- **Un intento anterior se quedó a un assert de verde**, y conviene que no
  repitas su fallo: el assert «el 2026-11-02 es feriado» hacía
  `select tipo … where desde <= '2026-11-02' and hasta >= '2026-11-02'` y
  obtuvo `hito_cambridge`, porque el tramo de Movers (10-29 → 11-06) también
  contiene esa fecha. Cuando preguntes por una fecha, filtra también por
  `tipo` (o usa `ok(exists(...))` con el tipo en el `where`). Y su `plan(11)`
  tenía solo 10 asserts: cuenta los tuyos antes de escribir el número.
- Fechas de 2026 extraídas del calendario oficial del colegio (Bolivia), de
  septiembre en adelante:

| desde | hasta | tipo | titulo | year_levels |
|---|---|---|---|---|
| 2026-09-23 | 2026-09-23 | sin_clases | Jornada pedagógica | null |
| 2026-09-24 | 2026-09-24 | feriado | Aniversario de Santa Cruz | null |
| 2026-09-25 | 2026-09-25 | sin_clases | Jornada pedagógica | null |
| 2026-10-27 | 2026-10-27 | sin_clases | 3.º Open House | null |
| 2026-11-02 | 2026-11-02 | feriado | Día de Todos los Difuntos | null |
| 2026-11-13 | 2026-11-20 | examenes_finales | Exámenes finales — 3.er trimestre | null |
| 2026-12-02 | 2026-12-02 | fin_trimestre | Awards Ceremony — 3.er trimestre | null |
| 2026-10-01 | 2026-10-06 | hito_cambridge | Cambridge KET — Y7 | {7} |
| 2026-10-08 | 2026-10-13 | hito_cambridge | Cambridge PET — Y9 | {9} |
| 2026-10-29 | 2026-11-06 | hito_cambridge | Cambridge Movers — Y4 | {4} |
| 2026-11-09 | 2026-11-12 | hito_cambridge | Cambridge Flyers — Y5 | {5} |

Y6 no tiene examen Cambridge en 2026: para un alumno de Y6 el hito más cercano
son los finales del 13 de noviembre.

## 3 · El criterio de aceptación

`node scripts/db-test.mjs calendario_escolar` sale en 0.

### 3.1 · Migración `0092_calendario_escolar.sql`

```sql
create type public.evento_escolar as enum (
  'feriado', 'sin_clases', 'examenes_finales', 'vacaciones',
  'fin_trimestre', 'hito_cambridge');

create table public.calendario_eventos (
  id           uuid primary key default extensions.gen_random_uuid(),
  school_id    uuid references public.schools(id) on delete cascade,  -- NULL = global
  gestion      integer not null check (gestion between 2020 and 2100),
  desde        date not null,
  hasta        date not null,
  tipo         public.evento_escolar not null,
  titulo       text not null check (length(btrim(titulo)) > 0),
  year_levels  smallint[],          -- NULL = aplica a todos
  constraint calendario_rango check (hasta >= desde)
);
create index calendario_eventos_ventana on public.calendario_eventos (gestion, desde, hasta);
```

Idempotencia del seed: índice único sobre
`(coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), gestion, desde, tipo, titulo)`
para que el seed pueda usar `on conflict do nothing`.

RLS: `enable row level security`; `revoke all … from authenticated, anon`;
`grant select` a `authenticated`; una política de `select` que deja ver las
filas globales (`school_id is null`) y las del colegio de la sesión
(`school_id = (select app.current_school_id())`). Sin escritura desde
`authenticated`: el seed y el futuro panel escriben con `service_role`.

### 3.2 · Seed `supabase/seed/calendario_2026.sql`

Las once filas de la tabla de arriba, `gestion = 2026`, `school_id = null`,
`insert … on conflict do nothing`. Cabecera con la fuente
(`docs/academico/Calendario Escolar 2026.pdf`) y la nota de que Y6 no tiene hito
Cambridge en 2026.

### 3.3 · Pruebas `supabase/tests/calendario_escolar.sql`

`begin; select plan(N); \ir ../migrations/0092_calendario_escolar.sql; \ir ../seed/calendario_2026.sql; …; select * from finish(); rollback;`

1. Hay exactamente 11 filas globales de 2026.
2. El 2026-09-24 es `feriado` y el 2026-11-02 también (dos asserts).
3. Existe un tramo `examenes_finales` que contiene el 2026-11-15.
4. No hay ningún `hito_cambridge` de 2026 cuyo `year_levels` contenga 6.
5. Idempotencia: **no incluyas el seed dos veces** — `db-test.mjs` rechaza un
   segundo `\ir` del mismo fichero como «circular» (el intento anterior murió
   por eso). En su lugar, repite en el propio test UN `insert … on conflict do
   nothing` copiado literal del seed (por ejemplo la fila del 2026-09-24) y
   comprueba que siguen siendo 11 filas.
6. Un evento con `hasta < desde` falla con `23514`.
7. Un tutor (sembrado como en `rls_tutor.sql`, `school_id` null), suplantado con
   `set local role authenticated` + claims, ve las 11 filas globales.
8. Un `anon` no ve nada: con `set local role anon`, `select count(*)` lanza
   `insufficient_privilege` (`throws_ok` con `42501`). Vuelve con `reset role`.

## 4 · Qué NO cuenta como resuelto

- `school_id not null`, o un seed que apunte al colegio `demo`.
- Probar visibilidad como `postgres`.
- `plan(N)` descuadrado.
- Un seed que no sea idempotente (sin `on conflict`).
- Tocar `0091_*`, `fixture.psql` o cualquier fichero fuera del territorio.
- Decir «debería pasar». Ejecuta el verificador y pega su salida literal.
