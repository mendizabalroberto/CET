---
id: ref-06-rls-datos-alumno
model: reasoner
territory: [supabase/migrations/0059_rls_datos_de_alumno.sql, supabase/tests/rls_tenant_isolation.sql, supabase/tests/rls_student_cannot_read_peers.sql]
forbidden: [packages/ui/src/index.ts, packages/shared/src/enums.ts, supabase/migrations/0055_rol_guardian.sql, supabase/migrations/0056_profiles_alcance_por_rol.sql, supabase/migrations/0057_tutor_y_membresias.sql, supabase/migrations/0058_puede_ver_alumno.sql]
context: [supabase/migrations/0012_rls_policies.sql, supabase/POLITICAS.md, supabase/tests/rls_tutor.sql, supabase/tests/informes_alumno.sql, docs/superpowers/plans/2026-08-28-refundacion-tenencia.md]
verify: node scripts/db-apply.mjs migrations && node scripts/db-test.mjs rls
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 5
deadline: 5 rondas o 40 min
---

## 1 · El problema

Las políticas de RLS sobre datos de alumno todavía comparan colegios a mano con
`app.current_school_id()`. Ese patrón devuelve NULL silencioso cuando el actor no
tiene colegio, y no sabe del tutor. Hay que reescribirlas para que cuelguen de
`app.puede_ver_alumno()`.

## 2 · La evidencia que ya tenemos

`supabase/POLITICAS.md` (creado en el contrato `ref-01-clasificar-politicas`)
marca con `reescrita` las políticas sobre tablas de datos de alumno:
`profiles`, `students`, `learning_events`, `skill_mastery`, `exam_attempts`,
`attempt_items`, `attempt_responses`, `attempt_gradings`.

La forma nueva, idéntica para todas, es:

```sql
drop policy if exists students_select_staff on public.students;
create policy students_select_staff on public.students
  for select to authenticated
  using ((select app.puede_ver_alumno(profile_id)));
```

`audit_log` NO se toca: su alcance es el colegio del actor.

El plan añade un assert a `supabase/tests/rls_tenant_isolation.sql`:

```sql
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

## 3 · El criterio de aceptación

`node scripts/db-apply.mjs migrations && node scripts/db-test.mjs rls` sale en
verde. Para eso:

1. `supabase/migrations/0059_rls_datos_de_alumno.sql` contiene, para cada
   política marcada `reescrita` en `supabase/POLITICAS.md`, un par
   `drop policy if exists ...` + `create policy ...` que use
   `(select app.puede_ver_alumno(<columna_de_student_id>))`.
2. La llamada va envuelta en `(select ...)` para que Postgres la evalúe una vez
   por sentencia.
3. El `with check` de las políticas INSERT se conserva; no se relaja.
4. `supabase/tests/rls_tenant_isolation.sql` incluye el assert que detecta
   políticas que aún usan `current_school_id` a mano.
5. `supabase/tests/rls_student_cannot_read_peers.sql` sigue pasando.
6. Ningún fichero fuera del territorio se toca.

## 4 · Qué NO cuenta como resuelto

- Reescribir políticas de contenido/currículo (marcadas `intacta`).
- Tocar `audit_log`.
- Dejar una política de datos de alumno con `current_school_id` fuera de
  `puede_ver_alumno`.
- Olvidar el `(select ...)` alrededor de `app.puede_ver_alumno`.
- Relajar el `with check` de INSERT.
