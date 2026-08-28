# Resultado - telemetria-sin-disco
- Contrato: `contracts/telemetria-sin-disco.md`
- Modelo: deepseek-chat
- Desenlace: **rojo**
- Rondas consumidas: 5 de 5
- Rama: `deepseek/telemetria-sin-disco`
- Duracion: 117.0 s
## Salida final de `pnpm --filter @cet/web exec vitest run src/lib/telemetry`

~~~
ordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos
[telemetry] cola desbordada: se descartaron eventos antiguos

[90mstderr[2m | src/lib/telemetry/client.test.ts[2m > [22m[2mTelemetryQueue[2m > [22m[2mno encola nada después de dispose()
[22m[39m[telemetry] evento 'lesson_opened' descartado: la cola está desmontada. Si esto ocurre fuera del cierre de la página, hay eventos perdiéndose.

[90mstderr[2m | src/lib/telemetry/provider.test.tsx[2m > [22m[2mla cola sobrevive a un ciclo de vida completo[2m > [22m[2mtambién bajo StrictMode, que es como corre el desarrollo entero
[22m[39m[telemetry] evento 'lesson_opened' descartado: la cola está desmontada. Si esto ocurre fuera del cierre de la página, hay eventos perdiéndose.

[31m⎯⎯⎯⎯⎯⎯⎯[1m[7m Failed Tests 3 [27m[22m⎯⎯⎯⎯⎯⎯⎯[39m

[31m[1m[7m FAIL [27m[22m[39m src/lib/telemetry/client.test.ts[2m > [22mTelemetryQueue[2m > [22mborra lo persistido al enviar con éxito
[31m[1mAssertionError[22m: expected true to be false // Object.is equality[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- false[39m
[31m+ true[39m

[36m [2m❯[22m src/lib/telemetry/client.test.ts:[2m98:43[22m[39m
    [90m 96| [39m
    [90m 97| [39m    [35mawait[39m queue[33m.[39m[34mflush[39m()[33m;[39m
    [90m 98| [39m    [34mexpect[39m(storage[33m.[39mdata[33m.[39m[34mhas[39m([33mSTORAGE_KEY[39m))[33m.[39m[34mtoBe[39m([35mfalse[39m)[33m;[39m
    [90m   | [39m                                          [31m^[39m
    [90m 99| [39m    [34mexpect[39m(queue[33m.[39mpending)[33m.[39m[34mtoBe[39m([34m0[39m)[33m;[39m
    [90m100| [39m  })[33m;[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯[22m[39m

[31m[1m[7m FAIL [27m[22m[39m src/lib/telemetry/client.test.ts[2m > [22mTelemetryQueue[2m > [22mdeja constancia al desbordar (descarta antiguos con aviso)
[31m[1mAssertionError[22m: expected '[telemetry] cola desbordada: se desca…' to contain 'desbordado'[39m

Expected: [32m"desbordado"[39m
Received: [31m"[telemetry] cola desbordada: se descartaron eventos antiguos"[39m

[36m [2m❯[22m src/lib/telemetry/client.test.ts:[2m127:40[22m[39m
    [90m125| [39m    [34mexpect[39m(queue[33m.[39mpending)[33m.[39m[34mtoBe[39m([34m500[39m)[33m;[39m
    [90m126| [39m    [34mexpect[39m(warnSpy)[33m.[39m[34mtoHaveBeenCalled[39m()[33m;[39m
    [90m127| [39m    [34mexpect[39m(warnSpy[33m.[39mmock[33m.[39mcalls[[34m0[39m][33m?.[39m[[34m0[39m])[33m.[39m[34mtoContain[39m([32m"desbordado"[39m)[33m;[39m
    [90m   | [39m                                       [31m^[39m
    [90m128| [39m  })[33m;[39m
    [90m129| [39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯[22m[39m

[31m[1m[7m FAIL [27m[22m[39m src/lib/telemetry/client.test.ts[2m > [22mTelemetryQueue[2m > [22mno reenvía lo ya enviado: la cola reconstruida solo tiene lo pendiente
[31m[1mAssertionError[22m: expected 1 to be +0 // Object.is equality[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- 0[39m
[31m+ 1[39m

[36m [2m❯[22m src/lib/telemetry/client.test.ts:[2m163:30[22m[39m
    [90m161| [39m
    [90m162| [39m    [35mconst[39m reloaded [33m=[39m [35mnew[39m [33mTelemetryQueue[39m([32m"11111111-2222-3333-4444-55555[39m…
    [90m163| [39m    [34mexpect[39m(reloaded[33m.[39mpending)[33m.[39m[34mtoBe[39m([34m0[39m)[33m;[39m
    [90m   | [39m                             [31m^[39m
    [90m164| [39m  })[33m;[39m
    [90m165| [39m})[33m;[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯[22m[39m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.