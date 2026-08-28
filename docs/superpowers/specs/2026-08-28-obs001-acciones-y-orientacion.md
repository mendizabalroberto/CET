# obs001 — La zona de acciones y el «dónde estoy»

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Origen: `obs/obs001.docx`, dos capturas anotadas a mano.
> Estado: **ejecutado y verificado.** `pnpm verify` en verde el 28 de agosto de 2026.

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

El motor hace la contraprueba por mutación en cada uno: revierte el código y deja
los tests: si siguen verdes, el parche se rechaza por falso verde. Es lo que
impide que «pasa el test del orden» signifique «el test no mira el orden».

### 5.1 · Cómo salió, de verdad

Dos lotes y no uno. La zona de acciones necesita la API `part` que entrega el
contrato de la paleta, y un lote corre en paralelo desde el mismo `HEAD`: no
puede apoyarse en lo que otro está escribiendo a la vez.

| Contrato | Lote | Rondas | Coste |
|---|---|---|---|
| `obs1-paleta-de-botones` | 1 | 3 de 4 | $0.044 (el lote entero) |
| `obs2-migas-de-pan` | 1 → relanzado ×2 | 4 (rojo) → 1 → 1 | $0.026 |
| `obs1-zona-de-acciones` | 2 → relanzado | 4 (rojo) → 1 | $0.035 |

**Los tres rojos fueron defectos del contrato, no del agente**, y los tres se
arreglaron escribiendo en el contrato el dato que faltaba:

1. *Migas.* Su propio test contaba dos enlaces donde su propia regla obligaba a
   uno. Se añadió el recorrido escalón por escalón del fixture.
2. *Zona, primer rojo.* Pedí un test de «sin pista, tres botones» que **no se
   puede montar**: `hint` es obligatorio en `PracticeItem`. Culpa mía; el
   contrato pedía algo que no existe.
3. *Zona, segundo rojo.* El agente volvía a buscar el botón por su nombre
   **después** de pulsarlo, y `HintPanel` lo renombra de «Ver una pista» a
   «Pista» al abrirse. Se añadió la trampa al contrato, con la forma correcta.

La lección se sostiene: cuando el motor sale rojo cuatro veces con la misma
salida, lo que hay que releer es el encargo.

### 5.2 · Dos fallos que el motor no podía encontrar

**Un fichero nuevo se perdía al consolidar.** `obs2-migas-de-pan` salió verde y
la rama se quedó con el test y **sin el componente que ese test probaba**.
`git diff` no ve un fichero sin indexar, así que el parche verde salía vacío;
la contraprueba sí borraba el fichero nuevo, y al restaurar no había nada que
restaurar. Arreglado en `run-contract.mjs`: se indexa antes de medir
(`git add -A` + `git diff --cached`), se limpia antes de restaurar, y si la
restauración falla el motor se para en vez de dejar media rama.

**«Comprobar» llevaba meses ilegible.** Al mirar la captura —lo único que
ningún contrato podía hacer— el botón principal pintaba su texto en `#12202f`
sobre `#173a63`: **1.53:1**, donde el token prometía 11.53:1.

La causa no estaba en la paleta. `tailwind-merge` no lee la configuración de
Tailwind: no reconoce `text-body` como un tamaño, lo mete en el mismo grupo que
`text-[var(--cet-on-primary)]`, y de dos clases del mismo grupo se queda con la
última. `Button` compone variante y **después** tamaño, así que el color
desaparecía del atributo `class` en toda variante con tinta propia: `primary`,
`accent` y `danger`.

`contraste-tokens.test.ts` no podía cazarlo, y no por descuido: mide los
hexadecimales de la hoja, y los hexadecimales estaban bien. Lo que fallaba era
el tramo del token a la clase, que nadie vigilaba. Ahora sí:
`cn.ts` le declara la escala a `tailwind-merge` y
`packages/ui/__tests__/boton-conserva-su-tinta.test.ts` cubre ese tramo, con la
contraprueba hecha: revertido el arreglo, sus tres casos caen en rojo.

Es el argumento entero de §5, del derecho y del revés. Traducir lo visual a
números deja delegar casi todo; lo que no se puede traducir es mirar.

---

## 6 · Lo que además hizo falta

**Las vistas previas de `/dev/*` son públicas en desarrollo.** No lo eran, y el
middleware las mandaba a `/login` antes de que su propio `notFound()` llegara a
ejecutarse: existían para poder mirar una pantalla sin teclear el PIN de un
alumno, y no servían para eso. En producción no cambia nada —la comparación es
falsa y además la página responde 404—, y hay tres tests que lo fijan. Sin esta
excepción, el fallo de contraste de «Comprobar» seguiría sin descubrirse.

**Migas: tres señales, no dos.** Al verlas en pantalla, un escalón enlazado y
uno muerto salían idénticos, los dos en gris apagado: la pregunta «cómo me
muevo» se quedaba otra vez sin responder. Ahora son tres colores distintos —teal
se pulsa, gris solo sitúa, tinta en negrita es dónde estás— y el enlace se
subraya al pasar por encima, porque el color nunca va solo.

**El disparador de ayuda acepta el ancho del llamante.** Salía `w-fit` dentro
de una celda de la rejilla, así que las dos filas no cuadraban entre sí. El
ancho lo decide ahora el contenedor.

## 7 · Evidencia

- `pnpm verify` en verde: typecheck, lint, **1.461 tests** y build.
- Capturas en `tocheck/`: `obs001-acciones-*`, `obs001-zona-*-detalle`,
  `obs001-migas-*`.
- Vistas previas para volver a mirarlo: `/dev/keyboard-preview` (la zona de
  acciones dentro de la práctica real) y `/dev/migas-preview` (los cuatro casos
  de la ruta).
