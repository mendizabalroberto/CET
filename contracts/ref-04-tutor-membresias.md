---
id: ref-04-tutor-membresias
model: reasoner
territory: [supabase/migrations/0057_tutor_y_membresias.sql, supabase/tests/membresias.sql]
forbidden: [packages/ui/src/index.ts, packages/shared/src/enums.ts, supabase/migrations/0055_rol_guardian.sql, supabase/migrations/0056_profiles_alcance_por_rol.sql]
context: [supabase/migrations/0002_enums.sql, supabase/migrations/0005_curriculum.sql, supabase/migrations/0012_rls_policies.sql, supabase/tests/rls_tutor.sql, docs/superpowers/plans/2026-08-28-refundacion-tenencia.md]
verify: node scripts/db-apply.mjs migrations && node scripts/db-test.mjs membresias
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 4
deadline: 4 rondas o 30 min
---

## 1 · El problema

La tenencia del alumno deja de ser una columna (`students.school_id`) y pasa a
ser una relación con fechas (`student_school_memberships`). Además, hace falta
una tabla que vincule tutor e hijo, y otra para los enlaces de acceso que el
tutor genera.

## 2 · La evidencia que ya tenemos

El plan `docs/superpowers/plans/2026-08-28-refundacion-tenencia.md` define tres
tablas:

1. `public.guardian_students`: vínculo tutor-hijo.
2. `public.student_school_memberships`: matrícula con fechas y EXCLUDE para
   evitar dos membresías activas solapadas.
3. `public.student_access_links`: token hasheado, caducidad, revocación.

También define el enum `public.membership_status`:
`('solicitada', 'activa', 'rechazada', 'terminada')`.

El pgTAP inicial debe comprobar:
- Existen las tablas `guardian_students` y `student_school_memberships`.
- Una matrícula activa entra.
- Dos matrículas activas solapadas son imposibles (error `23P01`).

## 3 · El criterio de aceptación

`node scripts/db-apply.mjs migrations && node scripts/db-test.mjs membresias`
sale en verde. Para eso:

1. `supabase/migrations/0057_tutor_y_membresias.sql` crea:
   - `public.membership_status` enum.
   - `public.guardian_students` con PK `(guardian_id, student_id)`, RLS
     habilitada, índice por `student_id`, y `on delete cascade` en ambas FK.
   - `public.student_school_memberships` con `id` UUID PK, RLS habilitada,
     EXCLUDE usando `btree_gist` que impida solapamiento de membresías `activa`,
     y `on delete cascade` en `student_id`, `on delete restrict` en `school_id`,
     `on delete set null` en `section_id`.
   - `public.student_access_links` con `token_hash` unique, RLS habilitada,
     índice por `student_id`, y `on delete cascade` en `student_id` y
     `created_by`.
2. Todas las tablas tienen RLS habilitada.
3. `supabase/tests/membresias.sql` pasa los 4 asserts iniciales del plan.
4. Ningún fichero fuera del territorio se toca.

## 4 · Qué NO cuenta como resuelto

- Una membresía activa solapada que la base de datos permita.
- Tablas sin RLS habilitada.
- FK sin `on delete` explícito.
- Guardar el token en claro en `student_access_links`: debe guardarse hasheado.
- Tocar los ficheros de la tarea 3 (`0056`, `rls_tutor.sql`) o la tarea 2
  (`0055`).
