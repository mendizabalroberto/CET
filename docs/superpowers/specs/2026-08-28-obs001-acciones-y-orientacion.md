# obs001 — La zona de acciones y el «dónde estoy»

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Origen: `obs/obs001.docx`, dos capturas anotadas a mano.
> Estado: **diseñado, con contratos escritos y medidas tomadas.**

---

## 0 · Qué dice el documento

`obs001.docx` no trae prosa: trae dos capturas con globos de texto encima. Los
globos, literales:

**Sobre la pantalla de práctica** (`/practice/<tema>`):

> «Mover y ordenar estos botones a esta zona, más ordenado y predecible.»
> «Generar paleta para botones, mal contraste y tamaños diversos confunden, debe
> todo cuadrar.»

**Sobre la pantalla de lección** (`/learn/<id>`):

> «Agregar o un botón o link para que el alumno sepa dónde está y cómo moverse
> directamente a otras partes de la navegación, ya sea en la parte superior,
> inferior o menú de la izquierda, analizar y mejorar.»

Son dos observaciones, y las dos son de forma. Lo interesante es que **las dos se
pueden medir**, y por eso las dos se pueden delegar (§5).

---

## 1 · Observación A — cuatro acciones, tres implementaciones

### 1.1 · Lo que se ve en la captura

Debajo del campo de respuesta hay cuatro acciones repartidas en tres bloques
verticales distintos:

```
[ Comprobar ] [ Saltar ]        ← fila 1
[ Ver una pista ]               ← fila 2, ámbar, sola
[ Ver cómo se hace ]            ← fila 3, gris, sola
```

### 1.2 · Por qué pasa, en el código

No es un descuido de maquetación: es que **no hay un solo componente de botón**.

`apps/web/src/components/learn/PracticeSession.tsx:490` monta las dos primeras
con el `Button` del design system. Las otras dos no las monta esa pantalla: las
monta cada panel por su cuenta, y cada panel se escribió su propio `<button>` a
mano:

| Acción | Quién la pinta | Con qué |
|---|---|---|
| Comprobar | `PracticeSession.tsx:491` | `Button` `variant="primary"` `size="md"` |
| Saltar | `PracticeSession.tsx:494` | `Button` `variant="secondary"` `size="md"` |
| Ver una pista | `packages/ui/src/feedback/HintPanel.tsx:39` | `<button>` a mano |
| Ver cómo se hace | `packages/ui/src/feedback/SolutionPanel.tsx:51` | `<button>` a mano |

De ahí salen las tres quejas del globo, y ninguna es de gusto:

**«tamaños diversos».** `Button` `md` usa `px-5` y `border` (1 px). Los dos
`<button>` a mano usan `px-4` y `border-2` (2 px). Puestos uno encima de otro,
dos botones con el mismo texto medirían distinto.

**«mal contraste».** Medido sobre los hexadecimales de `tokens.css`, tema claro:

| Par | Ratio | Umbral | ¿Cumple? |
|---|---|---|---|
| Contorno de «Ver una pista» — `--cet-hint-accent` #f2a71b sobre `--cet-surface` #ffffff | **2.04:1** | 3:1 (WCAG 1.4.11) | **No** |
| Contorno de «Ver cómo se hace» — `--cet-border-strong` #7d92a8 sobre #ffffff | 3.21:1 | 3:1 | Sí |
| Contorno de `Button secondary` — `--cet-border-strong` | 3.21:1 | 3:1 | Sí |

El botón ámbar es el único control de la pantalla cuyo contorno **no se ve**
sobre la tarjeta blanca. Y no es un caso nuevo: `contraste-tokens.test.ts`
declara en su cabecera que el par ámbar es «un defecto ABIERTO y documentado»
que se dejó fuera de la lista de pares para no dejar la suite roja. Esta
observación es ese defecto, visto por un humano en una pantalla.

En tema oscuro el mismo par da 10.16:1 y no se nota nada. Por eso llevaba
meses ahí.

**«mover y ordenar a esta zona».** Las cuatro acciones son hermanas
—todas responden a «¿y ahora qué hago?»— pero el DOM las tiene en tres
contenedores distintos, sin nombre y sin agrupar. Un lector de pantalla no
anuncia ninguna relación entre ellas.

### 1.3 · La decisión

**Un solo componente pinta todos los botones: `Button`.** Los paneles dejan de
escribir `<button>` a mano y pasan a pedirle el disparador al design system.
Esto resuelve el tamaño por construcción: no hay dos escalas porque no hay dos
implementaciones.

