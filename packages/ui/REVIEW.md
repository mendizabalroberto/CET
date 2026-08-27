# @cet/ui — Revision critica (pasada 2) y correccion (pasada 3)

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Fecha: 2026-08-26 · Alcance: `packages/ui/**`

Protocolo del MASTER_PLAN §7. La pasada 1 construyo el paquete; esta pasada lo
ataca; la tercera columna dice que se hizo. Todos los ratios de contraste estan
**medidos** con la formula de luminancia relativa de WCAG 2.1, no estimados.

---

## 1. Contraste medido

Metodo: luminancia relativa WCAG 2.1 (`(L1+0.05)/(L2+0.05)`), calculada sobre los
valores hexadecimales reales de `tokens.css`. Umbrales: **4.5:1** texto normal,
**3:1** texto grande y componentes de UI (1.4.11).

### Tema claro

| Par | Ratio | Uso | Veredicto |
|---|---|---|---|
| `--cet-ink` #12202f / `--cet-bg` #f4f7fb | **15.35** | texto de pagina | AA/AAA |
| `--cet-ink` / `--cet-surface` #ffffff | **16.49** | texto en tarjeta | AA/AAA |
| `--cet-ink` / `--cet-surface-2` #f7fafd | **15.74** | filas alternas | AA/AAA |
| `--cet-ink-muted` #5d7086 / #ffffff | **5.09** | texto secundario | AA |
| `--cet-ink-muted` / `--cet-bg` | **4.74** | texto secundario | AA |
| `--cet-ink-muted` / `--cet-surface-3` #eef2f7 | **4.53** | cabecera de tabla | AA (al limite) |
| `--cet-on-primary` #fff / `--cet-primary` #173a63 | **11.53** | boton primario | AA/AAA |
| `--cet-navy` / `--cet-surface` | **11.53** | titulos, valor de StatTile | AA/AAA |
| `--cet-navy` / `--cet-surface-3` | **10.25** | pestana activa | AA/AAA |
| `--cet-on-amber` #3a2a00 / `--cet-amber` #f2a71b | **6.83** | boton acento | AA |
| `#ffffff` / `--cet-danger` #c0392b | **5.44** | boton peligro | AA |
| `--cet-ok-text` #0d5c42 / `--cet-ok-bg` #e7f6ee | **7.16** | feedback correcto | AA/AAA |
| `--cet-no-text` #8e2d22 / `--cet-no-bg` #fdeeec | **7.30** | feedback incorrecto | AA/AAA |
| `--cet-hint-text` #6b4d05 / `--cet-hint-bg` #fff8e6 | **7.37** | pista | AA/AAA |
| `--cet-ink` / `--cet-rule-bg` #eef6fb | **15.09** | recuadro de regla | AA/AAA |
| `--cet-teal-text` #0b6f66 / `--cet-surface` | **6.03** | enlaces, badge info | AA |
| `--cet-teal-text` / `--cet-rule-bg` | **5.52** | badge info | AA |
| `--cet-amber-text` #8a6100 / `--cet-surface` | **5.54** | aviso de temporizador | AA |
| `--cet-border-strong` #7d92a8 / `--cet-surface` | **3.21** | borde de control | AA (1.4.11) |

### Tema oscuro

| Par | Ratio | Veredicto |
|---|---|---|
| `--cet-ink` #e9eff6 / `--cet-bg` #0b1622 | **15.75** | AA/AAA |
| `--cet-ink` / `--cet-surface` #12202f | **14.25** | AA/AAA |
| `--cet-ink` / `--cet-surface-2` #1a2c3f | **12.29** | AA/AAA |
| `--cet-ink-muted` #a7b8c9 / `--cet-surface` | **8.12** | AA/AAA |
| `--cet-ink-muted` / `--cet-surface-3` #22384e | **5.93** | AA |
| `#ffffff` / `--cet-primary` #2b5f96 | **6.60** | AA |
| `--cet-navy` #7cb2ea / `--cet-surface` | **7.39** | AA/AAA |
| `--cet-ok-text` #7de0b0 / `--cet-ok-bg` #102a20 | **9.58** | AA/AAA |
| `--cet-no-text` #ffa39b / `--cet-no-bg` #2b1512 | **9.00** | AA/AAA |
| `--cet-hint-text` #f8d27a / `--cet-hint-bg` #2b2110 | **10.91** | AA/AAA |
| `--cet-teal-text` #4fd1c0 / `--cet-rule-bg` #14293d | **7.93** | AA/AAA |
| `--cet-border-strong` #6c8298 / `--cet-surface` | **4.15** | AA (1.4.11) |
| `--cet-focus` #7cb2ea / `--cet-bg` | **8.17** | AA/AAA |

