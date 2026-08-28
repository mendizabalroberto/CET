---
id: ref-03-profiles-alcance
model: chat
territory: [supabase/migrations/0056_profiles_alcance_por_rol.sql, supabase/tests/rls_tutor.sql]
forbidden: [packages/ui/src/index.ts, packages/shared/src/enums.ts, supabase/migrations/0055_rol_guardian.sql]
context: [supabase/migrations/0002_enums.sql, supabase/migrations/0012_rls_policies.sql, docs/superpowers/plans/2026-08-28-refundacion-tenencia.md]
verify: node scripts/db-apply.mjs migrations && node scripts/db-test.mjs rls_tutor
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 4
deadline: 4 rondas o 20 min
---

## 1 · El problema

La constraint actual de `public.profiles` es binaria: o eres `superadmin` y no
tienes colegio, o tienes colegio. Con el rol `guardian` y con alumnos que
estudian en casa, hacen falta cuatro combinaciones legítimas y una sola
prohibida: el personal (`school_admin`, `teacher`) sin colegio.

## 2 · La evidencia que ya tenemos

El plan `docs/superpowers/plans/2026-08-28-refundacion-tenencia.md` define la
nueva constraint `profiles_alcance_por_rol`:

```sql
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
```

Y el pgTAP inicial en `supabase/tests/rls_tutor.sql` debe comprobar:
- Un tutor puede existir sin colegio.
- Un alumno puede existir sin colegio.
- Un profesor sin colegio sigue siendo imposible.

## 3 · El criterio de aceptación

`node scripts/db-apply.mjs migrations && node scripts/db-test.mjs rls_tutor`
sale en verde con los 3 asserts iniciales. Para eso:

1. `supabase/migrations/0056_profiles_alcance_por_rol.sql` existe, elimina la
constraint vieja `profiles_superadmin_has_no_school` si existe, y crea
`profiles_alcance_por_rol` con la forma del plan.
2. `supabase/tests/rls_tutor.sql` existe, comienza con `begin;`, declara
`select plan(3);`, inserta un tutor sin colegio, un alumno sin colegio,
intenta insertar un profesor sin colegio y espera el error `23514`, y termina
con `select * from finish(); rollback;`.
3. La migración aplica contra una base limpia sin errores.
4. Ningún fichero fuera del territorio se toca.

## 4 · Qué NO cuenta como resuelto

- Permitir que el personal (`school_admin`, `teacher`) exista sin colegio.
- Modificar `0002_enums.sql` u otros ficheros de enum.
- Usar `before`/`after` en el `alter type` de `guardian`: este contrato asume
que `0055_rol_guardian.sql` ya existe en el árbol con `guardian` apendizado al
final.
- Un test que no empiece con `plan(3)` y termine con `finish()`.
