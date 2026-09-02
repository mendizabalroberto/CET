---
id: plan-3-repartidor
model: reasoner
territory: [packages/engine/src/plan/repartir*]
forbidden: [packages/engine/src/plan/tipos.ts, packages/engine/src/index.ts, packages/engine/package.json, packages/ui/src/index.ts]
context: [packages/engine/src/plan/tipos.ts, packages/engine/src/__tests__/rng.test.ts, packages/engine/vitest.config.ts]
verify: pnpm --filter @cet/engine typecheck && pnpm --filter @cet/engine lint && pnpm --filter @cet/engine exec vitest run src/plan
rounds: 5
deadline: 5 rondas o 40 min
---

## 1 · El problema

Un plan de estudio tiene dos mitades: la IA decide **cuánto** a cada materia
(los pesos), y el código decide **qué día y qué tarea**. Te toca la segunda:
**`packages/engine/src/plan/repartir.ts`**, una función pura y determinista
`repartir(entrada: EntradaReparto): Reparto`, y sus pruebas en
**`packages/engine/src/plan/repartir.test.ts`**. Sin red, sin base, sin reloj:
todo entra por parámetro.

## 2 · La evidencia que ya tenemos

- Los tipos están escritos y **no se tocan**: `packages/engine/src/plan/tipos.ts`
  (te lo doy). Impórtalos con `import type { … } from "./tipos.js"` (el paquete
  es ESM con extensiones `.js` en los imports, mira `src/index.ts`).
- Vitest incluye `src/**/*.test.ts`. El paquete compila con
  `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` y `strict`
  (`tsconfig.base.json`): un acceso `arr[i]` es `T | undefined`.
- Inventario real de la base el 2026-09-02, para que los tests sean creíbles:
  `math` tiene 8 lecciones (≈96 min estimados en total) y **16 preguntas
  publicadas** en 23 skills, casi todas con 0 preguntas; `english` 5 lecciones
  (≈92 min) y 86 preguntas; `spanish` 3 lecciones (≈59 min) y 93 preguntas;
  `science` 5 lecciones (≈72 min) y 78; `socials` 6 lecciones (≈119 min) y 165;
  `ict` 6 lecciones (≈152 min) y 172.
- Calendario 2026 (para la ventana de prueba de LEO, `2026-09-02` →
  `2026-11-13`): `sin_clases` 09-23 y 09-25, `feriado` 09-24 y 11-02,
  `sin_clases` 10-27, `examenes_finales` 11-13 → 11-20. El 2026-09-02 es
  miércoles.

## 3 · El criterio de aceptación

`pnpm --filter @cet/engine typecheck && pnpm --filter @cet/engine lint && pnpm --filter @cet/engine exec vitest run src/plan` sale en 0.

### 3.1 · Las reglas, en este orden

1. **Días.** Se recorre `desde`..`hasta`, ambos inclusive, día a día. Se
   descartan por completo los días que caen dentro de un evento `feriado` o
   `sin_clases` (`desde`..`hasta` inclusivos). Calcula el día de la semana con
   `new Date(`${fecha}T00:00:00Z`).getUTCDay()`: sábado (6) y domingo (0)
   valen la mitad del presupuesto.
2. **Intensidad por época.** Un día dentro de `examenes_finales` multiplica por
   1,5; dentro de `vacaciones`, por 0,4; los demás tipos no cambian nada. Si un
   día cae en varios, se multiplican los factores.
3. **Presupuesto del día** = `Math.round(minutosPorDia × factorFinDeSemana ×
   factorEpoca)`. Un día con menos de 5 minutos no recibe tareas. La suma de
   los presupuestos de todos los días es `minutosPresupuestados`.
4. **Reparto por materia.** Cada materia pide `peso × minutosPresupuestados`.
5. **Techo de munición.** El techo de una materia es
   `Σ minutos de sus lecciones no completadas + preguntas publicadas totales × 0,75`.
   Si lo pedido supera el techo, la materia se queda con el techo, se registra un
   `TechoDeMateria` (con lo pedido y lo disponible, redondeados a entero), y el
   sobrante se redistribuye entre las materias sin techo proporcionalmente a su
   peso. Repite hasta que ninguna nueva materia toque techo. Si todas tocan
   techo, lo que sobra se queda sin planificar (`minutosPlanificados <
   minutosPresupuestados`).