### Correcciones que la paleta Y6A necesitaba

La paleta original no era accesible tal cual, y esto es un hallazgo, no una
decision estetica:

| Color Y6A | Sobre blanco | Problema |
|---|---|---|
| `--teal` #0f9b8e | **3.44** | no vale para texto ni para relleno de boton con texto blanco |
| `--amber` #f2a71b | **1.90** | idem, mucho peor |
| `--line` #dfe6ee | **1.26** | no vale como borde de un control interactivo |

Por eso `tokens.css` distingue **variante decorativa** (`--cet-teal`,
`--cet-amber`, `--cet-line`) de **variante legible** (`--cet-teal-text`,
`--cet-amber-text`, `--cet-border-strong`), y ningun componente usa la primera
para texto. Es la unica desviacion deliberada respecto a los trainers, y es
obligatoria.

---

## 2. Hallazgos de la pasada 2

Estado: **C** = corregido en la pasada 3, **A** = aceptado y documentado.

### Seguridad

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| S-1 | `dangerouslySetInnerHTML` aparece en 2 sitios, ambos en `lib/safe-html.tsx`, y ambos sanean por dentro. Ningun otro fichero de `src/` lo usa (verificado con `grep -rn`). | — | OK |
| S-2 | `CLASS_MAP` remapeaba las clases `a`, `b`, `t`, `small` y `center` **en cualquier etiqueta**. Un autor que escriba `<div class="b">` en una leccion obtenia la barra de fraccion y, peor, `parseSafeHtml` podia interpretarlo como denominador. Superficie de confusion, no de ejecucion, pero rompe el enunciado. | Media | **C** — las clases de una sola letra solo se remapean sobre `<span>`. |
| S-3 | `sanitizeSvg` permitia el atributo `id`, con el que un SVG podia secuestrar un `id` de la pagina (`document.getElementById` clobbering) y romper un `aria-labelledby` del examen. | Baja | **C** — `id` fuera de la allowlist de SVG. |
| S-4 | El sanitizador no limitaba las vueltas de decodificacion de entidades... si lo hacia (5 pasadas) y hay test de bomba de entidades. | — | OK |
| S-5 | `parseSafeHtml` opera sobre HTML ya saneado y construye elementos de React, no `innerHTML`: doble barrera. | — | OK |

### Contraste y color

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| C-1 | **`Button variant="danger"` en tema oscuro daba 2.28:1.** El componente resolvia el color del texto con la variante `dark:` del preset, que solo cubre `[data-theme="dark"]`; un usuario con el sistema en oscuro y sin eleccion explicita recibia texto blanco sobre #ff8a80. Fallo real de AA. | **Alta** | **C** — token nuevo `--cet-on-danger` (#ffffff en claro, #0b1622 en oscuro: 5.44 y 7.98). Se elimina la variante `dark:` del componente. |
| C-2 | **`MasteryMeter`**: el relleno del nivel "Aprendiendo" era `--cet-amber` sobre la pista `--cet-surface-3`: **1.81:1**, y el de "Empezando" era `--cet-border-strong`: **2.85:1**. Ambos por debajo del 3:1 de 1.4.11. | Media | **C** — los rellenos pasan a `--cet-ink-muted` (4.53), `--cet-amber-text` (4.93), `--cet-teal-text` (5.37) y `--cet-ok-accent` (4.38). |
| C-3 | **`Progress`**: el degradado teal→ambar del original da 1.81:1 en su extremo ambar contra la pista. | Media | **C** — el degradado usa las variantes legibles (`--cet-teal-text` → `--cet-amber-text`). Se pierde algo de saturacion respecto a Y6A; AA no es negociable. |
| C-4 | `ScoreRing`: el arco `--cet-teal` sobre `--cet-surface-3` da 3.06:1. Pasa por los pelos. | Baja | **A** — pasa, y ademas la nota va escrita en cifras dentro del anillo, asi que el arco no es el unico portador. |
| C-5 | `StreakMeter`: el punto lleno es `--cet-amber` (1.90 sobre blanco), pero lleva borde `--cet-amber-text` (5.54). El borde es el que porta la forma. | Baja | **A** |
| C-6 | Ningun estado se comunica solo con color: `QuestionNavigator` lleva el estado en el nombre accesible, `MasteryMeter` lo escribe con palabras, `ChoiceList` usa borde + indicador + `aria-checked`. | — | OK |

