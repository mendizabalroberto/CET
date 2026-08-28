# `prac-b-tarjeta` — resultado

> © 2026 Roberto Mendizabal. Todos los derechos reservados.

Ficheros escritos (los tres del `territory`, ninguno más):

- `packages/ui/src/navigation/TopicCard.tsx` (nuevo)
- `packages/ui/src/navigation/TopicGrid.tsx` (nuevo)
- `packages/ui/__tests__/tarjeta-de-tema.test.tsx` (nuevo)

---

## 1 · Qué monta la tarjeta, fila a fila

El enlace envuelve la tarjeta entera (`<a href>`), con `cn(CARD_CHROME, className)`
—la caja se importa de `card-chrome.ts`, no se copia— y `style={cardSkin(identity)}`,
que es el lavado del cuerpo y el color del rail. Lleva `data-topic` con la clave ya
normalizada por `topicIdentity()` y `data-subject` con la de `subjectIdentity()`.
Dentro, cuatro hijos directos como máximo, cada uno con su `data-cet-fila`:

| # | Fila | Qué lleva | ¿Cambia con el progreso? |
|---|---|---|---|
| 1 | `cabecera` | medallón (`MEDALLION_CHROME` + `medallionSkin`, con `TopicIcon`), nombre en `text-body-lg font-bold`, y a la derecha `MasteryLadder level size="sm" showLabel` **solo si `level !== null`** | sí (la escalera) |
| 2 | `pista` | `hint`, en `text-body-sm`, tinta normal | no |
| 3 | `evidencia` | `t(evidenceText)` en `text-body-sm`; si sale cadena vacía, la fila no se monta | sí |
| 4 | `siguiente` | `EffortMeter` cuando hay objetivo pendiente **y** frase; si no, la frase en `text-body-sm font-semibold`; si no hay ninguna de las dos, nada | sí |

Tres filas que hablan de progreso: exactamente el tope de
`apps/web/.../densidad-de-indicadores.test.tsx`. La pista no gasta cupo porque no
cambia nunca. Ni una clase de color atenuado en las filas propias: `--cet-ink-muted`
sobre `--cet-materia-*-suave` mide 4.45:1–4.51:1 y no llega al 4.5 de WCAG 1.4.3 en
tres de los siete tonos.

