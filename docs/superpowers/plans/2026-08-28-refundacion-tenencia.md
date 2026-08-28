# Refundación de la tenencia (tutor como raíz) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir al tutor en la raíz de la tenencia —se registra primero, crea a su hijo, y engancha a un colegio si quiere— sin que el colegio pueda ver nunca la actividad que el niño hace en casa.

**Architecture:** La pertenencia de un alumno a un colegio deja de ser una columna (`students.school_id`) y pasa a ser una relación con fechas (`student_school_memberships`). El eje de autorización sobre datos de alumno pasa de `school_id = app.current_school_id()` a una función única, `app.puede_ver_alumno()`, cierta por cuatro caminos. La regla «el colegio ve lo suyo» se implementa sellando `learning_events.school_id` en la ingesta: NULL significa «en casa», y el personal, que ya filtra por su colegio, sencillamente no lo tiene en su conjunto.

**Tech Stack:** Postgres 17 (Supabase), pgTAP, Next.js 15 App Router, TypeScript, Zod, Vitest, Playwright, pnpm 9.12, Node ≥20.11.

**Spec:** `docs/superpowers/specs/2026-08-28-refundacion-tenencia-design.md`

## Global Constraints

Cada tarea las hereda. No se repiten en los pasos.

- **Toda función en el esquema `app` lleva `security definer`, `set search_path = ''` y `stable`** salvo que escriba, en cuyo caso es `volatile`. Regla de la cabecera de `0004_app_helpers.sql`; sin `search_path = ''` cualquiera que pueda crear una tabla en su search_path se autoconcede superadmin.
- **Nombres siempre cualificados**: `public.profiles`, `auth.uid()`. Nunca a secas.
- **Cada migración entra en UNA transacción.** `scripts/db-apply.mjs` ya lo garantiza; ninguna migración puede depender de una a medias.
- **Toda tabla lleva RLS habilitada.** Una tabla sin política es una tabla inaccesible, que es el fallo seguro correcto.
- **Toda `foreign key` declara `on delete` explícitamente.** Nunca el default.
- **Cero strings a pelo en la interfaz** (AD-7): todo texto visible sale de `apps/web/src/lib/i18n/dictionaries`, en `es` y en `en`.
- **Nada de `createAdminClient` en rutas del panel ni en Server Actions de usuario.** Se usa el cliente de sesión; RLS es la última palabra (`modules/admin` §6.1).
- **Toda mutación de staff escribe en `audit_log` dentro de la misma transacción** que la operación.
- **Verificación por código de salida, nunca por grep sobre la salida.** `scripts/db-test.mjs` falla si aparece una sola línea `not ok` o si el `plan(N)` no cuadra.
- Comandos del árbol: `node scripts/db-apply.mjs migrations` · `node scripts/db-test.mjs <prefijo>` · `pnpm test` · `pnpm verify`.

---

## Estructura de ficheros

**Migraciones nuevas** (`supabase/migrations/`), en este orden y con estos números:

| Fichero | Responsabilidad |
|---|---|
| `0055_rol_guardian.sql` | miembro `guardian` en `user_role` |
| `0056_profiles_alcance_por_rol.sql` | la constraint de `profiles` deja de ser binaria |
| `0057_tutor_y_membresias.sql` | las tres tablas del §3.2 con su RLS |
| `0058_puede_ver_alumno.sql` | el ayudante nuevo + reescritura de `puede_ver_informe` |
| `0059_rls_datos_de_alumno.sql` | el montón 2 de políticas, reescrito |
| `0060_evento_sin_colegio.sql` | `learning_events.school_id` nullable + sellado |
| `0061_migrar_matriculas.sql` | los datos de hoy al modelo nuevo |
| `0062_audit_actor_sin_colegio.sql` | `app.audit()` deja de escribir NULL |

**Pruebas pgTAP nuevas** (`supabase/tests/`): `rls_tutor.sql`, `membresias.sql`, `evento_sin_colegio.sql`, `migracion_matriculas.sql`.

**TypeScript**: `packages/shared/src/enums.ts` y `.../schemas/guardian.ts` (nuevo); en `apps/web/src`, `lib/routes.ts`, `lib/auth/actions.ts`, `lib/data/guardian.ts` (nuevo), `components/auth/RegisterForm.tsx`, `components/auth/StudentLoginForm.tsx`, `app/(auth)/register/page.tsx`, `app/(auth)/login/student/page.tsx`, `app/(guardian)/**` (nuevo), `app/(staff)/admin/page.tsx`, `components/staff/queries.ts`, `lib/i18n/dictionaries/*`.

**Herramienta**: `scripts/clasificar-politicas.mjs` (nueva).

**Orden de dependencia:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 son secuenciales sobre la base de datos. 10 depende de 5 y 7. Las de interfaz (11–15) dependen de 10. 16 y 17 cierran.

---

### Task 1: Clasificar las 105 políticas

Sin esto, «reescribir la RLS» es una tarea sin borde. La clasificación tiene que ser un fichero que una herramienta pueda comprobar, no una lista mental.

**Files:**
- Create: `scripts/clasificar-politicas.mjs`
- Create: `supabase/POLITICAS.md`
- Test: el propio script, por código de salida

**Interfaces:**
- Produces: `supabase/POLITICAS.md` con una fila por política y una columna `montón` de valor `intacta` | `reescrita` | `nueva`. Las tareas 6 y 9 leen ese fichero para saber qué tocan.

- [ ] **Step 1: Escribir el script que extrae las políticas y exige clasificación**

```js
/**
 * Comprueba que TODA politica de 0012_rls_policies.sql esta clasificada en
 * supabase/POLITICAS.md. Una politica sin clasificar es trabajo sin borde.
 * Uso: node scripts/clasificar-politicas.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(root, "supabase/migrations/0012_rls_policies.sql"), "utf8");
const doc = readFileSync(join(root, "supabase/POLITICAS.md"), "utf8");

const politicas = [...sql.matchAll(/create policy\s+"?([a-z0-9_]+)"?/gi)].map((m) => m[1]);
const clasificadas = new Map(
  [...doc.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|[^|]*\|\s*(intacta|reescrita|nueva)\s*\|/gim)]
    .map((m) => [m[1], m[2]]),
);

const faltan = politicas.filter((p) => !clasificadas.has(p));
if (faltan.length > 0) {
  console.error(`Sin clasificar (${faltan.length}):\n  ${faltan.join("\n  ")}`);
  process.exit(1);
}
console.log(`${politicas.length} politicas, todas clasificadas.`);
```

