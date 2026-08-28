---
id: ref-05-puede-ver-alumno
model: reasoner
territory: [supabase/migrations/0058_puede_ver_alumno.sql, supabase/tests/rls_tutor.sql]
forbidden: [packages/ui/src/index.ts, packages/shared/src/enums.ts, supabase/migrations/0055_rol_guardian.sql, supabase/migrations/0056_profiles_alcance_por_rol.sql, supabase/migrations/0057_tutor_y_membresias.sql]
context: [supabase/migrations/0002_enums.sql, supabase/migrations/0012_rls_policies.sql, supabase/migrations/0053_informes_alumno.sql, supabase/tests/rls_tutor.sql, supabase/tests/informes_alumno.sql, docs/superpowers/plans/2026-08-28-refundacion-tenencia.md]
verify: node scripts/db-apply.mjs migrations && node scripts/db-test.mjs rls_tutor && node scripts/db-test.mjs informes_alumno
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 4
deadline: 4 rondas o 30 min
---

## 1 · El problema

El eje de autorización sobre datos de alumno pasa de
`school_id = app.current_school_id()` a una función única:
`app.puede_ver_alumno(p_student_id uuid) returns boolean`. Debe devolver `true`
por cuatro caminos y `false` (nunca NULL) en cualquier otro caso.

## 2 · La evidencia que ya tenemos

El plan define:

```sql
create or replace function app.puede_ver_alumno(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() = p_student_id
    or exists (
      select 1 from public.guardian_students gs
      where gs.guardian_id = auth.uid()
        and gs.student_id = p_student_id
        and gs.revoked_at is null)
    or (app.is_staff() and exists (
      select 1 from public.student_school_memberships m
      where m.student_id = p_student_id
        and m.school_id = app.current_school_id()
        and m.status = 'activa'
        and m.starts_on <= current_date
        and (m.ends_on is null or m.ends_on > current_date)))
    or app.is_superadmin(),
    false);
$$;
```

Y reescribe `app.puede_ver_informe(p_student_id uuid) returns void` para que
llame a `app.puede_ver_alumno()` y lance una excepción si es falso.

El pgTAP `supabase/tests/rls_tutor.sql` debe ampliarse a 7 asserts y comprobar:
- El tutor ve a su hijo.
- El tutor NO ve a un niño ajeno.
- La función devuelve `false`, no NULL.

## 3 · El criterio de aceptación

`node scripts/db-apply.mjs migrations && node scripts/db-test.mjs rls_tutor && node scripts/db-test.mjs informes_alumno`
sale en verde. Para eso:

1. `supabase/migrations/0058_puede_ver_alumno.sql` crea:
   - `app.puede_ver_alumno(uuid)` con `security definer`, `stable`,
     `set search_path = ''`, y `coalesce(..., false)` al final.
   - `app.puede_ver_informe(uuid)` reescrita para usar
     `app.puede_ver_alumno()`.
   - Grants a `authenticated` y `service_role`; revoke a `public`.
2. `supabase/tests/rls_tutor.sql` se amplía a `plan(7)` con los 4 asserts
   adicionales del plan.
3. `node scripts/db-test.mjs informes_alumno` sigue pasando: la reescritura
   conserva el requisito.
4. Ningún fichero fuera del territorio se toca.

## 4 · Qué NO cuenta como resuelto

- Que `puede_ver_alumno` devuelva NULL en algún caso.
- Olvidar `set search_path = ''` o `security definer`.
- Que `puede_ver_informe` siga comparando colegios a mano.
- Tocar las migraciones 0055, 0056 o 0057.
