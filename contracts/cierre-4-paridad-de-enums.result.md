# Resultado - cierre-4-paridad-de-enums
- Contrato: `contracts/cierre-4-paridad-de-enums.md`
- Modelo: deepseek-chat
- Desenlace: **rojo**
- Rondas consumidas: 3 de 3
- Rama: `deepseek/cierre-4-paridad-de-enums`
- Duracion: 59.6 s
## Salida final de `pnpm --filter @cet/shared exec vitest run src/__tests__/enum-parity.test.ts`

~~~

[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/cierre-4-paridad-de-enums/packages/shared[39m

 [31m❯[39m src/__tests__/enum-parity.test.ts [2m([22m[2m21 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[90m 7[2mms[22m[39m
[31m   [31m×[31m paridad de enums TypeScript <-> Postgres[2m > [22mno hay enums en el SQL que TypeScript desconozca[90m 4[2mms[22m[31m[39m
[31m     → estos tipos existen en Postgres pero no en @cet/shared: membership_status: expected [ 'membership_status' ] to deeply equal [][39m

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m20 passed[39m[22m[90m (21)[39m
[2m   Start at [22m 11:09:01
[2m   Duration [22m 313ms[2m (transform 35ms, setup 0ms, collect 69ms, tests 7ms, environment 0ms, prepare 96ms)[22m

undefined
D:\.cet-worktrees\cierre-4-paridad-de-enums\packages\shared:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/__tests__/enum-parity.test.ts
[31m⎯⎯⎯⎯⎯⎯⎯[1m[7m Failed Tests 1 [27m[22m⎯⎯⎯⎯⎯⎯⎯[39m

[31m[1m[7m FAIL [27m[22m[39m src/__tests__/enum-parity.test.ts[2m > [22mparidad de enums TypeScript <-> Postgres[2m > [22mno hay enums en el SQL que TypeScript desconozca
[31m[1mAssertionError[22m: estos tipos existen en Postgres pero no en @cet/shared: membership_status: expected [ 'membership_status' ] to deeply equal [][39m

[32m- Expected[39m
[31m+ Received[39m

[32m- Array [][39m
[31m+ Array [[39m
[31m+   "membership_status",[39m
[31m+ ][39m

[36m [2m❯[22m src/__tests__/enum-parity.test.ts:[2m209:7[22m[39m
    [90m207| [39m      orphans[33m,[39m
    [90m208| [39m      [32m`estos tipos existen en Postgres pero no en @cet/shared: [39m[36m${[39morpha…
    [90m209| [39m    )[33m.[39m[34mtoEqual[39m([])[33m;[39m
    [90m   | [39m      [31m^[39m
    [90m210| [39m  })[33m;[39m
    [90m211| [39m})[33m;[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.