- [ ] **Step 2: Correrlo con `POLITICAS.md` vacío para verlo fallar**

Crear `supabase/POLITICAS.md` con solo la cabecera de tabla y ejecutar:

Run: `node scripts/clasificar-politicas.mjs`
Expected: FALLA con `Sin clasificar (105):` y la lista.

- [ ] **Step 3: Clasificar las 105**

Leer `supabase/migrations/0012_rls_policies.sql` entero y rellenar la tabla. Criterio, sin excepciones:

- **`reescrita`** si la política gobierna una tabla de **datos de alumno**: `profiles`, `students`, `learning_events`, `skill_mastery`, `exam_attempts`, `attempt_items`, `attempt_responses`, `attempt_gradings`, `audit_log`, `registration_requests`, `section_members`.
- **`intacta`** si gobierna contenido o currículo: `subjects`, `courses`, `school_courses`, `course_modules`, `lessons`, `lesson_blocks`, `skills`, `lesson_skills`, `media_assets`, `questions`, `question_versions`, `exam_blueprints`, `exam_blueprint_sections`, `exam_assignments`, `schools`, `sections`.
- **`nueva`** no aparece aquí: es para las tablas de la tarea 4.

Formato de cada fila, y el script depende de él:

```markdown
| `learning_events_select_staff` | learning_events | reescrita | el colegio no debe ver los eventos de casa (§3.4) |
```

- [ ] **Step 4: Correrlo hasta verde**

Run: `node scripts/clasificar-politicas.mjs`
Expected: `105 politicas, todas clasificadas.`

- [ ] **Step 5: Commit**

```bash
git add scripts/clasificar-politicas.mjs supabase/POLITICAS.md
git commit -m "docs(rls): las 105 politicas clasificadas, y un script que no deja que se quede ninguna fuera"
```

---

### Task 2: El rol `guardian`

**Files:**
- Create: `supabase/migrations/0055_rol_guardian.sql`
- Modify: `packages/shared/src/enums.ts:13`
- Test: `packages/shared/src/__tests__/enum-parity.test.ts` (ya existe; debe pasar sin tocarlo)

**Interfaces:**
- Produces: el valor `'guardian'` de `public.user_role`, y `UserRole` incluyéndolo en TypeScript.

- [ ] **Step 1: Añadir el miembro en TypeScript para ver fallar la paridad**

`packages/shared/src/enums.ts`:

```ts
/** Roles del sistema. superadmin no tiene colegio; guardian tampoco (la membresia de su hijo es una relacion, no una columna). */
export const userRole = z.enum(["superadmin", "school_admin", "teacher", "student", "guardian"]);
```

- [ ] **Step 2: Correr la paridad y verla fallar**

Run: `pnpm --filter @cet/shared test enum-parity`
Expected: FALLA. El test lee el SQL real y `0002_enums.sql` todavía declara cuatro miembros.

- [ ] **Step 3: La migración**

```sql
-- =============================================================================
-- 0055_rol_guardian.sql — el tutor entra en el sistema de roles
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §1 · packages/shared/src/enums.ts
-- =============================================================================
-- `alter type ... add value` NO puede correr dentro de un bloque de transaccion
-- en Postgres < 12, y este arbol fija Postgres 17, donde SI puede. 0051 ya usa
-- esta misma forma para los tres miembros de interfaz; se sigue ese precedente.
--
-- El miembro va AL FINAL a proposito: en Postgres el orden de declaracion de un
-- enum ES su orden de comparacion, y `enum-parity.test.ts` compara el orden,
-- no solo el conjunto. Insertarlo en medio cambiaria el significado de cualquier
-- `order by role` que exista hoy.
alter type public.user_role add value if not exists 'guardian';
```

- [ ] **Step 4: Aplicar y verificar la paridad**

Run: `node scripts/db-apply.mjs migrations && pnpm --filter @cet/shared test enum-parity`
Expected: la migración aplica y el test PASA.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0055_rol_guardian.sql packages/shared/src/enums.ts
git commit -m "feat(tenencia): el rol guardian existe en los dos lados del contrato"
```

---

### Task 3: La constraint de `profiles`, por rol

**Files:**
- Create: `supabase/migrations/0056_profiles_alcance_por_rol.sql`
- Create: `supabase/tests/rls_tutor.sql` (primera parte)

**Interfaces:**
- Consumes: `'guardian'` de la tarea 2.
- Produces: la constraint `profiles_alcance_por_rol`, que permite `student` y `guardian` con `school_id` NULL y **exige** `school_id` al personal.

- [ ] **Step 1: El pgTAP que falla**

`supabase/tests/rls_tutor.sql`:

```sql
begin;
select plan(3);

-- Un tutor sin colegio tiene que poder EXISTIR. Hoy la constraint lo prohibe.
select lives_ok(
  $$insert into public.profiles (id, school_id, role, full_name, status)
    values ('11111111-1111-1111-1111-111111111111', null, 'guardian', 'Tutor Uno', 'active')$$,
  'un tutor existe sin colegio');

-- Un alumno tambien: es el niño que estudia en casa.
select lives_ok(
  $$insert into public.profiles (id, school_id, role, full_name, status)
    values ('22222222-2222-2222-2222-222222222222', null, 'student', 'Nino Uno', 'active')$$,
  'un alumno existe sin colegio');

-- El personal NO. Un profesor sin colegio no significa nada.
select throws_ok(
  $$insert into public.profiles (id, school_id, role, full_name, status)
    values ('33333333-3333-3333-3333-333333333333', null, 'teacher', 'Profe Sin Casa', 'active')$$,
  '23514',
  null,
  'un profesor sin colegio sigue siendo imposible');

select * from finish();
rollback;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `node scripts/db-test.mjs rls_tutor`
Expected: FALLA en los dos primeros asserts — `profiles_superadmin_has_no_school` los rechaza.

- [ ] **Step 3: La migración**