### Foco y teclado

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| F-1 | **El halo del foco era invisible.** `outline: 3px` con `outline-offset: 2px` ocupa 5px, y el halo era `box-shadow: 0 0 0 5px`: quedaba exactamente debajo del contorno. En un boton primario navy sobre una cabecera navy el foco desaparecia. | **Alta** | **C** — el halo pasa a `0 0 0 7px`, dejando 2px visibles por fuera del contorno. |
| F-2 | `ChoiceList` implementa a mano el patron `radiogroup`: una sola parada de tabulacion, flechas circulares, Home/End, Espacio. Cubierto por test. | — | OK |
| F-3 | `OrderingList` no depende de arrastrar y soltar: dos botones por fila, operables con teclado y con el dedo. | — | OK |
| F-4 | `Table` envuelve el scroll horizontal en un contenedor con `tabIndex={0}` y `role="region"` (WCAG 2.1.1 sobre regiones desplazables). | — | OK |
| F-5 | `QuestionCard` envolvia los controles en un `<div aria-labelledby>` **sin rol**: los `aria-*` sobre un `div` generico se ignoran. Era un no-op silencioso. | Media | **C** — el envoltorio recibe `role="group"`, con lo que el enunciado pasa a ser de verdad el nombre accesible del bloque de respuesta. |
| F-6 | `Accordion` mete cada disparador dentro de un encabezado real, cosa que los trainers Y6A no hacian. Mejora sobre el original. | — | OK |

### Movimiento

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| M-1 | `tokens.css` anula duraciones y animaciones bajo `prefers-reduced-motion`, y cada componente con transicion anade `motion-reduce:`. Doble red. | — | OK |
| M-2 | **`Dialog` usaba las clases `animate-in` y `fade-in`, que vienen del plugin `tailwindcss-animate`, que NO esta declarado como dependencia.** No fallaba: simplemente no existian. Codigo muerto que aparenta hacer algo. | Media | **C** — clases eliminadas. La entrada del dialogo queda sin animacion, que es lo que ya ocurria de facto. |
| M-3 | El temporizador no parpadea en ningun estado (WCAG 2.3.1), y el `StreakMeter` no celebra con animacion. | — | OK |

### i18n (AD-7)

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| I-1 | **`Alert` pintaba `"OK"` como marca del tono correcto y `QuestionNavigator` pintaba `"OK"` en cada pregunta respondida.** Son cadenas en ingles escritas en el componente. Aunque van `aria-hidden`, un alumno hispanohablante las ve. Violacion de AD-7. | Media | **C** — sustituidas por marcas geometricas dibujadas en SVG (check, exclamacion, punto), que no tienen idioma. |
| I-2 | El resto de textos entra por `I18nText` o por `UI_STRINGS`, y `UI_STRINGS` esta tipado con `satisfies Record<string, I18nText>`. Ningun literal de cara al usuario en JSX. | — | OK |

### Tono para ninos de 10 a 16 anos

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| T-1 | `ErrorState` no muestra codigos HTTP ni mensajes del servidor, dice explicitamente que no es culpa del alumno y que no ha perdido nada, y siempre ofrece una salida. Con test que lo comprueba. | — | OK |
| T-2 | `AutosaveIndicator` pinta "sin conexion" en ambar, no en rojo, y dice que se sigue guardando. | — | OK |
| T-3 | `IncorrectFeedback` titula "Casi", no "Incorrecto". | — | OK |
| T-4 | `SubmitDialog` no pinta de rojo el boton de entregar (no es una accion destructiva) y lista las preguntas sin responder con salto directo a cada una. | — | OK |
| T-5 | **`OrderingList` anunciaba en la region viva el texto "Pregunta 3 de 5" al mover un elemento de una lista.** Reutilizacion perezosa de `UI_STRINGS.question`: el mensaje era literalmente falso para quien depende del audio. | Media | **C** — cadena propia `movedToPosition` y el mensaje pasa a estado de React, no a un `ref` (ver L-2). |
| T-6 | `Toast` dura 6 s por defecto en vez de los 3 s habituales: un nino leyendo en su segundo idioma necesita mas tiempo (WCAG 2.2.1). | — | OK |

