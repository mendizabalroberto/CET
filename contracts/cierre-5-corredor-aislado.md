---
id: cierre-5-corredor-aislado
model: reasoner
territory: [scripts/db-test.mjs, scripts/db-test.test.mjs]
forbidden: [scripts/db-apply.mjs, supabase/tests/helpers/fixture.psql]
context: [scripts/db-test.mjs, scripts/db-apply.mjs, scripts/db-apply.test.mjs, scripts/vitest.config.mjs]
verify: pnpm test:scripts
rounds: 4
deadline: 4 rondas o 30 minutos
---

# El corredor de pruebas miente sobre qué ha fallado

`scripts/db-test.mjs` abre **una conexión** y ejecuta con ella todos los ficheros
de `supabase/tests/`. Cuando uno termina en ERROR, su `rollback` no llega a
correr y el estado de pgTAP queda sucio para el siguiente.

Consecuencia medida el 29 de agosto de 2026: `rls_answer_key_hidden.sql` aparecía
en el informe como ERROR («You tried to plan twice!»), y ejecutado solo daba

```
rls_answer_key_hidden.sql ... ok (19)
```

Diecinueve asserts verdes contados como fichero roto, porque `mastery_job.sql`
había reventado antes. Un corredor que atribuye a un fichero el fallo de otro
hace más lento cada diagnóstico posterior, y —peor— **puede esconder un rojo de
verdad detrás de un ERROR ajeno**.

## Qué hay que conseguir

Que el resultado de un fichero no dependa de los que corrieron antes. La forma
queda a tu criterio; lo obvio es una conexión nueva por fichero, pero mira antes
si basta con garantizar el `rollback` —un `try/finally` alrededor de cada
ejecución— porque abrir 20 conexiones contra el pooler tiene su propio coste y
este script se lanza a menudo.

Decidas lo que decidas, **razónalo en la cabecera del fichero**: quien lo lea
dentro de seis meses tiene que entender por qué no es lo otro.

## No pierdas lo que el corredor ya hace bien

Léelo entero antes de tocarlo. Resuelve `\ir` recursivamente, respeta el
`begin/rollback` propio de cada fichero, y acepta `CET_DB_URL` para apuntar a
otra base — esto último se añadió ayer y es lo que impide aplicar una migración
en una rama y verificarla contra producción. Si tu cambio rompe cualquiera de
esas tres cosas, el arreglo cuesta más de lo que vale.

## Qué tiene que demostrar la prueba

Va en `scripts/db-test.test.mjs`, con vitest, **sin conectar a ninguna base**:
sustituye `pg` por un doble, como hace `scripts/db-apply.test.mjs` (léelo, es el
patrón de la casa y ya resolvió este mismo problema).

1. Un fichero que revienta **no impide** que el siguiente se ejecute, y el
   siguiente se ejecuta **limpio**.
2. El fichero que reventó se reporta como fallido; el siguiente, según su propio
   resultado. Éste es el assert que importa: es el que hoy sería rojo.
3. El resumen final cuenta bien: un ERROR ajeno no puede inflar el número de
   ficheros en rojo.

Y como siempre: comprueba que tus pruebas salen **rojas** contra el corredor
actual. Si pasan de entrada, están describiendo el comportamiento roto.

## Aviso de coordinación

**No lances este contrato en el mismo lote que `cierre-3`**: aquél verifica
ejecutando `db-test.mjs`, que es justo el fichero que tú estás reescribiendo.
Los territorios son disjuntos y el motor los aceptaría juntos, pero se
estorbarían de verdad.
