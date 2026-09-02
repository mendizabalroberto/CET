---
id: plan-1-migracion
model: reasoner
territory: [supabase/migrations/0091_*, supabase/tests/plan_de_estudio.sql]
forbidden: [supabase/tests/helpers/fixture.psql, supabase/migrations/0087_telegram_del_tutor.sql, supabase/migrations/0058_puede_ver_alumno.sql, supabase/migrations/0030_source_storage.sql]
context: [supabase/migrations/0087_telegram_del_tutor.sql, supabase/migrations/0058_puede_ver_alumno.sql, supabase/migrations/0030_source_storage.sql, supabase/tests/rls_tutor.sql, supabase/tests/helpers/fixture.psql]
verify: node scripts/db-test.mjs plan_de_estudio
rounds: 5
deadline: 5 rondas o 40 min
---

## 1 · El problema

La app mide cuánto estudia un niño pero no le dice qué estudiar. El diseño
(planes de estudio a partir del boletín) necesita cuatro tablas nuevas, un
bucket privado de Storage y un relleno de `lessons.estimated_minutes`, que hoy
está a NULL en las 33 lecciones publicadas. Te toca **la migración
`supabase/migrations/0091_plan_de_estudio.sql` y su pgTAP
`supabase/tests/plan_de_estudio.sql`**. Otros agentes escriben en paralelo el
calendario escolar (0092) y el código TypeScript: no los toques.

## 2 · La evidencia que ya tenemos

Hechos verificados en la base `clcutoqjdgeggvgyreud` el 2026-09-02:

- Solo existe un colegio (`demo`). El alumno real, LEO, tiene
  `profiles.school_id = NULL`: estudia en casa, sin matrícula. Su tutor está en
  `guardian_students` con `revoked_at is null`. **Por eso `school_id` en estas
  tablas es NULLABLE** (el diseño original decía `not null`; esa decisión ya
  está tomada por el propietario). No lo cambies a `not null`.
- `public.lessons.estimated_minutes` es `smallint` con
  `check (estimated_minutes is null or estimated_minutes between 1 and 600)`.
  Está a NULL (no a 0) en las 33 lecciones. `public.lesson_blocks(lesson_id, ord)`.
- `app.puede_ver_alumno(uuid)` (0058, te lo doy) ya resuelve «es el alumno, o su
  tutor vigente, o staff con matrícula vigente, o superadmin». **NO la uses en
  las políticas de `boletines`, `planes_de_estudio` ni `plan_partes`**: el staff
  del colegio no puede leer esas tres tablas, ni siquiera el admin. Escribe la
  condición del tutor a mano contra `guardian_students`.
- `0087_telegram_del_tutor.sql` (te lo doy) es la forma de la casa para una
  tabla nueva con RLS: cabecera explicando el porqué, `revoke all … from
  authenticated, anon`, `grant` explícito, políticas con `(select auth.uid())`,
  `comment on`.
- `0030_source_storage.sql` (te lo doy) es la forma de la casa para un bucket:
  `insert into storage.buckets … on conflict (id) do update`, políticas sobre
  `storage.objects` filtradas por `bucket_id`.
- `supabase/tests/rls_tutor.sql` y `helpers/fixture.psql` (te los doy) muestran
  cómo sembrar tutores (necesitan fila en `auth.users` y `email`), y cómo
  suplantar: `pg_temp.login_as(uuid)`, `pg_temp.logout()`,
  `pg_temp.visible_count(sql)`. El fixture crea el colegio Alfa
  (`11111111-1111-4111-8111-111111111111`) con `teacher_a`
  (`aaaaaaaa-0000-4000-8000-00000000002a`), `admin_a`
  (`aaaaaaaa-0000-4000-8000-00000000001a`), alumnos `s1a`
  (`aaaaaaaa-0000-4000-8000-00000000003a`) y `s2a`
  (`aaaaaaaa-0000-4000-8000-00000000004a`), y el curso global Math Y6 con una
  lección y una skill; mira el fichero para los ids.
- `scripts/db-test.mjs` corre cada fichero de `supabase/tests/` dentro de su
  propio `begin; … rollback;` contra la base real y resuelve `\ir ruta` relativo
  al fichero. **La migración se aplica dentro del test** con
  `\ir ../migrations/0091_plan_de_estudio.sql`, como hace
  `tiempo_de_estudio.sql`, y el rollback la deshace. No la apliques con
  `db-apply`.

## 3 · El criterio de aceptación

`node scripts/db-test.mjs plan_de_estudio` sale en 0.

