---
id: ref-02-rol-guardian
model: chat
territory: [supabase/migrations/0055_rol_guardian.sql, packages/shared/src/enums.ts]
forbidden: [packages/ui/src/index.ts, supabase/migrations/0012_rls_policies.sql]
context: [packages/shared/src/__tests__/enum-parity.test.ts, supabase/migrations/0002_enums.sql, packages/shared/src/enums.ts]
verify: pnpm --filter @cet/shared test enum-parity
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 3
deadline: 3 rondas o 15 min
---

## 1 · El problema

La refundación de la tenencia introduce al tutor (`guardian`) como rol del
sistema. Hoy `public.user_role` declara cuatro miembros y TypeScript declara los
mismos cuatro en `packages/shared/src/enums.ts`. Hay que añadir `guardian` en
ambos lados del contrato, sin romper el orden de comparación del enum.

## 2 · La evidencia que ya tenemos

`packages/shared/src/__tests__/enum-parity.test.ts` lee todas las migraciones,
extrae `create type public.user_role as enum (...)` y aplica los
`alter type ... add value` posteriores. Luego compara el resultado con
`[...userRole.options]`. El orden importa.

`supabase/migrations/0002_enums.sql` declara:

```sql
create type public.user_role as enum ('superadmin', 'school_admin', 'teacher', 'student');
```

`packages/shared/src/enums.ts` declara:

```ts
export const userRole = z.enum(["superadmin", "school_admin", "teacher", "student"]);
```

## 3 · El criterio de aceptación

`pnpm --filter @cet/shared test enum-parity` pasa en verde. Para eso:

1. `packages/shared/src/enums.ts` incluye `'guardian'` al final de `userRole`.
2. `supabase/migrations/0055_rol_guardian.sql` existe y hace:
   ```sql
   alter type public.user_role add value if not exists 'guardian';
   ```
3. El miembro va al final en ambos lados; no se usa `before` ni `after`.
4. La migración tiene cabecera con copyright, comentario que explica por qué va
al final, y ninguna dependencia de tablas nuevas.

## 4 · Qué NO cuenta como resuelto

- Insertar `guardian` en medio del enum: cambiaría el orden de comparación en
Postgres y el test lo rechaza explícitamente.
- Modificar `0002_enums.sql`: los enums vivos se amplían con `alter type`, no
reescribiendo el `create type` original.
- Un `userRole` modificado sin la migración, o viceversa: el test de paridad
falla.
- Tocar otros enums o ficheros fuera del territorio.
