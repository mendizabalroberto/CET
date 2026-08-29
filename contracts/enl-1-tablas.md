---
id: enl-1-tablas
model: reasoner
territory: [supabase/migrations/0065_invitaciones_y_dispositivos.sql, supabase/tests/invitaciones_y_dispositivos.sql]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, supabase/migrations/0057_tutor_y_membresias.sql]
context: [supabase/migrations/0057_tutor_y_membresias.sql, supabase/migrations/0013_grants.sql, supabase/migrations/0058_puede_ver_alumno.sql, docs/superpowers/specs/2026-08-29-alta-por-enlace-design.md]
verify: node scripts/db-apply.mjs migrations && node scripts/db-test.mjs invitaciones_y_dispositivos
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 4
deadline: 4 rondas o 30 min
---

## 1 · El problema

Faltan dos tablas: `guardian_invites` (el enlace con el que un tutor se da de
alta) y `student_devices` (el dispositivo que un alumno ya canjeó). Las dos
guardan un secreto, y las dos deben guardarlo **hasheado**.

## 2 · La evidencia que ya tenemos

`supabase/migrations/0057_tutor_y_membresias.sql` ya creó `student_access_links`
con exactamente esta disciplina: `token_hash text not null unique`, RLS
habilitada, índice por la entidad. Cópiala.

`supabase/migrations/0013_grants.sql` retira `SELECT` sobre `students.pin_hash`
a `authenticated` y a `anon` **con un grant por columna**, no solo con una
política. Ese es el patrón que hay que repetir sobre `guardian_invites.token_hash`
y sobre `student_devices.device_hash`.

`app.puede_ver_alumno(uuid)` existe desde `0058` y es la función que decide si
un tutor puede ver los datos de un alumno.

El spec §4.1 y §4.2 fija las columnas exactas. `student_devices` referencia
`public.student_access_links(id)` en `created_from_link`.

## 3 · El criterio de aceptación

`node scripts/db-apply.mjs migrations && node scripts/db-test.mjs invitaciones_y_dispositivos`
en verde, con `supabase/tests/invitaciones_y_dispositivos.sql` declarando
`plan(8)`:

1. `has_table('public','guardian_invites')`.
2. `has_table('public','student_devices')`.
3. RLS habilitada en `guardian_invites` (`pg_class.relrowsecurity`).
4. RLS habilitada en `student_devices`.
5. `col_is_unique` sobre `guardian_invites.token_hash`.
6. `col_is_unique` sobre `student_devices.device_hash`.
7. `has_column_privilege('authenticated','public.guardian_invites','token_hash','SELECT')`
   es **falso**.
8. `has_column_privilege('authenticated','public.student_devices','device_hash','SELECT')`
   es **falso**.

Cada fichero de prueba trae su propio `begin; … rollback;`: nada de lo que
siembre sobrevive.

## 4 · Qué NO cuenta como resuelto

- Guardar un token en claro en cualquiera de las dos tablas.
- Tablas sin RLS habilitada.
- Proteger el hash solo con una política y no con `grant` por columna: una
  política se reescribe mal, un grant por columna lo impide el motor.
- FK sin `on delete` explícito.
- Un `plan(N)` que no cuadre con los asserts escritos: pgTAP lo canta en la
  última línea y el corredor lo trata como fallo.
- Tocar `0057`, que ya está aplicada.