### 3.1 · La migración, exactamente esto (con `school_id` nullable)

```sql
create type public.boletin_estado as enum ('extraido', 'confirmado');

create table public.boletines (
  id            uuid primary key default extensions.gen_random_uuid(),
  school_id     uuid references public.schools(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  subido_por    uuid not null references public.profiles(id) on delete restrict,
  gestion       integer not null check (gestion between 2020 and 2100),
  trimestre     smallint check (trimestre between 1 and 3),
  storage_path  text not null,
  checksum      text not null check (checksum ~ '^[0-9a-f]{64}$'),
  notas         jsonb not null default '[]'::jsonb,
  estado        public.boletin_estado not null default 'extraido',
  modelo        text,
  tokens_in     integer,
  tokens_out    integer,
  created_at    timestamptz not null default now(),
  confirmado_at timestamptz,
  constraint boletines_notas_es_lista check (jsonb_typeof(notas) = 'array'),
  constraint boletines_confirmado_coherente
    check ((estado = 'confirmado') = (confirmado_at is not null))
);
create unique index boletines_unicos on public.boletines (student_id, checksum);

create table public.planes_de_estudio (
  id               uuid primary key default extensions.gen_random_uuid(),
  school_id        uuid references public.schools(id) on delete cascade,
  student_id       uuid not null references public.profiles(id) on delete cascade,
  boletin_id       uuid not null references public.boletines(id) on delete cascade,
  desde            date not null,
  hasta            date not null,
  minutos_por_dia  smallint not null check (minutos_por_dia between 10 and 180),
  reparto          jsonb not null,
  recomendaciones  text[] not null default '{}',
  activo           boolean not null default true,
  modelo           text,
  tokens_in        integer,
  tokens_out       integer,
  creado_por       uuid not null references public.profiles(id) on delete restrict,
  created_at       timestamptz not null default now(),
  constraint planes_ventana check (hasta > desde),
  constraint planes_recomendaciones_acotadas
    check (array_length(recomendaciones, 1) is null
           or array_length(recomendaciones, 1) <= 6)
);
create unique index planes_uno_activo on public.planes_de_estudio (student_id) where activo;

create type public.tarea_tipo as enum ('leccion', 'practica');

create table public.plan_tareas (
  id          uuid primary key default extensions.gen_random_uuid(),
  plan_id     uuid not null references public.planes_de_estudio(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  fecha       date not null,
  ord         smallint not null check (ord >= 0),
  subject_id  uuid not null references public.subjects(id) on delete restrict,
  tipo        public.tarea_tipo not null,
  lesson_id   uuid references public.lessons(id) on delete cascade,
  skill_id    uuid references public.skills(id) on delete cascade,
  minutos     smallint not null check (minutos between 5 and 90),
  constraint tarea_apunta_a_algo check (
    (tipo = 'leccion'  and lesson_id is not null and skill_id is null) or
    (tipo = 'practica' and skill_id  is not null and lesson_id is null))
);
create unique index plan_tareas_orden on public.plan_tareas (plan_id, fecha, ord);
create index plan_tareas_dia on public.plan_tareas (student_id, fecha);

create table public.plan_partes (
  id                 uuid primary key default extensions.gen_random_uuid(),
  plan_id            uuid not null references public.planes_de_estudio(id) on delete cascade,
  student_id         uuid not null references public.profiles(id) on delete cascade,
  fecha              date not null,
  minutos_previstos  smallint not null,
  minutos_medidos    numeric(6,1) not null,
  items_respondidos  integer not null default 0,
  aciertos           integer not null default 0,
  enviado_at         timestamptz,
  created_at         timestamptz not null default now()
);
create unique index plan_partes_un_parte_por_dia on public.plan_partes (plan_id, fecha);
```

Añade `comment on table` a las cuatro tablas explicando su papel (el de
`plan_partes`: existe solo para que el cron no mande el mismo aviso dos veces;
el índice único es la garantía).

### 3.2 · RLS

Las cuatro tablas con `enable row level security`, `revoke all … from
authenticated, anon`, y después:

- `boletines`, `planes_de_estudio`, `plan_partes`: `grant select, insert` a
  `authenticated`; política de `select` y de `insert` (`with check`) para el
  tutor vinculado: `exists (select 1 from public.guardian_students gs where
  gs.guardian_id = (select auth.uid()) and gs.student_id = <tabla>.student_id and
  gs.revoked_at is null)`. En `boletines` el `insert` exige además
  `subido_por = (select auth.uid())`; en `planes_de_estudio`, `creado_por =
  (select auth.uid())`. **Ninguna política menciona al staff, ni a
  `app.is_staff()`, ni a `app.current_school_id()`, ni al superadmin.** En
  `plan_partes` NO hay política de insert para `authenticated` (lo escribe el
  cron con `service_role`); `grant select` solo.
