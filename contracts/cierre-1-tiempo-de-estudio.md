---
id: cierre-1-tiempo-de-estudio
model: reasoner
territory: [supabase/migrations/0064_tiempo_de_estudio.sql, supabase/tests/tiempo_de_estudio.sql]
forbidden: [supabase/migrations/0053_informes_alumno.sql, supabase/migrations/0062_informes_series.sql, supabase/migrations/0063_public_informes_wrapper.sql]
context: [supabase/migrations/0053_informes_alumno.sql, supabase/migrations/0062_informes_series.sql, supabase/migrations/0010_telemetry.sql, packages/shared/src/events.ts]
verify: node scripts/deepseek/validar-sql.mjs supabase/migrations/0064_tiempo_de_estudio.sql supabase/tests/tiempo_de_estudio.sql app.ms_descontables
rounds: 4
deadline: 4 rondas o 30 minutos
---

# La cifra principal del scorecard no es creíble

Medido en producción el 29 de agosto de 2026, con datos reales:

```
minutos_estudio (30 días) = 429,50
serie diaria: 27/08 = 23,67   28/08 = 405,83
```

**405 minutos en un solo día** — casi siete horas — que son el 94 % del total de
treinta días. No es tiempo de estudio: es una pestaña abierta toda la tarde.

## Dónde está el defecto

`app.informe_alumno_resumen` (0053) mide *span de la sesión menos lo
descontable*, donde lo descontable son `idle_end.idleMs` y `focus_gained.awayMs`.
`app.ms_descontables` (0062) factorizó ese cálculo.

El agujero está escrito en la cabecera de 0062 y nadie lo ha cerrado: **si el
cliente muere sin emitir `idle_end`, ese tiempo no se descuenta nunca**. El
navegador que se cierra, la tableta que se apaga, la pestaña que queda de fondo:
el span sigue creciendo hasta el último evento de la sesión.

## Qué hay que conseguir

Que un tramo sin actividad no cuente como estudio, aunque el cliente no avisara.
La forma queda a tu criterio; dos caminos que funcionan, y puedes proponer otro:

- **Tope por hueco**: un intervalo entre dos eventos consecutivos mayor que un
  umbral no suma. Elige el umbral y **justifícalo con los datos**, no con una
  cifra redonda: `learning_events` tiene la distribución real de huecos.
- **Cierre implícito de sesión**: una sesión sin evento durante N minutos se
  considera terminada en su último evento, y lo posterior es otra sesión.

## Lo que NO puedes hacer

**No toques 0053 ni 0062.** Ya hay dos implementaciones de la misma fórmula
—`informe_alumno_resumen` y `informe_alumno_metricas_bruto`— y `informes_series`
las compara métrica a métrica con formato de texto incluido. Si cambias una sola,
ese test se pone rojo y con razón: dos cifras distintas para lo mismo en el mismo
scorecard no serían creíbles ninguna de las dos.

Tu migración `0064` **redefine `app.ms_descontables`** con `create or replace`,
que es el único punto por el que las dos implementaciones comparten el cálculo.
Arreglando ahí, las dos se mueven a la vez y la comparación sigue en verde.

## Qué tiene que demostrar la prueba

1. **El caso que motivó el encargo**: una sesión con un hueco largo sin ningún
   `idle_end` mide un tiempo razonable, no el span entero. Siembra el hueco a
   mano; no dependas de los datos de producción.
2. **El caso contrario, que es el que se rompe al arreglar el primero**: una
   sesión de estudio continuo y real **no pierde minutos**. Un arreglo que
   descuente de más convierte una cifra inflada en una cifra pequeña, y es
   igual de mentira.
3. **La coherencia se conserva**: las dos implementaciones siguen devolviendo lo
   mismo. Copia la técnica de comparación de `supabase/tests/informes_series.sql`.
4. **El umbral está fijado a mano en un assert**, no derivado de la constante:
   si alguien lo cambia, tiene que venir a este fichero a leer por qué es ése.

Recuerda que un test verde puede estar pasando por el motivo equivocado. Si tu
siembra no llega a crear el hueco que dices, el assert pasa sin probar nada:
comprueba primero que **sin** tu arreglo la prueba sale roja.