**Una sola paleta de acción, con dos niveles y no cuatro:**

| Nivel | Variante | Quién |
|---|---|---|
| La acción principal, una y solo una | `primary` — relleno navy, 11.53:1 | Comprobar / Siguiente pregunta |
| Todo lo demás, idéntico entre sí | `secondary` — contorno `border-strong`, 3.21:1 | Saltar · Ver una pista · Ver cómo se hace |

La identidad de «pista» no desaparece: se traslada del **cromado del botón** a
un **punto ámbar dentro** de él, y sigue viviendo entera en el cuerpo del panel
(borde izquierdo ámbar, fondo `--cet-hint-bg`). Es la misma regla que ya imponen
`color-unico-canal.test.tsx` y `estados-no-solo-color.test.tsx`: el color nunca
es la única señal. Aquí, además, deja de ser una señal que no se ve.

El ámbar que sí se puede rellenar existe y ya está medido: `--cet-on-vivid`
sobre `--cet-hint-vivid` da 11.09:1 y está en la lista de pares verificados. No
se usa aquí porque dos botones rellenos compitiendo entre sí es exactamente el
«no cuadra» del globo: relleno hay uno, y es el que el alumno debe pulsar.

**Una sola zona, con orden fijo y nombre accesible:**

```
┌─ role="group" aria-label="Acciones" ───────────────┐
│ [ Comprobar        ]  [ Saltar           ]         │
│ [ Ver una pista    ]  [ Ver cómo se hace ]         │
│ (panel de pista, si está abierto — ancho completo) │
│ (panel de solución, si está abierto)               │
└────────────────────────────────────────────────────┘
```

Orden fijo y predecible: primero lo que cierra la pregunta, después lo que la
esquiva, después las dos ayudas, de menor a mayor. En móvil las dos columnas se
apilan y cada botón ocupa el ancho; en tableta y escritorio quedan en rejilla de
dos, que es lo que hace que «cuadre».

El disparador deja de ir pegado a su panel, así que `HintPanel` y `SolutionPanel`
necesitan poder pintar **solo el disparador** o **solo el cuerpo**. Es un cambio
de API acotado y con prueba.

---

## 2 · Observación B — «dónde estoy y cómo me muevo»

### 2.1 · Lo que hay hoy

`/learn/<id>` abre con esto (`page.tsx:70`, componente `BackLink` en la línea 128):

```
Volver a tus lecciones
MATEMÁTICAS — 6º · THE 8 TOPICS ON YOUR EXAM
Comparing & simplifying fractions
```

Tres líneas que contienen toda la información de ubicación que hace falta, y
**ninguna de las tres es navegable salvo la primera**. «MATEMÁTICAS — 6º» y «THE
8 TOPICS ON YOUR EXAM» son un `<p>` de texto muerto: nombran el curso y el
módulo donde está el alumno, y no llevan a ninguna parte. El único camino es un
enlace gris de 14 px que dice «volver» sin decir adónde.

La misma carencia, idéntica, en `/practice/<tema>` (`page.tsx:63`): un
«Volver a los temas» suelto.

El raíl de la izquierda (`StudentNav`) sí responde «¿en qué sección estoy?» —
tiene `aria-current`, color y una barra— pero no responde «¿dónde dentro de la
sección?», que es justo lo que se pierde en las pantallas profundas. Su propio
comentario lo dice: las pantallas profundas «son las únicas donde uno se
pierde».

### 2.2 · La decisión

**Migas de pan.** Un `<nav aria-label="Ruta">` que sustituye al enlace suelto y
convierte en enlaces las tres líneas que ya existían:

```
Aprender  ›  Matemáticas — 6º  ›  The 8 topics on your exam  ›  Comparing & simplifying fractions
```

Reglas, y cada una cierra un fallo concreto:

- El **último escalón es el sitio actual**: se pinta como texto, no como enlace,
  y lleva `aria-current="page"`. Un enlace a la página en la que ya estás es un
  clic que no hace nada, y para un lector de pantalla es una promesa falsa.
- Los escalones **sin destino se degradan a texto**, no desaparecen. Que el
  módulo no tenga página propia todavía no es motivo para ocultarle al alumno
  en qué módulo está.
- El separador `›` es `aria-hidden`: la estructura la da la lista, no el glifo.
- Va **antes** del `<h1>` en el DOM, que es el orden en que se lee una página.
- No lleva diccionario dentro: recibe los rótulos ya resueltos. Así el mismo
  componente sirve para lección y para práctica sin conocer ninguna de las dos.