- `plan_tareas`: `grant select` a `authenticated`; política de `select` con
  `student_id = (select auth.uid())` **o** el `exists` del tutor. Sin filtro por
  fecha en la política. Sin `insert/update/delete` para `authenticated`.
- `service_role` se salta la RLS: no necesita política.

### 3.3 · Storage

Bucket `boletines`, privado, `file_size_limit = 10485760`,
`allowed_mime_types = array['application/pdf']`. Políticas sobre
`storage.objects` para `bucket_id = 'boletines'`: `select` e `insert` al tutor
vinculado del alumno cuya carpeta es el primer segmento de la ruta
(`(storage.foldername(name))[1]::uuid`), con el mismo `exists` sobre
`guardian_students`. Nada para staff, nada para `anon`.

### 3.4 · Minutos estimados

```sql
update public.lessons l
set estimated_minutes = greatest(10, round(
      (select count(*) from public.lesson_blocks b where b.lesson_id = l.id) * 1.5))
where estimated_minutes is null or estimated_minutes = 0;
```

Con un comentario diciendo que el factor 1,5 es una aproximación elegida, no
medida, y que se sustituye por la mediana observada cuando haya historial.

### 3.5 · Las pruebas, `supabase/tests/plan_de_estudio.sql`

`begin; select plan(N); \ir ../migrations/0091_plan_de_estudio.sql; \ir helpers/fixture.psql; …; select * from finish(); rollback;`

Siembra dos tutores (con `auth.users` + `profiles` role `guardian`, `school_id`
null, con email) — `tutor_1` vinculado a `s1a`, `tutor_2` vinculado a `s2a` — y,
como `postgres`, un boletín, un plan activo y dos `plan_tareas` para `s1a` (una
de hoy y una de mañana), y un parte.

Demuestra, con suplantación real (`pg_temp.login_as`) y `visible_count` donde
toque:

1. `tutor_1` ve el boletín de `s1a` (1 fila) y `tutor_2` ve 0.
2. `teacher_a` y `admin_a` ven 0 filas de `boletines`, 0 de `planes_de_estudio`
   y 0 de `plan_partes` — aunque `s1a` esté matriculado en su colegio.
3. `s1a` ve sus 2 `plan_tareas` (las dos, sin filtro de fecha); `s2a` ve 0.
4. `tutor_1` puede insertar un boletín para `s1a` (`lives_ok`) y NO para `s2a`
   (`throws_ok` con `42501`).
5. `s1a` no puede insertar en `plan_tareas` (`throws_ok`, `42501`).
6. Un segundo plan `activo = true` para el mismo alumno falla con `23505`; con
   `activo = false` entra (`lives_ok`).
7. Un segundo `plan_partes` con el mismo `(plan_id, fecha)` falla con `23505`.
8. Un `plan_tareas` con `tipo = 'leccion'` y `lesson_id` null falla con `23514`.
9. Un boletín con `estado = 'confirmado'` y `confirmado_at` null falla con `23514`.
10. Tras la migración, ninguna lección publicada tiene `estimated_minutes` null
    ni 0, y la lección del fixture vale `greatest(10, round(bloques*1.5))`
    calculado en el propio test a partir de `lesson_blocks`.
11. El bucket `boletines` existe, es privado y su límite es 10485760.

`plan(N)` debe cuadrar con el número real de asserts.

## 4 · Qué NO cuenta como resuelto

- `school_id not null` en cualquiera de las cuatro tablas.
- Una política que nombre `app.is_staff()`, `app.is_superadmin()`,
  `app.current_school_id()` o `app.puede_ver_alumno()` en `boletines`,
  `planes_de_estudio` o `plan_partes`.
- Una política de `plan_tareas` que filtre por `current_date`.
- Probar el aislamiento corriendo como `postgres`: el propietario se salta la
  RLS y el cero no demuestra nada. Cada assert de visibilidad va tras
  `pg_temp.login_as(...)`.
- `plan(N)` que no cuadre; asserts que comprueban que algo «existe» en vez de
  ejercerlo.
- Aplicar la migración con `db-apply` o fuera de la transacción del test.
- Tocar `fixture.psql` o cualquier migración anterior. Otro agente escribe
  `0092_*` en paralelo: no crees nada con ese número.
- Decir «debería pasar». Ejecuta el verificador y pega su salida literal.