`TopicGrid` es `<ul>`/`<li>`, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`, y
**respeta el orden de entrada** (al revés que `SubjectGrid`): aquí lo manda el
registro de generadores y la app ya lo ha decidido. `key` = `href`.

## 1 bis · Ampliación: la telemetría de la tarjeta

El enlace declara además `data-cet-id="practica.elegir-tema"`, **fijo en el
componente y no por prop**: es el patrón de `QuestionNavigator`, `HintPanel` y
`AnswerKeypad`, y la cabecera de `UiInteractionScope` dice por qué —un
`data-cet-id` es la declaración de «esto lo queremos medir, y se va a llamar así
aunque cambie de sitio, de color y de idioma», y esa decisión pertenece al
control que se pulsa, no a cada pantalla que lo monta—. Va en el propio `<a>`
porque el recolector resuelve el control con `closest("[data-cet-id]")`: colgado
de un envoltorio mediría también lo que caiga al lado del enlace.

El valor entra por la prop nueva `readonly trackedValue?: string | undefined` y
sale tal cual como `data-cet-value`. **No se deriva de `topic` ni de `href`**: lo
que la analítica lleva guardando es la clave del generador (`math.compare`) y
`topic` es la clave de la silueta; hoy casi coinciden, y el día que dejen de
hacerlo —un generador nuevo que cae en la silueta neutra— fundirlas falsearía
hacia atrás una serie que ya existe. Sin `trackedValue` el atributo no se
escribe: mejor un evento sin `value` que uno con un valor que la analítica no
sabe interpretar. El `data-cet-id` sí se escribe siempre; lo que falta en ese
caso es el valor, no el acto.

Cuatro casos nuevos (28 en total): el `data-cet-id` está en el propio `<a>`
(`link.closest("[data-cet-id]") === link`); el `data-cet-value` es exactamente lo
que pasó la app, con un caso donde `topic` y `trackedValue` son distintos a
propósito; sin `trackedValue` el atributo no aparece y el identificador sigue;
y en la rejilla cada tarjeta lleva su propio valor sin que ningún `<li>` declare
identificador. Verificado por mutación: derivar el valor de `topicIdentity(topic)`
pone **rojo 3 de 28**, y quitar el `data-cet-id` del `<a>` pone **rojo 2 de 28**.

## 2 · Qué comprueba la prueba (28 casos)

- **El enlace es la tarjeta**: un solo `link`, su nombre accesible dice el tema, y
  el medallón, el nombre, la pista y los indicadores están dentro; ningún `button`.
- **La caja es la compartida**: recorre `CARD_CHROME.split(" ")` —leído de la
  constante importada, no copiado— y exige cada clase en el `classList` del enlace;
  y que un `className` de fuera se componga con la caja en vez de sustituirla.
- **El color**: el rail y el lavado son literalmente `subjectIdentity(...).fill` y
  `.soft`; ningún hexadecimal en el HTML; las filas `pista` y `evidencia` no llevan
  `ink-muted`; tema y materia desconocidos caen en `otro`/`otra` sin reventar y sin
  emitir `var(--cet-materia-music)`.
- **`null` no es cero**: sin nivel no hay `role="img"` con el nombre del grupo ni un
  solo `<rect>`; con nivel, el nombre accesible de la escalera empieza por el rótulo
  del grupo y termina en `(3/4)`.
- **`EffortMeter`**: `targets: 0` y `targets: undefined` no pintan ni un círculo;
  `targets: 3` pinta tres; sin frase del siguiente paso no se dibujan círculos.
- **Ni hueco ni literal**: sin evidencia ni siguiente paso la tarjeta monta dos
  filas y ninguna fila queda con texto en blanco.
- **Densidad**: batería de cuatro escenarios de progreso (`starting`…`mastered`,
  con el último sustituyendo el medidor por la frase); firma por fila —etiqueta,
  texto y geometría, sin color— y conteo de las filas que varían: `<= 3`, `> 1`
  (para no pasar en vacío), el número de filas idéntico en los cuatro escenarios, y
  la pista constante. Además, filas iguales con medidor y con frase.
- **Rejilla**: orden de entrada respetado, `list`/`listitem`, no muta el array de
  entrada, y cero violaciones de `jest-axe`.

Nada afirma sobre la geometría de `TopicIcon`: solo que existe un `<svg>` dentro.

## 3 · Verificación por código de salida

```
pnpm --filter @cet/ui exec vitest run __tests__/tarjeta-de-tema.test.tsx   ->  28 passed
pnpm --filter @cet/ui typecheck                                           ->  0
pnpm --filter @cet/ui lint                                                ->  0
```

### Mutación (comprobación de honestidad)

1. **Cuarta fila que cambia con el progreso** (`<span data-cet-fila="mutante">` con
   la evidencia y el número de objetivos, insertada antes de la pista):
   **ROJO, 2 de 24** — el tope de densidad («habla de progreso en 4 filas. El tope
   es 3») y el conteo de filas del caso sin rótulos opcionales.
2. **Quitar `cn(CARD_CHROME, ...)`** y sustituirlo por una lista de clases de caja
   escrita a mano (`flex flex-col gap-3 rounded-md border px-4 py-4`):
   **ROJO, 2 de 24** — «falta la clase de caja `min-h-[var(--cet-touch-min)]`», que
   es justo el mínimo táctil que la copia a mano se dejaría por el camino, y el caso
   de composición con `className`.

Las dos mutaciones se deshicieron y la verificación volvió a verde.

## 4 · Decisiones que el contrato no daba masticadas

1. **«El número de filas es el mismo con y sin cada texto opcional» vs. «un rótulo
   que falta no pinta la fila».** Literalmente son incompatibles: si la evidencia no
   se pinta, hay una fila menos. La lectura que se ha tomado —y que es la que hace
   falta para no romper `densidad-de-indicadores`— es que la invariante vale **entre
   estados de progreso de una misma tarjeta con datos**: lo que no puede bailar es el
   alto de la tarjeta cuando el alumno avanza. El caso real es el par
   medidor/frase del siguiente paso, y está probado explícitamente. Que un rótulo
   ausente quite su fila se prueba aparte, como pide la otra regla.
2. **Un `EffortMeter` sin frase no se dibuja.** El contrato dice «`EffortMeter` si
   `targets > 0`». Pero `EffortMeter` usa el mensaje como su propio `<title>`: sin
   él quedan unos círculos con texto accesible vacío, o sea un dibujo decorativo.
   Se exige `targets > 0` **y** frase resuelta no vacía; si no, se cae a la frase, y
   si tampoco hay, la fila no existe.
3. **`targets` se sanea aquí.** `Number.isFinite` + `Math.trunc`: un decimal o un
   negativo de un cálculo de la app no pueden convertirse en una fila. (El tope de
   10 ya lo pone `EffortMeter`, y no se duplica.)
4. **La fila del medidor no lleva `data-cet-fila`.** `EffortMeterProps` no acepta
   atributos sueltos y no es territorio de este contrato ampliarla; envolverla en un
   `<span>` metería un `<p>` dentro de contenido de frase. Esa fila se reconoce por
   su dibujo; el rótulo va en la otra rama, que sí es marcado de esta tarjeta.
5. **Rejilla de la cabecera**: el nombre lleva `min-w-0 flex-1` y la escalera
   `ms-auto shrink-0`, para que en 360 px el nombre largo haga wrap sin empujar la
   escalera fuera ni comprimirla.
6. **`data-topic` normalizado** (`otro` para lo desconocido) y no la clave cruda:
   así una prueba no puede afirmar que existe una silueta que no existe.
7. **No se exporta desde `packages/ui/src/index.ts`** —está en `forbidden`—, así que
   la prueba importa `../src/navigation/TopicCard.js` directamente. El cableado y la
   exportación pública son del supervisor.