Se monta en `/learn/<id>` y en `/practice/<tema>`. En `/exam/<id>/run` **no**:
ahí `StudentNav` ya se apaga a propósito, y unas migas que ofrezcan salir a
«Aprender» durante un examen cronometrado son la misma fuga por otra puerta.

---

## 3 · Qué NO entra

- **Rediseñar `StudentNav`.** El globo dice «arriba, abajo o menú de la
  izquierda, analizar y mejorar». Analizado: el raíl responde bien a la pregunta
  de sección y ya tiene `aria-current`, doble señal y 44 px de blanco de toque.
  Lo que faltaba era el eslabón entre la sección y la pantalla, y eso son las
  migas. Tocar el raíl además sería tocar el examen (§2.2).
- **Cambiar el ámbar del sistema.** El defecto de 1.92:1 entre `--cet-hint-accent`
  y `--cet-hint-bg` sigue abierto para el **cuerpo** del panel. Aquí solo se
  retira ese ámbar del **contorno de un control**, que es donde el umbral es
  exigible y donde se vio el fallo. Cambiar la paleta ámbar entera es otro
  encargo y toca `tokens.css`, que es territorio de nadie en este lote.
- **La captura del examen.** No aparece en `obs001.docx`.

---

## 4 · Criterios de aceptación

Ejecutables, por código de salida:

1. Ningún fichero de `packages/ui/src/feedback/` contiene un `<button>` literal:
   todos los disparadores pasan por `Button`.
2. Los cuatro disparadores de la práctica comparten variante de tamaño: mismo
   `min-h`, mismo `px`, mismo grosor de borde.
3. `Button` `secondary` es el contorno de las tres acciones no principales, y su
   par `border-strong`/`surface` sigue midiéndose en `contraste-tokens.test.ts`
   con umbral 3:1 en los dos temas.
4. `PracticeSession` monta las cuatro acciones dentro de **un** contenedor con
   `role="group"` y nombre accesible, y en el orden declarado. El test falla si
   alguien las vuelve a repartir.
5. Las migas pintan el último escalón sin `href` y con `aria-current="page"`, los
   intermedios con `href` como enlaces, y los que no traen destino como texto.
6. `pnpm verify` en verde: typecheck, lint, test y build.

---

## 5 · Reparto — qué se delega a DeepSeek y qué no

`HANDOFF-DEEPSEEK.md §0.2` es tajante: DeepSeek no ve imágenes, y por eso un
contrato que toque componentes visibles «es un contrato mal repartido».

Esta observación **es** visual. La única forma honesta de delegarla es la que se
aplica aquí: **traducir cada queja a un número o a una estructura que una
máquina pueda comprobar sin verla.** «Mal contraste» es 2.04:1 contra 3:1. «Tamaños
diversos» son `px-4 border-2` contra `px-5 border`. «Ordenar en una zona» es un
`role="group"` con cuatro hijos en un orden declarado. Una vez traducido, el
encargo deja de ser visual y pasa a ser verificable por código de salida — que es
el único criterio que este motor acepta.

Lo que no se traduce, no se delega:

| Parte | Quién | Por qué |
|---|---|---|
| Paleta de botones y disparadores por `Button` | DeepSeek `obs1-paleta-de-botones` | Contraste y tamaños son números |
| Zona de acciones agrupada y ordenada | DeepSeek `obs1-zona-de-acciones` | Orden en el DOM es estructura |
| Componente de migas de pan | DeepSeek `obs2-migas-de-pan` | `href`/`aria-current` son estructura |
| Cableado en las páginas, rótulos i18n, exportación del barril | **Yo** | El barril es ajeno siempre (§5.2) y los rótulos cruzan tres diccionarios |
| **Mirar que quede bien** | **Yo, con capturas** | §5.5. Un agente que no ve no puede cumplirlo, y «cuadra» es un juicio de ojo |

Los tres contratos tienen territorios disjuntos (`packages/ui/src/{primitives,feedback}`,
`apps/web/src/components/learn`, `apps/web/src/components/nav`) y ninguno depende
del resultado de otro, así que salen en un solo lote.

El motor hace la contraprueba por mutación en cada uno: revierte el código y deja
los tests: si siguen verdes, el parche se rechaza por falso verde. Es lo que
impide que «pasa el test del orden» signifique «el test no mira el orden».

---

## 6 · Después

1. Aplicar las tres ramas `deepseek/*` sobre `main`.
2. Cablear migas y rótulos (mío).
3. `pnpm verify`.
4. Capturas de las dos pantallas, claro y oscuro, 360 px y escritorio → `tocheck/`.
5. Desplegar.
