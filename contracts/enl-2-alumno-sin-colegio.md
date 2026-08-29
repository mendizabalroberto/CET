---
id: enl-2-alumno-sin-colegio
model: reasoner
territory: [supabase/migrations/0066_alumno_sin_colegio.sql, supabase/migrations/0067_evento_y_audit_sin_colegio.sql, supabase/tests/alumno_sin_colegio.sql]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, supabase/migrations/0060_quitar_alcance_por_rol.sql]
context: [supabase/migrations/0003_tenancy.sql, supabase/migrations/0011_audit.sql, supabase/migrations/0022_fix_inert_guards.sql, supabase/migrations/0024_learning_events_ingest.sql, supabase/migrations/0060_quitar_alcance_por_rol.sql, supabase/tests/escrituras_de_perfil.sql]
verify: node scripts/db-apply.mjs migrations && node scripts/db-test.mjs alumno_sin_colegio
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 4
deadline: 4 rondas o 30 min
---

## 1 · El problema

Un alumno creado por su tutor no tiene colegio, y hoy la base lo impide en tres
sitios: `students.school_id` es `not null`, la unicidad del código se apoya en
un `school_id` que sería NULL, y `app.audit()` levanta una excepción cuando el
actor es un tutor.

## 2 · La evidencia que ya tenemos

`0003_tenancy.sql:164` declara `school_id uuid not null` en `students`, y
`students_code_uniq` es `unique (school_id, student_code)`. En Postgres dos NULL
son **distintos entre sí**, así que con `school_id` nulo esa constraint deja
entrar códigos repetidos: hace falta además un índice único parcial.

`0022_fix_inert_guards.sql:210` define `app.audit()`. Su guard es:

    if app.is_app_user() and not (app.is_staff() or app.is_superadmin()) then
      raise exception 'Solo el personal del colegio escribe en el audit_log'

Un `guardian` es `app.is_app_user()` y no es staff, así que **hoy un tutor no
puede auditar ni sus propias acciones**. `audit_log.school_id` ya es nullable
(`0011_audit.sql:27`), así que la columna no es el problema: lo es el guard.

`0060_quitar_alcance_por_rol.sql` retiró `profiles_alcance_por_rol` y dejó
escrito por qué: la aplicación seguía escribiendo `school_id` en alumnos. Su
cabecera dice que la constraint vuelve «EN LA MISMA TANDA que la migración de
los datos y que el código que los lee». Esta es esa tanda.

## 3 · El criterio de aceptación

`node scripts/db-apply.mjs migrations && node scripts/db-test.mjs alumno_sin_colegio`
en verde, con `plan(7)`:

1. `col_is_null('public','students','school_id')`.
2. Dos alumnos sin colegio con el MISMO `student_code` fallan con `23505`.
3. Dos alumnos sin colegio con códigos distintos entran (`lives_ok`).
4. `col_is_null('public','learning_events','school_id')`.
5. `has_function('app','colegio_del_evento', array['uuid'])`.
6. Un `profiles` con `role='guardian'` y `school_id` no nulo falla con `23514`.
7. `app.colegio_del_evento()` sobre un alumno sin membresía activa devuelve NULL.

`0066` hace: `alter table public.students alter column school_id drop not null`;
`create unique index students_code_sin_colegio_uniq on public.students
(student_code) where school_id is null`; y devuelve `profiles_alcance_por_rol`
tal y como la declaró `0056`, esta vez **sin** `not valid`.

`0067` hace: `learning_events.school_id` nullable;
`app.colegio_del_evento(p_student_id uuid) returns uuid` como `security definer`
con `set search_path = ''`, que devuelve el `school_id` de la membresía `activa`
vigente hoy o NULL; y amplía el guard de `app.audit()` para que un `guardian`
pueda escribir entradas cuyo `entity_id` sea NULL, él mismo, o un alumno para el
que `app.puede_ver_alumno()` sea cierto.

## 4 · Qué NO cuenta como resuelto

- Quitar el guard de `app.audit()` en vez de acotarlo: dejaría que cualquier
  alumno llenase el log de auditoría, que es justo el fallo que `0022` cerró.
- Un índice único no parcial sobre `student_code`: rompería a los alumnos de
  colegio, cuyo código solo es único dentro de su colegio.
- Devolver `profiles_alcance_por_rol` con `not valid`: es lo que dejó `0056`
  inservible y lo que `0060` tuvo que retirar.
- Una función sin `set search_path = ''` siendo `security definer`.
- Tocar `0060`, que ya está aplicada.
- Escribir la migración de datos (el borrado del alumno de prueba): no es tuya.
