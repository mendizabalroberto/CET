# Resultado - corpus-2-guarda-transcripciones
- Contrato: `contracts/corpus-2-guarda-transcripciones.md`
- Modelo: deepseek-chat
- Desenlace: **rojo**
- Rondas consumidas: 3 de 3
- Rama: `deepseek/corpus-2-guarda-transcripciones`
- Duracion: 86.8 s
## Salida final de `pnpm --filter @cet/content test`

~~~

> @cet/content@0.1.0 test D:\.cet-worktrees\corpus-2-guarda-transcripciones\packages\content
> vitest run


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/corpus-2-guarda-transcripciones/packages/content[39m

 [32m✓[39m __tests__/js-literal.test.ts [2m([22m[2m42 tests[22m[2m)[22m[90m 7[2mms[22m[39m
 [32m✓[39m __tests__/sanitize.test.ts [2m([22m[2m57 tests[22m[2m)[22m[90m 17[2mms[22m[39m
 [32m✓[39m __tests__/skill-parity.test.ts [2m([22m[2m3 tests[22m[2m)[22m[90m 2[2mms[22m[39m
 [32m✓[39m __tests__/extract.test.ts [2m([22m[2m43 tests[22m[2m)[22m[90m 21[2mms[22m[39m
 [32m✓[39m __tests__/corpus-transcripts.test.ts [2m([22m[2m7 tests[22m[2m)[22m[90m 191[2mms[22m[39m
 [32m✓[39m __tests__/blueprint-params.test.ts [2m([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m __tests__/corpus-pdf.test.ts [2m([22m[2m10 tests[22m[2m)[22m[33m 692[2mms[22m[39m
 [32m✓[39m __tests__/corpus.test.ts [2m([22m[2m33 tests[22m[2m)[22m[33m 679[2mms[22m[39m
   [33m[2m✓[22m[39m inventory[2m > [22musa la transcripcion cuando el texto de un PDF resulta ser decorativo [33m437[2mms[22m[39m
 [32m✓[39m __tests__/pipeline.test.ts [2m([22m[2m48 tests[22m[2m)[22m[33m 929[2mms[22m[39m

[2m Test Files [22m [1m[32m9 passed[39m[22m[90m (9)[39m
[2m      Tests [22m [1m[32m247 passed[39m[22m[90m (247)[39m
[2m   Start at [22m 11:10:58
[2m   Duration [22m 1.98s[2m (transform 738ms, setup 0ms, collect 2.74s, tests 2.54s, environment 1ms, prepare 765ms)[22m

[90mstderr[2m | __tests__/corpus-pdf.test.ts
[22m[39mWarning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.

[90mstderr[2m | __tests__/corpus-pdf.test.ts
[22m[39mWarning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.

[90mstderr[2m | __tests__/corpus-pdf.test.ts
[22m[39mWarning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.

[90mstderr[2m | __tests__/corpus-pdf.test.ts
[22m[39mWarning: TT: undefined function: 32


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.