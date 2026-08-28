# Resultado - corpus-1-pdf-restos
- Contrato: `contracts/corpus-1-pdf-restos.md`
- Modelo: deepseek-chat
- Desenlace: **rojo**
- Rondas consumidas: 3 de 3
- Rama: `deepseek/corpus-1-pdf-restos`
- Duracion: 61.8 s
## Salida final de `pnpm --filter @cet/content test`

~~~

> @cet/content@0.1.0 test D:\.cet-worktrees\corpus-1-pdf-restos\packages\content
> vitest run


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/corpus-1-pdf-restos/packages/content[39m

 [32m✓[39m __tests__/js-literal.test.ts [2m([22m[2m42 tests[22m[2m)[22m[90m 9[2mms[22m[39m
 [32m✓[39m __tests__/sanitize.test.ts [2m([22m[2m57 tests[22m[2m)[22m[90m 16[2mms[22m[39m
 [32m✓[39m __tests__/skill-parity.test.ts [2m([22m[2m3 tests[22m[2m)[22m[90m 2[2mms[22m[39m
 [32m✓[39m __tests__/extract.test.ts [2m([22m[2m43 tests[22m[2m)[22m[90m 16[2mms[22m[39m
 [32m✓[39m __tests__/blueprint-params.test.ts [2m([22m[2m4 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [31m❯[39m __tests__/corpus-pdf.test.ts [2m([22m[2m10 tests[22m[2m | [22m[31m3 failed[39m[2m)[22m[33m 782[2mms[22m[39m
[31m   [31m×[31m ANSWER KEY: cada respuesta con su número de pregunta[2m > [22mpone pregunta y respuesta en el mismo span, separadas por la barra de celda[90m 116[2mms[22m[31m[39m
[31m     → expected [ …(59) ] to include '1 | b) 3/4'[39m
[31m   [31m×[31m ANSWER KEY: cada respuesta con su número de pregunta[2m > [22mlas diez de la sección A y las ocho de verdadero/falso son filas, no párrafos[90m 2[2mms[22m[31m[39m
[31m     → expected false to be true // Object.is equality[39m
[31m   [31m×[31m fracciones apiladas[2m > [22mune numerador y denominador en un solo texto[90m 1[2mms[22m[31m[39m
[31m     → expected [ …(59) ] to include '3 | b) 31/7'[39m
 [32m✓[39m __tests__/corpus.test.ts [2m([22m[2m33 tests[22m[2m)[22m[33m 771[2mms[22m[39m
   [33m[2m✓[22m[39m inventory[2m > [22musa la transcripcion cuando el texto de un PDF resulta ser decorativo [33m352[2mms[22m[39m
 [32m✓[39m __tests__/pipeline.test.ts [2m([22m[2m48 tests[22m[2m)[22m[33m 1040[2mms[22m[39m
   [33m[2m✓[22m[39m idempotencia[2m > [22mdos ejecuciones producen packs byte-idénticos [33m362[2mms[22m[39m

[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m7 passed[39m[22m[90m (8)[39m
[2m      Tests [22m [1m[31m3 failed[39m[22m[2m | [22m[1m[32m237 passed[39m[22m[90m (240)[39m
[2m   Start at [22m 11:10:31
[2m   Duration [22m 2.33s[2m (transform 1.23s, setup 0ms, collect 2.84s, tests 2.64s, environment 1ms, prepare 846ms)[22m

D:\.cet-worktrees\corpus-1-pdf-restos\packages\content:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @cet/content@0.1.0 test: `vitest run`
Exit status 1
[90mstderr[2m | __tests__/corpus-pdf.test.ts
[22m[39mWarning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.

[90mstderr[2m | __tests__/corpus-pdf.test.ts
[22m[39mWarning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.

[90mstderr[2m | __tests__/corpus-pdf.test.ts
[22m[39mWarning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.

[90mstderr[2m | __tests__/corpus-pdf.test.ts
[22m[39mWarning: TT: undefined function: 32

[31m⎯⎯⎯⎯⎯⎯⎯[1m[7m Failed Tests 3 [27m[22m⎯⎯⎯⎯⎯⎯⎯[39m

[31m[1m[7m FAIL [27m[22m[39m __tests__/corpus-pdf.test.ts[2m > [22mANSWER KEY: cada respuesta con su número de pregunta[2m > [22mpone pregunta y respuesta en el mismo span, separadas por la barra de celda
[31m[1mAssertionError[22m: expected [ …(59) ] to include '1 | b) 3/4'[39m
[36m [2m❯[22m __tests__/corpus-pdf.test.ts:[2m59:27[22m[39m
    [90m 57| [39m    [90m// La barra es la convención que ya usa el extractor de .docx para[39m…
    [90m 58| [39m    [90m// de tabla: quien lee un span no tiene por qué saber de qué forma[39m…
    [90m 59| [39m    [34mexpect[39m([34mtextos[39m(clave))[33m.[39m[34mtoContain[39m([32m"1 | b) 3/4"[39m)[33m;[39m
    [90m   | [39m                          [31m^[39m
    [90m 60| [39m    [34mexpect[39m([34mtextos[39m(clave))[33m.[39m[34mtoContain[39m([32m"6 | c) 0.0256"[39m)[33m;[39m
    [90m 61| [39m    [34mexpect[39m([34mtextos[39m(clave))[33m.[39m[34mtoContain[39m([32m"10 | c) 24 cm"[39m)[33m;[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯[22m[39m

[31m[1m[7m FAIL [27m[22m[39m __tests__/corpus-pdf.test.ts[2m > [22mANSWER KEY: cada respuesta con su número de pregunta[2m > [22mlas diez de la sección A y las ocho de verdadero/falso son filas, no párrafos
[31m[1mAssertionError[22m: expected false to be true // Object.is equality[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- true[39m
[31m+ false[39m

[36m [2m❯[22m __tests__/corpus-pdf.test.ts:[2m67:63[22m[39m
    [90m 65| [39m    [35mconst[39m filas [33m=[39m clave[33m.[39mspans[33m.[39m[34mfilter[39m((s) [33m=>[39m s[33m.[39mkind [33m===[39m [32m"table_row"[39m [33m&&[39m …
    [90m 66| [39m    [35mfor[39m ([35mconst[39m n [35mof[39m [[34m1[39m[33m,[39m [34m2[39m[33m,[39m [34m3[39m[33m,[39m [34m4[39m[33m,[39m [34m5[39m[33m,[39m [34m6[39m[33m,[39m [34m7[39m[33m,[39m [34m8[39m[33m,[39m [34m9[39m[33m,[39m [34m10[39m]) {
    [90m 67| [39m      [34mexpect[39m(filas[33m.[39m[34msome[39m((s) [33m=>[39m s[33m.[39mtext[33m.[39m[34mstartsWith[39m([32m`[39m[36m${[39mn[36m}[39m[32m | `[39m)))[33m.[39m[34mtoBe[39m([35mtru[39m…
    [90m   | [39m                                                              [31m^[39m
    [90m 68| [39m    }
    [90m 69| [39m    [34mexpect[39m(filas[33m.[39m[34mfilter[39m((s) [33m=>[39m [36m/^\d+ \| (TRUE|FALSE)$/[39m[33m.[39m[34mtest[39m(s[33m.[39mtext)))[33m.[39m…

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯[22m[39m

[31m[1m[7m FAIL [27m[22m[39m __tests__/corpus-pdf.test.ts[2m > [22mfracciones apiladas[2m > [22mune numerador y denominador en un solo texto
[31m[1mAssertionError[22m: expected [ …(59) ] to include '3 | b) 31/7'[39m
[36m [2m❯[22m __tests__/corpus-pdf.test.ts:[2m82:27[22m[39m
    [90m 80| [39m[34mdescribeConMaterial[39m([32m"fracciones apiladas"[39m[33m,[39m () [33m=>[39m {
    [90m 81| [39m  [34mit[39m([32m"une numerador y denominador en un solo texto"[39m[33m,[39m () [33m=>[39m {
    [90m 82| [39m    [34mexpect[39m([34mtextos[39m(clave))[33m.[39m[34mtoContain[39m([32m"3 | b) 31/7"[39m)[33m;[39m
    [90m   | [39m                          [31m^[39m
    [90m 83| [39m    [34mexpect[39m([34mtextos[39m(clave))[33m.[39m[34mtoContain[39m([32m"4 | a) 7 5/6"[39m)[33m;[39m
    [90m 84| [39m  })[33m;[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯[22m[39m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.