### Correccion y tipos

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| L-1 | **`ExamTimer` escuchaba `visibilitychange` en `window`.** Ese evento se dispara en `document`. El resincronizado al volver de una pestana en segundo plano **no funcionaba nunca**, que es justo el caso que se queria cubrir (el navegador congela `setInterval` en pestanas ocultas). | **Alta** | **C** — se escucha en `document`, manteniendo `focus` en `window`. |
| L-2 | `OrderingList` guardaba el mensaje de la region viva en un `useRef`. Mutar un ref no provoca render: el anuncio solo llegaba de rebote porque el padre re-renderizaba. Fragil. | Media | **C** — pasa a `useState`. |
| L-3 | **`StatTile` renderizaba `<dd>` antes de `<dt>`** y los recolocaba con `order`. El modelo de contenido de `<dl>` exige `dt` antes de `dd`; axe lo marca con la regla `definition-list`. | Media | **C** — orden correcto en el DOM, orden visual con `flex-col-reverse`. |
| L-4 | `Accordion` pasaba `defaultValue={defaultOpen[0]}`, que con `noUncheckedIndexedAccess` es `string \| undefined`, y con `exactOptionalPropertyTypes: true` no se puede pasar a una prop opcional de Radix. No compilaria. | Media | **C** — spread condicional. |
| L-5 | `Toast` pasaba `duration={Infinity}` a Radix cuando `duration === 0`. Radix hace aritmetica con ese valor. | Baja | **C** — se usa `Number.MAX_SAFE_INTEGER`. |
| L-6 | `SafeSvg` exigia `label`, y `QuestionCard` le pasaba `""` cuando faltaba `figureAlt`, produciendo un `role="img"` sin nombre (aunque dentro de un `aria-hidden`). | Baja | **C** — `SafeSvg` acepta `decorative` y entonces no emite `role="img"`. |
| L-7 | `LiveRegion` guardaba un `useRef` (`frame`) que no se leia nunca. | Baja | **C** — eliminado. |
| L-8 | `Skeleton` aplicaba `className` a **cada linea** en vez de al contenedor: API contraintuitiva. | Baja | **C** — `className` al contenedor. |
| L-9 | El barrido para `exactOptionalPropertyTypes` amplio 227 props opcionales a `T \| undefined`, incluidas 11 de tipo funcion. Revisadas una a una. | — | OK |
| L-10 | `ExamTimer` calcula el tiempo restante **una sola vez** desde la referencia del servidor y lo descuenta con `performance.now()`. El reloj de pared del cliente no se consulta jamas. Cubierto por tests con reloj adelantado, atrasado y modificado a mitad. | — | OK |

### Arquitectura

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| A-1 | `LessonBlock` obliga a `"use client"` en toda la cadena de leccion, porque `FractionText` necesita el contexto de idioma. Contradice en parte "Server Components por defecto" del stack. | Media | **A** — aceptado y documentado. La alternativa (pasar `locale` como prop hasta la ultima hoja) ensucia toda la API publica. El contenido de leccion es estatico y se hidrata barato; si el peso del bundle llega a molestar, la salida es una variante `LessonBlockStatic` que reciba `locale` por prop. |
| A-2 | El paquete no depende de `next`: se puede usar desde cualquier app React. | — | OK |
| A-3 | Ninguna dependencia se ha instalado (prohibido por el protocolo de 5 agentes en paralelo). `pnpm typecheck` y `pnpm test` **no se han ejecutado**: no hay `node_modules`. Esto es una limitacion real de esta entrega. | — | **A**, ver §4 |

---

## 3. Que hace falta verificar al integrar

Como no se ha podido instalar, estas son las comprobaciones pendientes, en orden:

1. `pnpm install` en la raiz y `pnpm --filter @cet/ui typecheck`.
   Riesgo concreto: `exactOptionalPropertyTypes` contra las props de Radix.
2. `pnpm --filter @cet/ui test`. El test mas importante es
   `__tests__/sanitize.test.ts`: si algo de ahi falla, no se despliega.
3. Anadir al ESLint del repo la regla que hace cumplir la frontera de seguridad:

   ```jsonc
   {
     "rules": { "react/no-danger": "error" },
     "overrides": [
       { "files": ["packages/ui/src/lib/safe-html.tsx"], "rules": { "react/no-danger": "off" } }
     ]
   }
   ```

4. Verificacion manual de contraste en navegador con el tema oscuro del sistema
   **y sin** `data-theme`, que es el caso que produjo el hallazgo C-1.
5. Prueba con lector de pantalla real (NVDA o VoiceOver) de `FractionText`,
   `ChoiceList` y `ExamTimer`. `jest-axe` no cubre como suena algo.

---

## 4. Resumen

- Hallazgos abiertos en la pasada 2: **19**.
- Corregidos en la pasada 3: **16**.
- Aceptados con justificacion: **3** (C-4, C-5, A-1) mas la limitacion A-3.
- Fallos de accesibilidad **reales** encontrados y corregidos: 4 (C-1, C-2, C-3, F-1)
  mas 2 de cableado ARIA (F-5, L-3).
- Fallos funcionales reales encontrados y corregidos: 2 (L-1, L-2).