```sql
-- =============================================================================
-- 0056_profiles_alcance_por_rol.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- La constraint vieja era binaria: o eres superadmin y no tienes colegio, o
-- tienes colegio. Con el tutor como raiz hay CUATRO combinaciones legitimas y
-- una sola prohibida —personal sin colegio—, asi que la constraint pasa a
-- enumerar por rol en vez de comparar dos booleanos.
alter table public.profiles
  drop constraint if exists profiles_superadmin_has_no_school;

alter table public.profiles
  add constraint profiles_alcance_por_rol check (
    case role
      when 'superadmin'   then school_id is null
      when 'school_admin' then school_id is not null
      when 'teacher'      then school_id is not null
      when 'student'      then school_id is null
      when 'guardian'     then school_id is null
    end
  );

comment on constraint profiles_alcance_por_rol on public.profiles is
  'El personal pertenece a un colegio; superadmin, alumno y tutor no. La matricula del alumno vive en student_school_memberships, no aqui.';
```

- [ ] **Step 4: Aplicar y verde**

Run: `node scripts/db-apply.mjs migrations && node scripts/db-test.mjs rls_tutor`
Expected: `ok 1`, `ok 2`, `ok 3`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0056_profiles_alcance_por_rol.sql supabase/tests/rls_tutor.sql
git commit -m "feat(tenencia): un nino puede existir sin colegio, un profesor no"
```

---

### Task 4: Tutor, membresías y enlaces de acceso

**Files:**
- Create: `supabase/migrations/0057_tutor_y_membresias.sql`
- Create: `supabase/tests/membresias.sql`
- Modify: `supabase/POLITICAS.md` (filas `nueva`)

**Interfaces:**
- Produces: `public.guardian_students`, `public.student_school_memberships`, `public.student_access_links`, y el enum `public.membership_status`.

- [ ] **Step 1: El pgTAP que falla**

`supabase/tests/membresias.sql`:

```sql
begin;
select plan(4);

select has_table('public', 'guardian_students', 'existe el vinculo tutor-hijo');
select has_table('public', 'student_school_memberships', 'existe la matricula con fechas');

-- Sembrado minimo: un colegio y un alumno.
insert into public.schools (id, name, slug, timezone)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Demo', 'demo-test', 'UTC');
insert into public.profiles (id, school_id, role, full_name, status)
values ('22222222-2222-2222-2222-222222222222', null, 'student', 'Nino Uno', 'active');

select lives_ok(
  $$insert into public.student_school_memberships
      (student_id, school_id, starts_on, status)
    values ('22222222-2222-2222-2222-222222222222',
            'aaaaaaaa-0000-0000-0000-000000000001', '2026-01-01', 'activa')$$,
  'una matricula activa entra');

-- La segunda, solapada, NO. Y lo impide la base de datos, no la aplicacion.
select throws_ok(
  $$insert into public.student_school_memberships
      (student_id, school_id, starts_on, status)
    values ('22222222-2222-2222-2222-222222222222',
            'aaaaaaaa-0000-0000-0000-000000000001', '2026-03-01', 'activa')$$,
  '23P01',
  null,
  'dos matriculas activas solapadas son imposibles');

select * from finish();
rollback;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `node scripts/db-test.mjs membresias`
Expected: FALLA en el primer assert — la tabla no existe.

- [ ] **Step 3: La migración**

```sql
-- =============================================================================
-- 0057_tutor_y_membresias.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
create extension if not exists btree_gist;

create type public.membership_status as enum
  ('solicitada', 'activa', 'rechazada', 'terminada');

-- -----------------------------------------------------------------------------
-- guardian_students — quien es hijo de quien
-- -----------------------------------------------------------------------------
create table public.guardian_students (
  guardian_id  uuid not null references public.profiles (id) on delete cascade,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  parentesco   text not null default 'tutor',
  es_principal boolean not null default true,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  primary key (guardian_id, student_id)
);
alter table public.guardian_students enable row level security;
create index guardian_students_student_idx on public.guardian_students (student_id);

-- -----------------------------------------------------------------------------
-- student_school_memberships — la matricula, con fechas
-- -----------------------------------------------------------------------------
-- El EXCLUDE es la pieza que no se puede delegar a la aplicacion: dos matriculas
-- activas a la vez rompen la atribucion de CADA evento a un colegio, y ese dato
-- no se repara despues porque no hay forma de saber cual de las dos valia.
create table public.student_school_memberships (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  school_id    uuid not null references public.schools (id) on delete restrict,
  section_id   uuid references public.sections (id) on delete set null,
  starts_on    date not null,
  ends_on      date,
  status       public.membership_status not null default 'solicitada',
  requested_by uuid references public.profiles (id) on delete set null,
  approved_by  uuid references public.profiles (id) on delete set null,
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint membresia_fechas_coherentes check (ends_on is null or ends_on >= starts_on),
  constraint membresia_activa_sin_solape exclude using gist (
    student_id with =,
    daterange(starts_on, ends_on, '[)') with &&
  ) where (status = 'activa')
);
alter table public.student_school_memberships enable row level security;
create index membresias_colegio_idx
  on public.student_school_memberships (school_id, status, starts_on desc);

-- -----------------------------------------------------------------------------
-- student_access_links — el enlace que el tutor genera para su hijo
-- -----------------------------------------------------------------------------
-- El token se guarda HASHEADO. Se muestra una sola vez, en la respuesta de la
-- accion, igual que resetStudentPin (modules/admin §4). Un token en claro en la
-- base de datos es una credencial de un menor en reposo.
create table public.student_access_links (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  created_by   uuid not null references public.profiles (id) on delete cascade,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.student_access_links enable row level security;
create index enlaces_alumno_idx on public.student_access_links (student_id);
```

- [ ] **Step 4: Aplicar y verde**

Run: `node scripts/db-apply.mjs migrations && node scripts/db-test.mjs membresias`
Expected: los 4 asserts en `ok`.

- [ ] **Step 5: Anotar las políticas nuevas y comprobar el inventario**

Añadir a `supabase/POLITICAS.md` una fila `nueva` por cada política que la tarea 5 va a crear sobre estas tres tablas, y correr:

Run: `node scripts/clasificar-politicas.mjs`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0057_tutor_y_membresias.sql supabase/tests/membresias.sql supabase/POLITICAS.md
git commit -m "feat(tenencia): la matricula deja de ser una columna y pasa a ser una relacion con fechas"
```

---

### Task 5: `app.puede_ver_alumno()`

**Files:**
- Create: `supabase/migrations/0058_puede_ver_alumno.sql`
- Modify: `supabase/tests/rls_tutor.sql` (ampliar el `plan`)

**Interfaces:**
- Consumes: las tablas de la tarea 4.
- Produces: `app.puede_ver_alumno(p_student_id uuid) returns boolean`. Las tareas 6, 7 y 10 la llaman. Devuelve `false`, **nunca NULL** — un NULL en una política no deja pasar y el motivo no se ve, que es el fallo que `0025` documenta.

- [ ] **Step 1: Ampliar el pgTAP**

Añadir a `supabase/tests/rls_tutor.sql`, subiendo el `plan` a 7:

```sql
-- Sembrado: tutor, hijo, vinculo, colegio y personal.
insert into public.guardian_students (guardian_id, student_id)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select ok(app.puede_ver_alumno('22222222-2222-2222-2222-222222222222'),
          'el tutor ve a su hijo');
select ok(not app.puede_ver_alumno('44444444-4444-4444-4444-444444444444'),
          'el tutor NO ve a un nino ajeno');
select isnt(app.puede_ver_alumno('44444444-4444-4444-4444-444444444444'), null,
            'devuelve false, no NULL: un NULL en una politica no deja pasar y no se ve por que');
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `node scripts/db-test.mjs rls_tutor`
Expected: FALLA — `function app.puede_ver_alumno(uuid) does not exist`.

- [ ] **Step 3: La migración**

```sql
-- =============================================================================
-- 0058_puede_ver_alumno.sql — el eje nuevo de autorizacion sobre datos de alumno
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Sustituye al patron `school_id = app.current_school_id()` en TODA tabla de
-- datos de alumno. Cuatro caminos, y solo cuatro. El coalesce(..., false) del
-- final no es cosmetico: 0025 documenta, con evidencia reproducida contra
-- produccion, que `school_id = NULL` no es FALSE sino NULL, y que una politica
-- que devuelve NULL no deja pasar sin decir por que. Doce politicas se
-- comportaron asi en silencio. Aqui esa clase de bug se elimina de raiz.
create or replace function app.puede_ver_alumno(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    -- 1. es el propio alumno
    auth.uid() = p_student_id
    -- 2. es su tutor, con vinculo sin revocar
    or exists (
      select 1 from public.guardian_students gs
      where gs.guardian_id = auth.uid()
        and gs.student_id = p_student_id
        and gs.revoked_at is null)
    -- 3. es personal de un colegio con matricula VIGENTE de ese alumno
    or (app.is_staff() and exists (
      select 1 from public.student_school_memberships m
      where m.student_id = p_student_id
        and m.school_id = app.current_school_id()
        and m.status = 'activa'
        and m.starts_on <= current_date
        and (m.ends_on is null or m.ends_on > current_date)))
    -- 4. superadmin
    or app.is_superadmin(),
    false);
$$;

comment on function app.puede_ver_alumno(uuid) is
  'Cuatro caminos: el propio alumno, su tutor, personal con matricula vigente, superadmin. Nunca devuelve NULL.';

revoke all on function app.puede_ver_alumno(uuid) from public;
grant execute on function app.puede_ver_alumno(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- puede_ver_informe (0053) deja de comparar colegios a mano
-- -----------------------------------------------------------------------------
drop function if exists app.puede_ver_informe(uuid);

create or replace function app.puede_ver_informe(p_student_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.puede_ver_alumno(p_student_id) then
    raise exception 'No tienes permiso para ver el informe de este alumno'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke all on function app.puede_ver_informe(uuid) from public;
grant execute on function app.puede_ver_informe(uuid) to authenticated, service_role;
```

- [ ] **Step 4: Aplicar, y correr también los informes que dependían de la vieja**

Run: `node scripts/db-apply.mjs migrations && node scripts/db-test.mjs rls_tutor && node scripts/db-test.mjs informes_alumno`
Expected: los dos ficheros en verde. `informes_alumno` no se ha tocado y debe seguir pasando: es la prueba de que la reescritura conservó el requisito.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0058_puede_ver_alumno.sql supabase/tests/rls_tutor.sql
git commit -m "feat(tenencia): un solo eje de autorizacion sobre datos de alumno, y nunca devuelve NULL"
```

---

### Task 6: Reescribir el montón 2 de políticas

**Files:**
- Create: `supabase/migrations/0059_rls_datos_de_alumno.sql`
- Modify: `supabase/tests/rls_tenant_isolation.sql`, `supabase/tests/rls_student_cannot_read_peers.sql`

**Interfaces:**
- Consumes: `app.puede_ver_alumno()` de la tarea 5, y la columna `montón` de `supabase/POLITICAS.md`.
- Produces: las políticas de datos de alumno colgando del eje nuevo. Nada más depende de esta tarea salvo que todo lo anterior siga verde.

- [ ] **Step 1: Añadir a `rls_tenant_isolation.sql` el assert que guarda el patrón**

```sql
-- Ninguna politica de datos de alumno puede haber quedado con la forma vieja.
-- Es el patron que 0025 documenta como fuente de NULL silencioso.
select is_empty(
  $$select p.polname
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
     where c.relname in ('students','learning_events','skill_mastery',
                         'exam_attempts','attempt_items','attempt_responses',
                         'attempt_gradings')
       and pg_get_expr(p.polqual, p.polrelid) like '%current_school_id%'
       and pg_get_expr(p.polqual, p.polrelid) not like '%puede_ver_alumno%'$$,
  'ninguna politica de datos de alumno compara colegios a mano');
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `node scripts/db-test.mjs rls_tenant_isolation`
Expected: FALLA listando las políticas que todavía usan la forma vieja.

- [ ] **Step 3: Escribir `0059_rls_datos_de_alumno.sql`**

Para **cada** política marcada `reescrita` en `supabase/POLITICAS.md`, un par `drop policy` + `create policy`. La forma, idéntica en todas:

```sql
drop policy if exists students_select_staff on public.students;
create policy students_select_staff on public.students
  for select to authenticated
  using ((select app.puede_ver_alumno(profile_id)));
```

Tres reglas al escribirlas, y las tres tienen motivo:

1. **La llamada va envuelta en `(select ...)`.** Es lo que hace que Postgres la evalúe una vez por sentencia y no una vez por fila; `0012` ya usa esa forma en las 105 y aquí se conserva.
2. **El `with check` de INSERT no se relaja.** `modules/analytics` §6.1 lo exige: sin él, un alumno inserta eventos a nombre de otro aunque no pueda leerlos.
3. **`audit_log` no cuelga de `puede_ver_alumno`**: su alcance es el colegio del actor, no el niño. Se queda como está salvo por la tarea 9.

- [ ] **Step 4: Aplicar y correr la batería de RLS entera**

Run: `node scripts/db-apply.mjs migrations && node scripts/db-test.mjs rls`
Expected: `rls_tenant_isolation`, `rls_student_cannot_read_peers`, `rls_answer_key_hidden` y `rls_tutor` en verde. El tercero no se ha tocado y debe seguir pasando.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0059_rls_datos_de_alumno.sql supabase/tests/rls_tenant_isolation.sql supabase/tests/rls_student_cannot_read_peers.sql
git commit -m "refactor(rls): los datos de alumno cuelgan del eje nuevo, y un test impide volver al viejo"
```

---

### Task 7: El evento sin colegio

Aquí vive la regla del §3.4, y es la que hace que «el colegio ve lo suyo» sea una propiedad del dato en vez de once políticas que hay que acordarse de escribir bien.

**Files:**
- Create: `supabase/migrations/0060_evento_sin_colegio.sql`
- Create: `supabase/tests/evento_sin_colegio.sql`
- Modify: `apps/web/src/app/api/events/route.ts`
- Test: `apps/web/src/app/api/events/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `student_school_memberships` (tarea 4).
- Produces: `app.colegio_del_evento(p_student_id uuid) returns uuid` — NULL si el niño no tiene matrícula vigente. La ruta de ingesta la usa para sellar cada fila.

- [ ] **Step 1: El pgTAP que falla**

```sql
begin;
select plan(3);

select col_is_null('public', 'learning_events', 'school_id',
                   'un evento puede no tener colegio: es el niño que estudia en casa');

-- Con matricula vigente, el sello es el colegio.
select is(app.colegio_del_evento('22222222-2222-2222-2222-222222222222'),
          'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
          'con matricula vigente, el evento se sella con el colegio');

-- Terminada la matricula, deja de sellarse.
update public.student_school_memberships
   set status = 'terminada', ends_on = current_date - 1
 where student_id = '22222222-2222-2222-2222-222222222222';

select is(app.colegio_del_evento('22222222-2222-2222-2222-222222222222'), null,
          'sin matricula vigente, el evento es de casa');

select * from finish();
rollback;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `node scripts/db-test.mjs evento_sin_colegio`
Expected: FALLA — `school_id` es `not null` y la función no existe.

- [ ] **Step 3: La migración**

```sql
-- =============================================================================
-- 0060_evento_sin_colegio.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- La clave de particion sigue siendo server_ts, asi que aflojar school_id no
-- toca el particionado ni ninguno de los cuatro indices de 0010.
alter table public.learning_events alter column school_id drop not null;

comment on column public.learning_events.school_id is
  'El colegio bajo cuyo techo ocurrio la actividad. NULL = en casa: el personal no lo ve, el tutor si.';