6. **Forma de la sesión.** Cada día, como máximo 2 materias. Se eligen las dos
   con más minutos pendientes de asignar (desempate por `code` alfabético); la
   primera recibe `ceil(presupuesto/2)`, la segunda `floor(presupuesto/2)`,
   cada una topada por sus minutos pendientes; si a la segunda no le queda nada,
   la primera recibe todo lo que pueda. Lo que una materia recibe en un día se
   parte en bloques de **como máximo 25 minutos** y **como mínimo 5**: 30 → 25 +
   5, 45 → 25 + 20. Un resto menor de 5 se une al bloque anterior (que puede
   llegar a 29; si eso rompe el máximo de 25, reparte como 15 + 14 — lo
   importante es que ningún bloque salga de 5..25 y que la suma se conserve).
   Los bloques del día llevan `ord` 0, 1, 2… en el orden en que se crean.
7. **Qué tarea concreta.** Para cada bloque de una materia: primero las
   lecciones no completadas, en orden `(moduloOrd, ord)`; cada lección tiene un
   saldo de minutos igual a su `minutos` y un bloque le descuenta lo que
   consume — una lección de 35 minutos aparece en dos días como dos tareas
   `leccion` sobre el mismo `lessonId`. Un bloque puede quedarse corto si la
   lección se agota (por ejemplo, 12 minutos para una lección a la que le
   quedaban 12): entonces el resto del bloque se convierte en otro bloque del
   mismo día con la siguiente lección o, si no queda ninguna, práctica.
   Agotadas las lecciones, tareas `practica` sobre las skills **con
   `preguntas > 0`**, en orden de `mastery` ascendente (`null` cuenta como el
   más bajo) y, a igualdad, por `ord`; se rota entre ellas (una por bloque).
   Una materia sin lecciones pendientes ni skills practicables no recibe
   tareas.
8. **Salida.** `tareas` ordenadas por `(fecha, ord)`, cada una con exactamente
   uno de `lessonId`/`skillId`, `minutos` entre 5 y 25. `minutosPlanificados`
   es la suma real de `tareas[].minutos`. `techos` en el orden en que se
   activaron.
9. **Determinismo.** Misma entrada, misma salida, siempre. Nada de
   `Math.random`, `Date.now` ni orden de iteración de objetos: usa arrays.

### 3.2 · Las pruebas que importan

Escribe fixtures pequeños y legibles (materias con 2–3 lecciones) para las
reglas, y uno grande para LEO. Como mínimo:

- Un `feriado` y un `sin_clases` dentro de la ventana no reciben ninguna tarea.
- Un sábado recibe la mitad; un día de `examenes_finales` recibe ×1,5.
- Techo: `math` con 16 preguntas y 96 min de lecciones, peso 0,25, ventana de
  10 semanas a 45 min/día: `techos` contiene a `math` con `minutosDisponibles`
  = 108 y las demás materias absorben el sobrante (la suma de tareas sigue
  igualando `minutosPresupuestados`).
- Un día de 30 minutos para una sola materia sale como 25 + 5; nunca hay un
  bloque de más de 25 ni de menos de 5 (recorre todas las tareas de la ventana
  de LEO y compruébalo).
- Una lección de 35 minutos se reparte en dos tareas con el mismo `lessonId`.
- Agotadas las lecciones, aparecen tareas `practica` sobre skills con
  preguntas; una skill con 0 preguntas nunca aparece.
- La ventana entera de LEO (`2026-09-02` → `2026-11-13`, 45 min/día, las seis
  materias con el inventario real de §2, calendario de §2, pesos
  `{english: 0.35, math: 0.25, spanish: 0.2, science: 0.1, socials: 0.1}`):
  `minutosPlanificados === minutosPresupuestados` salvo que TODAS las materias
  toquen techo (calcula en el test cuál de los dos casos es y afirma el que
  corresponda con el porqué en un comentario), ningún día con más de 2
  materias, ninguna tarea el 09-24 ni el 11-02, y el 11-13 recibe ×1,5.
- Determinismo: dos llamadas con la misma entrada dan `JSON.stringify` idéntico.

## 4 · Qué NO cuenta como resuelto

- Modificar `tipos.ts`, `index.ts` o `package.json`. El supervisor exporta el
  módulo desde el barril al consolidar.
- Un test que afirme `expect(x).toBe(x)` o que no ejerza `repartir`.
- Bloques fuera de 5..25, tareas con los dos ids o con ninguno, o
  `minutosPlanificados` que no sea la suma real.
- Ignorar el techo y planificar minutos para los que no hay contenido: ese es
  el caso que esta función existe para atajar.
- Dependencias nuevas. Solo `zod` y `@cet/shared` están disponibles, y aquí no
  hace falta ninguna.
- Decir «debería pasar». Ejecuta el verificador y pega su salida literal.
