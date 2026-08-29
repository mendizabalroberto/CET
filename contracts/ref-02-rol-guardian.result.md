# Resultado - ref-02-rol-guardian
- Contrato: `contracts/ref-02-rol-guardian.md`
- Modelo: deepseek-chat
- Desenlace: **verde**
- Rondas consumidas: 1 de 3
- Rama: `deepseek/ref-02-rol-guardian`
- Duracion: 28.8 s
## Diff

~~~diff
diff --git a/packages/shared/src/enums.ts b/packages/shared/src/enums.ts
index 2142117..7b437b8 100644
--- a/packages/shared/src/enums.ts
+++ b/packages/shared/src/enums.ts
@@ -10,7 +10,7 @@
 import { z } from "zod";
 
 /** Roles del sistema. Un superadmin NO pertenece a ningún colegio (ver constraint en profiles). */
-export const userRole = z.enum(["superadmin", "school_admin", "teacher", "student"]);
+export const userRole = z.enum(["superadmin", "school_admin", "teacher", "student", "guardian"]);
 export type UserRole = z.infer<typeof userRole>;
 
 export const profileStatus = z.enum(["pending", "active", "suspended"]);
diff --git a/supabase/migrations/0055_rol_guardian.sql b/supabase/migrations/0055_rol_guardian.sql
new file mode 100644
index 0000000..c599a8b
--- /dev/null
+++ b/supabase/migrations/0055_rol_guardian.sql
@@ -0,0 +1,14 @@
+-- =============================================================================
+-- 0055_rol_guardian.sql — nuevo rol `guardian`
+-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
+-- Contrato: packages/shared/src/enums.ts
+-- =============================================================================
+-- La refundación de la tenencia introduce al tutor (`guardian`) como rol del
+-- sistema. Se apenda al FINAL del enum `public.user_role` a propósito: en
+-- Postgres el orden de declaración de un enum ES su orden de comparación, y
+-- reordenar los miembros existentes cambiaría el significado de cualquier
+-- `order by` ya escrito. `alter type ... add value` sin `before`/`after` es la
+-- única forma de ampliar un enum sin tocar el `create type` original.
+-- =============================================================================
+
+alter type public.user_role add value if not exists 'guardian';

~~~

## Salida final de `grep -q 'guardian' packages/shared/src/enums.ts && grep -q 'guardian' supabase/migrations/0055_rol_guardian.sql && pnpm --filter @cet/shared test enum-parity`

~~~

> @cet/shared@0.1.0 test D:\.cet-worktrees\ref-02-rol-guardian\packages\shared
> vitest run "enum-parity"


 RUN  v2.1.9 D:/.cet-worktrees/ref-02-rol-guardian/packages/shared

 ✓ src/__tests__/enum-parity.test.ts (21 tests) 3ms

 Test Files  1 passed (1)
      Tests  21 passed (21)
   Start at  15:53:52
   Duration  667ms (transform 106ms, setup 0ms, collect 249ms, tests 3ms, environment 0ms, prepare 76ms)


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.