create or replace function app.colegio_del_evento(p_student_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.school_id
  from public.student_school_memberships m
  where m.student_id = p_student_id
    and m.status = 'activa'
    and m.starts_on <= current_date
    and (m.ends_on is null or m.ends_on > current_date)
  limit 1;
$$;

revoke all on function app.colegio_del_evento(uuid) from public;
grant execute on function app.colegio_del_evento(uuid) to authenticated, service_role;
```

- [ ] **Step 4: El test de comportamiento de la ruta de ingesta**

En `apps/web/src/app/api/events/__tests__/route.test.ts`, añadir —siguiendo el estilo de los que ya hay allí:

```ts
it("sella school_id NULL cuando el alumno no tiene matricula vigente", async () => {
  const res = await POST(peticionConEventos({ studentId: NINO_SIN_COLEGIO }));
  expect(res.status).toBe(204);
  expect(filaInsertada().school_id).toBeNull();
});
```

- [ ] **Step 5: Sellar en la ruta**

En `apps/web/src/app/api/events/route.ts`, donde hoy se compone la fila con el `school_id` de la sesión, sustituirlo por el resultado de `app.colegio_del_evento(studentId)`. **La identidad la sigue poniendo el servidor** (`modules/analytics` §2): el `studentId` sale de la sesión, nunca del cuerpo.

- [ ] **Step 6: Verde en los dos lados**

Run: `node scripts/db-apply.mjs migrations && node scripts/db-test.mjs evento_sin_colegio && pnpm --filter web test events`
Expected: pgTAP en verde y el test de ruta en verde.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0060_evento_sin_colegio.sql supabase/tests/evento_sin_colegio.sql "apps/web/src/app/api/events"
git commit -m "feat(telemetria): lo que el nino hace en casa no lleva el sello del colegio"
```

---

### Task 8: Migrar las matrículas que ya existen

**Files:**
- Create: `supabase/migrations/0061_migrar_matriculas.sql`
- Create: `supabase/tests/migracion_matriculas.sql`

**Interfaces:**
- Consumes: `student_school_memberships` (tarea 4).
- Produces: una membresía `activa` por cada alumno existente. Nada posterior depende de ella salvo que el histórico siga en pie.

- [ ] **Step 1: El pgTAP que falla**

```sql
begin;
select plan(2);

-- Todo alumno con colegio tiene que tener su matricula. Cero excepciones.
select is_empty(
  $$select s.profile_id from public.students s
     where s.school_id is not null
       and not exists (select 1 from public.student_school_memberships m
                        where m.student_id = s.profile_id and m.status = 'activa')$$,
  'ningun alumno matriculado se quedo sin membresia');

-- Y ninguna inventada.
select is_empty(
  $$select m.student_id from public.student_school_memberships m
     where not exists (select 1 from public.students s
                        where s.profile_id = m.student_id)$$,
  'no se invento ninguna membresia');

select * from finish();
rollback;
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `node scripts/db-test.mjs migracion_matriculas`
Expected: FALLA en el primero — los alumnos de Y6A no tienen membresía.

- [ ] **Step 3: La migración**

```sql
-- =============================================================================
-- 0061_migrar_matriculas.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Hoy en produccion hay un superadmin, un colegio demo y los alumnos de Y6A,
-- todos dados de alta POR EL COLEGIO. Su matricula es real y su histórico es
-- correcto; esto solo lo escribe en el sitio donde ahora vive.
--
-- NO se inventan tutores. Un alumno matriculado por el colegio no tiene tutor
-- en el sistema hasta que uno se registre y reclame el vinculo.
insert into public.student_school_memberships
  (student_id, school_id, section_id, starts_on, status, approved_at)
select s.profile_id,
       s.school_id,
       (select sm.section_id from public.section_members sm
         where sm.profile_id = s.profile_id limit 1),
       s.enrolled_at::date,
       'activa',
       s.enrolled_at
from public.students s
where s.school_id is not null
on conflict do nothing;

-- students.school_id se queda: pasa a ser cache de la membresia activa.
alter table public.students alter column school_id drop not null;

comment on column public.students.school_id is
  'Cache denormalizada de la membresia activa (DATA_MODEL §1: evita un join en cada politica RLS). NULL = estudia en casa.';
```

- [ ] **Step 4: Aplicar y verde**

Run: `node scripts/db-apply.mjs migrations && node scripts/db-test.mjs migracion_matriculas`
Expected: los 2 asserts en `ok`.

- [ ] **Step 5: Correr la batería entera antes de seguir**

Run: `node scripts/db-test.mjs`
Expected: los diecisiete ficheros en verde. Es el punto donde la base de datos queda cerrada; si algo se rompió, se rompió aquí y no en la interfaz.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0061_migrar_matriculas.sql supabase/tests/migracion_matriculas.sql
git commit -m "feat(tenencia): los alumnos de Y6A conservan colegio e historico en el modelo nuevo"
```

---

### Task 9: `app.audit()` con actor sin colegio

**Files:**
- Create: `supabase/migrations/0062_audit_actor_sin_colegio.sql`
- Modify: `supabase/tests/immutability.sql`

**Interfaces:**
- Produces: `app.audit()` escribiendo un `school_id` utilizable también cuando el actor no tiene colegio.

Hallazgo abierto en `HANDOFF.md` §6 y señalado en `0025`: `app.audit()` escribe `school_id = app.current_school_id()`, que para un superadmin es NULL, y el visor filtra por colegio. Con tutores —que tampoco tienen colegio— deja de afectar a un solo usuario.

- [ ] **Step 1: El assert que falla**

En `supabase/tests/immutability.sql`, subiendo el `plan` en 1:

```sql
select isnt(
  (select school_id from public.audit_log where actor_id = EL_TUTOR order by created_at desc limit 1),
  null,
  'la accion de un actor sin colegio queda visible en el log de algun colegio');
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `node scripts/db-test.mjs immutability`
Expected: FALLA — la fila se escribe con `school_id` NULL.

- [ ] **Step 3: La migración**

`app.audit()` pasa a recibir el colegio afectado como argumento explícito, con `app.current_school_id()` solo como default. Cuando el actor no tiene colegio, el colegio de la fila es **el de la entidad tocada**, que es el log donde esa acción tiene que verse.

- [ ] **Step 4: Verde**

Run: `node scripts/db-apply.mjs migrations && node scripts/db-test.mjs immutability`
Expected: PASA.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0062_audit_actor_sin_colegio.sql supabase/tests/immutability.sql
git commit -m "fix(auditoria): la accion de quien no tiene colegio deja de escribirse donde nadie la mira"
```

---

### Task 10: Esquemas y acciones del tutor

**Files:**
- Create: `packages/shared/src/schemas/guardian.ts`
- Create: `apps/web/src/lib/data/guardian.ts`
- Modify: `apps/web/src/lib/auth/actions.ts`
- Test: `packages/shared/src/__tests__/guardian-schemas.test.ts`

**Interfaces:**
- Consumes: `app.puede_ver_alumno()` (tarea 5), las tablas de la tarea 4.
- Produces, y las tareas 11–14 las importan con estos nombres exactos:
  - `registrarTutor(prev, formData): Promise<AuthState>`
  - `crearHijo(prev, formData): Promise<AuthState>`
  - `generarEnlaceAcceso(studentId: string): Promise<{ url: string; expiresAt: string }>` — la URL se devuelve **una sola vez**
  - `revocarEnlaceAcceso(linkId: string): Promise<void>`
  - `canjearEnlace(token: string, pin: string): Promise<AuthState>`
  - `solicitarEnganche(studentId: string, schoolId: string): Promise<void>`
  - `listarHijos(): Promise<HijoRow[]>` con `HijoRow = { id, fullName, colegio: string | null, enlaceActivo: boolean }`

- [ ] **Step 1: El test que falla**

```ts
import { describe, expect, it } from "vitest";
import { altaTutor, canjeEnlace } from "../schemas/guardian";

describe("altaTutor", () => {
  it("exige correo valido y contrasena de 12 o mas", () => {
    expect(altaTutor.safeParse({ email: "no-es-correo", password: "x" }).success).toBe(false);
  });
});

describe("canjeEnlace", () => {
  it("rechaza un token que no es opaco de 32 bytes en base64url", () => {
    expect(canjeEnlace.safeParse({ token: "corto", pin: "1234" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `pnpm --filter @cet/shared test guardian-schemas`
Expected: FALLA — el módulo no existe.

- [ ] **Step 3: Escribir los esquemas y las acciones**

El token se genera con `crypto.randomBytes(32).toString("base64url")` y **solo se guarda su hash**; la URL completa se devuelve una vez y no se registra en ningún log. `canjearEnlace` no acepta el token como sesión: lo canjea contra `student_access_links` comprobando `revoked_at is null and expires_at > now()`, y solo entonces pide el PIN a la Edge Function de auth que ya existe.

- [ ] **Step 4: Verde**

Run: `pnpm --filter @cet/shared test guardian-schemas && pnpm typecheck`
Expected: PASA.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/guardian.ts packages/shared/src/__tests__/guardian-schemas.test.ts apps/web/src/lib/data/guardian.ts apps/web/src/lib/auth/actions.ts
git commit -m "feat(tutor): alta, hijos y enlaces de acceso, con el token hasheado y mostrado una sola vez"
```

---

### Task 11: `/register` pasa a ser alta de tutor

**Files:**
- Modify: `apps/web/src/app/(auth)/register/page.tsx`, `apps/web/src/components/auth/RegisterForm.tsx`
- Modify: `apps/web/src/lib/i18n/dictionaries/es.ts`, `.../en.ts`

**Interfaces:**
- Consumes: `registrarTutor` de la tarea 10.

- [ ] **Step 1: Reescribir el formulario**

Deja de pedir colegio y curso; pide nombre, correo y contraseña. El texto explica en una frase que después podrá añadir a sus hijos y, si quiere, conectarlos con su colegio.

- [ ] **Step 2: Las dos traducciones**

Cada clave nueva en `es.ts` y en `en.ts`. AD-7: cero strings a pelo.

- [ ] **Step 3: Verde**

Run: `pnpm typecheck && pnpm lint && pnpm --filter web test`
Expected: PASA.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(auth)/register" apps/web/src/components/auth/RegisterForm.tsx apps/web/src/lib/i18n/dictionaries
git commit -m "feat(alta): quien se registra es el tutor, no el alumno"
```

---

### Task 12: La puerta del enlace en el login del alumno

**Files:**
- Modify: `apps/web/src/components/auth/StudentLoginForm.tsx`, `apps/web/src/app/(auth)/login/student/page.tsx`

**Interfaces:**
- Consumes: `canjearEnlace` de la tarea 10.

La puerta de colegio —tres pasos *colegio → código → PIN*— **se conserva**: hay matrículas que abre el colegio y ese camino sigue siendo válido. Lo que se añade es la puerta del enlace.

- [ ] **Step 1: Detectar el token en la URL**

Con `?t=<token>`, el formulario se salta los pasos 1 y 2: el token ya identifica al niño. Queda **una** pantalla y **un** campo, el PIN. El motivo del diseño de tres pasos que documenta la cabecera del fichero —«un paso, una decisión, un botón grande»— se cumple mejor todavía con uno.

- [ ] **Step 2: Cuántas casillas dibujar**

Sin colegio no hay `pinLengthPrimary`. Se toma la longitud de la ficha del alumno que devuelve el canje, y **no antes**: revelar la etapa del niño a partir del token sería filtrar información sobre un menor, que es exactamente el motivo que la cabecera actual ya da para no hacerlo.

- [ ] **Step 3: Verde**

Run: `pnpm typecheck && pnpm --filter web test`
Expected: PASA.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/auth/StudentLoginForm.tsx "apps/web/src/app/(auth)/login/student"
git commit -m "feat(acceso): el nino entra por el enlace de su tutor con un solo campo"
```

---

### Task 13: La zona del tutor

**Files:**
- Create: `apps/web/src/app/(guardian)/layout.tsx`, `.../hijos/page.tsx`, `.../hijos/[studentId]/page.tsx`
- Modify: `apps/web/src/lib/routes.ts:71` (`PROTECTED_AREAS`), `apps/web/src/components/nav/*`

**Interfaces:**
- Consumes: `listarHijos`, `generarEnlaceAcceso`, `revocarEnlaceAcceso`, `solicitarEnganche` (tarea 10).

- [ ] **Step 1: Cerrar la puerta en las dos capas**

`PROTECTED_AREAS` gana `(guardian)` con rol `guardian`, y el `layout.tsx` repite la comprobación con `requireRole(["guardian"])`. El comentario de `admin/page.tsx` explica por qué se repite: una página puede acabar bajo otro layout tras una refactorización, y esa suposición no debe ser lo único que protege los datos de un menor.

- [ ] **Step 2: Las pantallas**

`hijos/` lista a los hijos con su estado de colegio. `hijos/[studentId]/` da el enlace de acceso (generar, copiar una vez, revocar) y el botón de conectar con un colegio. **Tono de lectura, no de panel**: `modules/admin` §5.1 fija densidad y detalle técnico para staff adulto; un padre no es eso. Ninguna referencia técnica en los errores de esta zona.

- [ ] **Step 3: El texto del consentimiento**

Al conectar con un colegio, el diálogo dice qué verá el colegio y qué no: la actividad sobre el contenido del colegio mientras dure la matrícula; nunca lo que el niño practica en casa. Es el §3.4 del spec en lenguaje de padre, y es revocable.

- [ ] **Step 4: Verde**

Run: `pnpm typecheck && pnpm lint && pnpm --filter web test`
Expected: PASA.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(guardian)" apps/web/src/lib/routes.ts apps/web/src/components/nav apps/web/src/lib/i18n/dictionaries
git commit -m "feat(tutor): mis hijos, su enlace, y un consentimiento que dice lo que el colegio vera"
```

---

### Task 14: La cola de enganche en `/admin`

**Files:**
- Modify: `apps/web/src/app/(staff)/admin/page.tsx`, `apps/web/src/components/staff/AdminPanel.tsx`, `apps/web/src/components/staff/queries.ts`, `apps/web/src/components/staff/actions.ts`

**Interfaces:**
- Consumes: `student_school_memberships` (tarea 4).
- Produces: `aprobarEnganche(membershipId)` y `rechazarEnganche(membershipId, motivo)`, ambas auditadas como `membership.approved` / `membership.rejected`.

- [ ] **Step 1: La consulta**

En `queries.ts`, listar las membresías `solicitada` del colegio. Regla 2 de la cabecera del fichero: el filtro explícito por `school_id` se mantiene aunque la RLS ya lo haga.

- [ ] **Step 2: Las dos acciones, auditadas**

Rechazar exige motivo, igual que `rejectRegistration`. El `audit_log` se escribe **en la misma transacción** que el cambio de estado.

- [ ] **Step 3: Verde**

Run: `pnpm typecheck && pnpm --filter web test staff`
Expected: PASA.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(staff)/admin" apps/web/src/components/staff
git commit -m "feat(panel): el colegio aprueba o rechaza el enganche que pide el tutor"
```

---

### Task 15: El camino completo, de punta a punta

**Files:**
- Create: `apps/web/e2e/tutor-raiz.spec.ts`
- Create: `apps/web/e2e/a11y-guardian.spec.ts`

- [ ] **Step 1: El e2e que demuestra la decisión del §3.4**

```ts
test("el colegio no ve lo que el nino hace en casa", async ({ page }) => {
  // 1. el tutor se registra y crea a su hijo
  // 2. genera el enlace; el nino entra con enlace + PIN y practica
  // 3. el tutor ve la actividad
  // 4. el personal del colegio, SIN matricula, no ve NADA de ese nino
  // 5. el tutor engancha, el colegio aprueba
  // 6. a partir de ahi —y solo a partir de ahi— el colegio ve la actividad de su contenido
});
```

El paso 4 es el que importa. Los otros cinco son el montaje.

- [ ] **Step 2: axe en las pantallas nuevas, en los dos temas**

Run: `pnpm test:e2e`
Expected: cero violaciones en `(guardian)` y en el login por enlace, en claro y en oscuro.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e
git commit -m "test(e2e): el colegio no ve la casa, demostrado ejecutando"
```

---

### Task 16: Descongelar los contratos y avisar

**Files:**
- Modify: `DATA_MODEL.md`, `MASTER_PLAN.md`, `MODULES.md`, `modules/admin/CLAUDE.md`, `modules/analytics/CLAUDE.md`

La cabecera de `DATA_MODEL.md` lo exige literalmente: *«Cambiarlo exige actualizar `MASTER_PLAN.md` y avisar a todas las vías»*. Es una tarea, no papeleo posterior.

- [ ] **Step 1: `DATA_MODEL.md`**

§1 `profiles` (la constraint nueva), `students` (`school_id` nullable y por qué), las tres tablas del §3.2, y §7 `learning_events.school_id` nullable con el significado de NULL.

- [ ] **Step 2: `MASTER_PLAN.md`**

El aviso a las cinco vías del Hito 1, diciendo qué cambia para cada una.

- [ ] **Step 3: Los dos contratos de módulo**

`modules/admin` §3 gana las tres tablas y la cola de enganche. `modules/analytics` §6 gana la regla del sello, y su §5 corrige la frase que hoy contradice a `0053`.

- [ ] **Step 4: Verificación final, entera**

Run: `node scripts/db-test.mjs && pnpm verify`
Expected: los pgTAP en verde y `typecheck + lint + test + build` en verde. **No se declara terminado sin ver esta salida.**

- [ ] **Step 5: Commit**

```bash
git add DATA_MODEL.md MASTER_PLAN.md MODULES.md modules/admin/CLAUDE.md modules/analytics/CLAUDE.md
git commit -m "docs(contratos): el modelo nuevo consta donde se mira, con aviso a las cinco vias"
```

---

## Reparto con DeepSeek

`HANDOFF-DEEPSEEK.md` §0.2: un contrato que toca componentes visibles está mal repartido. La línea cae limpia entre la tarea 9 y la 10.

| Contrato | Tareas | Territorio | Modelo |
|---|---|---|---|
| `ten-clasificar-politicas` | 1 | `scripts/clasificar-politicas.mjs`, `supabase/POLITICAS.md` | `reasoner` |
| `ten-rol-y-constraint` | 2, 3 | `supabase/migrations/0055_*`, `0056_*`, `supabase/tests/rls_tutor.sql`, `packages/shared/src/enums.ts` | `chat` |
| `ten-tablas-tutor` | 4 | `supabase/migrations/0057_*`, `supabase/tests/membresias.sql` | `chat` |
| `ten-eje-autorizacion` | 5, 6 | `supabase/migrations/0058_*`, `0059_*`, `supabase/tests/rls_*.sql` | `reasoner` |
| `ten-evento-sin-colegio` | 7 | `supabase/migrations/0060_*`, `supabase/tests/evento_sin_colegio.sql`, `apps/web/src/app/api/events/**` | `chat` |
| `ten-migrar-matriculas` | 8, 9 | `supabase/migrations/0061_*`, `0062_*`, `supabase/tests/migracion_matriculas.sql`, `supabase/tests/immutability.sql` | `chat` |

`forbidden` en todos: `packages/ui/src/index.ts` y `packages/shared/src/index.ts` — el barril es ajeno siempre (§5.2).

Los territorios de `ten-rol-y-constraint`, `ten-tablas-tutor` y `ten-eje-autorizacion` **se solapan en `supabase/tests/rls_tutor.sql`**, así que no pueden ir en el mismo lote: `--batch` valida que sean disjuntos y se negaría entero. Van en tandas: 1 → (2,3) → 4 → (5,6) → 7 → (8,9).

**Las tareas 10 a 16 no se delegan.** Cinco son de interfaz y las firma quien ve la pantalla; la 16 es criterio sobre contratos congelados.

---

## Autorrevisión

**Cobertura del spec.** §3.1 → tareas 2 y 3. §3.2 → 4. §3.3 → 8. §3.4 → 7. §3.5 → 5. §4 → 1 y 6. §5 → 11, 12, 13, 14. §6 → 8. §7.1–7.4 → 10 y 13. §7.5 → 6. §7.6 → 9. §8 → repartido por tarea, y cerrado en 15. §9 → la tabla de arriba. §10 → los diez criterios tienen tarea.

**Sin marcadores.** Ningún «TBD», ningún «manejar errores», ninguna referencia a una función que no se define en su tarea.

**Consistencia de nombres.** `app.puede_ver_alumno` (5) es la que llaman 6 y 7. `app.colegio_del_evento` (7) es la que llama la ruta de ingesta. Los siete nombres de la tarea 10 son los que importan 11–14, escritos igual en los dos sitios.

**Hueco que se cierra aquí:** el spec §7.2 pide que cada canje de enlace se registre. Va en la tarea 10, dentro de `canjearEnlace`, escribiendo `last_used_at` y una entrada de auditoría.
