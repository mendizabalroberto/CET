# Planes de estudio — plan de ejecución por lotes

Spec: `docs/superpowers/specs/2026-09-02-planes-de-estudio-design.md`.
Método: contratos DeepSeek con territorios disjuntos, lanzados en paralelo con
`node scripts/deepseek/run-contract.mjs --batch …`; el humano/controlador
consolida cada lote en `navegacion/materias` antes de abrir el siguiente.

## Lote 1 — cimientos (sin pantalla)

| Contrato | Territorio | Modelo | Verifica |
|---|---|---|---|
| `plan-1-migracion` | `supabase/migrations/0091_*`, `supabase/tests/plan_de_estudio.sql` | reasoner | `node scripts/db-test.mjs plan_de_estudio` |
| `plan-2-calendario` | `supabase/migrations/0092_*`, `supabase/seed/calendario_2026.sql`, `supabase/tests/calendario_escolar.sql` | chat | `node scripts/db-test.mjs calendario_escolar` |
| `plan-3-repartidor` | `packages/engine/src/plan/repartir*` | reasoner | typecheck + vitest `src/plan` |
| `plan-4-extraccion` | `apps/web/src/lib/plan/boletin*` | chat | typecheck + vitest |
| `plan-5-estratega` | `apps/web/src/lib/plan/estratega*` | chat | typecheck + vitest |
| `plan-6-deepseek` | `apps/web/src/lib/plan/deepseek*` | chat | typecheck + vitest |

Andamiaje escrito por el controlador antes del lote: `packages/engine/src/plan/tipos.ts`,
`apps/web/src/lib/plan/tipos.ts`, fixture `apps/web/src/lib/plan/__fixtures__/leo-boletin.txt`.

## Lote 2 — el camino (tras consolidar el 1)

- Acciones de servidor del tutor: subir → extraer → confirmar → generar (§7, §8).
- Consultas del plan (inventario por materia, lecciones completadas, minutos observados).
- Pantalla del tutor en `/tutor/hijos/[id]` (§7) — visual: no delegable a DeepSeek sin capturas.
- `/learn/hoy` (§10).
- Cron `/api/plan/parte-diario` + `vercel.json` (§11).
- Playwright (§12) con DeepSeek mockeado.
