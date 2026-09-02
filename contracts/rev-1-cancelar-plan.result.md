# Resultado - rev-1-cancelar-plan
- Contrato: `contracts/rev-1-cancelar-plan.md`
- Modelo: deepseek-chat
- Desenlace: **rojo**
- Rondas consumidas: 4 de 4
- Rama: `deepseek/rev-1-cancelar-plan`
- Duracion: 68.3 s
## Salida final de `pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint src/lib/plan && pnpm --filter @cet/web exec vitest run src/lib/plan`

~~~

> @cet/web@0.1.0 typecheck D:\.cet-worktrees\rev-1-cancelar-plan\apps\web
> tsc --noEmit

src/lib/plan/acciones.puras.ts(102,21): error TS2304: Cannot find name 'z'.
src/lib/plan/acciones.puras.ts(103,24): error TS2304: Cannot find name 'z'.
src/lib/plan/acciones.puras.ts(118,24): error TS2304: Cannot find name 'z'.
src/lib/plan/acciones.puras.ts(119,24): error TS2304: Cannot find name 'z'.
src/lib/plan/acciones.ts(28,10): error TS2300: Duplicate identifier 'hitoMasCercano'.
src/lib/plan/acciones.ts(28,26): error TS2300: Duplicate identifier 'leerNotasCorregidas'.
src/lib/plan/acciones.ts(28,47): error TS2300: Duplicate identifier 'leerPesos'.
src/lib/plan/acciones.ts(53,3): error TS2300: Duplicate identifier 'hitoMasCercano'.
src/lib/plan/acciones.ts(56,3): error TS2300: Duplicate identifier 'leerNotasCorregidas'.
src/lib/plan/acciones.ts(57,3): error TS2300: Duplicate identifier 'leerPesos'.
D:\.cet-worktrees\rev-1-cancelar-plan\apps\web:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @cet/web@0.1.0 typecheck: `tsc --noEmit`
Exit status 2

~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.