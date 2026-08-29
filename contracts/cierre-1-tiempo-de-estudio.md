---
id: cierre-1-tiempo-de-estudio
model: reasoner
territory: [supabase/migrations/0064_tiempo_de_estudio.sql, supabase/tests/tiempo_de_estudio.sql]
forbidden: [supabase/migrations/0053_informes_alumno.sql, supabase/migrations/0062_informes_series.sql, supabase/migrations/0063_public_informes_wrapper.sql]
context: [supabase/migrations/0053_informes_alumno.sql, supabase/migrations/0062_informes_series.sql, supabase/tests/informes_series.sql, supabase/migrations/0010_telemetry.sql]
verify: node scripts/db-test.mjs tiempo_de_estudio && node scripts/db-test.mjs informes_series && node scripts/db-test.mjs informes_alumno
rounds: 4
deadline: 4 rondas o 40 minutos
---

# La cifra principal del scorecard no es creíble

> **Segunda redacción.** La primera fue lanzada, entregada «en verde» y el verde
> era falso. Los dos motivos están abajo, porque los dos eran errores del
> encargo y quien lo ejecute ahora debe conocerlos.

Medido en producción el 29 de agosto de 2026, con datos reales:

```
minutos_estudio (30 días) = 429,50
serie diaria: 27/08 = 23,67   28/08 = 405,83
```

**405 minutos en un solo día** —casi siete horas— que son el 94 % del total de
treinta días. No es tiempo de estudio: es una pestaña abierta toda la tarde.

## Qué falló en el primer intento, para que no se repita

**1. El `verify` era estático.** Se usó `validar-sql.mjs`, que comprueba que el
SQL parsea y declara las funciones esperadas — **nunca ejecuta la prueba**. El
motor cantó verde con razón y el arreglo no funcionaba. Ahora el `verify` ejecuta
pgTAP de verdad, y ejecuta **tres** ficheros: el tuyo y los dos que ya existían,
porque este cambio puede romperlos.

**2. La instrucción central era falsa.** Decía: «redefine `app.ms_descontables`,
que es el único punto por el que las dos implementaciones comparten el cálculo».
**No lo es.** `ms_descontables` lo introdujo `0062`; `0053` es anterior y **no lo
usa**. Redefinir el helper mueve las funciones de `0062` y deja
`informe_alumno_resumen` —la que alimenta la cabecera del scorecard— intacta.
Ése es exactamente el rojo con el que terminó el intento anterior:

```
not ok 2 - una sesión con un hueco de casi 2 horas no mide el span entero
not ok 4 - metricas_bruto coincide con informe_alumno_resumen tras el arreglo
```

## Dónde está el defecto, de verdad

Hay **dos** implementaciones de la misma fórmula, y las dos calculan el tiempo
como *span de la sesión menos lo descontable*:

- `app.informe_alumno_resumen` (0053), que **no** pasa por ningún helper;
- `app.informe_alumno_metricas_bruto` y las funciones de series (0062), que sí
  pasan por `app.ms_descontables`.

Lo descontable son hoy `idle_end.idleMs` y `focus_gained.awayMs`. **Si el cliente
muere sin emitir `idle_end`, ese tiempo no se descuenta nunca**: el navegador que
se cierra, la tableta que se apaga, la pestaña que queda de fondo.

## Qué hay que conseguir

Que un tramo sin actividad no cuente como estudio, **en las dos
implementaciones a la vez**. Como `0053` y `0062` están aplicadas y no se pueden
editar —cambiarlas haría saltar la comprobación de huella de `db-apply`— tu
migración `0064` las **redefine** con `create or replace`: la de `0053` y el
helper de `0062`. Es la única forma de que las dos se muevan juntas.

Si encuentras una forma mejor de que compartan una sola definición, hazla y
explícala. Lo que no vale es que midan distinto: `informes_series` compara las
dos métrica a métrica, con formato de texto incluido, y se pondrá rojo.

El umbral queda a tu criterio. El intento anterior eligió **10 minutos**
razonando que «una pausa dentro de una sesión no es el fin de la sesión»; puedes
conservarlo o cambiarlo, pero **justifícalo con la distribución real de huecos**
de `learning_events`, no con una cifra redonda. Tienes acceso a la base.

## Qué tiene que demostrar la prueba

1. **El caso que motivó el encargo**: una sesión con un hueco largo sin ningún
   `idle_end` mide un tiempo razonable, no el span entero. Siembra el hueco a
   mano; no dependas de los datos de producción.
2. **El caso contrario, que es el que se rompe al arreglar el primero**: una
   sesión de estudio continuo y real **no pierde minutos**. Un arreglo que
   descuente de más convierte una cifra inflada en una cifra pequeña, y es igual
   de mentira.
3. **Las dos implementaciones siguen coincidiendo** tras el arreglo. Copia la
   técnica de comparación de `supabase/tests/informes_series.sql`.
4. **El umbral está fijado a mano en un assert**, no derivado de la constante: si
   alguien lo cambia, tiene que venir aquí a leer por qué es ése.

Comprueba que la prueba sale **roja** contra el esquema actual antes de arreglar
nada. Y recuerda que los ficheros pgTAP traen su propio `begin; ... rollback;`:
aplica tu migración **dentro** de la transacción de la prueba (`\ir`), nunca con
`db-apply`.
