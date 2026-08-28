---
id: obs2-migas-de-pan
model: chat
territory: [apps/web/src/components/nav/Migas.tsx, apps/web/src/components/nav/Migas.test.tsx]
forbidden: [apps/web/src/components/nav/StudentNav.tsx, apps/web/src/components/nav/StudentNav.test.ts, apps/web/src/lib/routes.ts, packages/ui/src/index.ts]
context: [apps/web/src/components/nav/StudentNav.tsx, apps/web/src/components/nav/StudentNav.test.ts, apps/web/src/components/auth/PinInput.test.tsx, apps/web/vitest.config.ts, apps/web/src/lib/routes.ts]
verify: pnpm --filter @cet/web exec vitest run src/components/nav
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 4
deadline: 4 rondas o 25 min
---

## 1 · El problema

En `/learn/<id>` y en `/practice/<tema>` el alumno no sabe donde esta. La
informacion de ubicacion **existe y se pinta**, pero como texto muerto: el curso
y el modulo son un `<p>`, y lo unico navegable es un enlace gris que dice
«Volver a tus lecciones» sin decir a donde vuelve.

Este encargo escribe el componente que falta: unas migas de pan. **Solo el
componente y su prueba.** El cableado en las paginas y los rotulos traducidos
los pone otra persona: por eso el componente no conoce ningun diccionario y
recibe los rotulos ya resueltos.

## 2 · La evidencia que ya tenemos

`apps/web/src/app/(student)/learn/[lessonId]/page.tsx`, lineas 70-79, pinta esto
—y el `<p>` de la linea 72 no es un enlace:

```
          <BackLink label={t.backToIndex} />
          {lesson.courseTitle || lesson.moduleTitle ? (
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              {[lesson.courseTitle, lesson.moduleTitle]
```

`apps/web/src/app/(student)/practice/[skillCode]/page.tsx`, lineas 62-68: la
misma carencia, otro enlace suelto.

El rail de la izquierda (`StudentNav.tsx`) **si** responde «en que seccion
estoy»: marca la pestana activa con `aria-current`, con color y con una barra, y
lo hace tambien en las subrutas. Lo dice su propio comentario, linea 104:

```
   * "¿dónde estoy?" se quedaría sin responder justo en las pantallas
   * profundas, que son las únicas donde uno se pierde.
```

Lo que falta es el eslabon entre la seccion y la pantalla concreta. Eso son las
migas, y no existen: un `git grep -i breadcrumb` sobre `apps/web` no devuelve
nada.

## 3 · El criterio de aceptacion

`pnpm --filter @cet/web exec vitest run src/components/nav` sale en verde —los
tests que ya existen de `StudentNav` incluidos, y esos no los puedes tocar— con
dos ficheros nuevos:

### 3.1 · `apps/web/src/components/nav/Migas.tsx`

Un componente cliente (`"use client"` arriba, como `StudentNav.tsx`) con esta
forma exacta:

```ts
export interface Miga {
  /** Rotulo ya resuelto al idioma del alumno. Nunca una clave de diccionario. */
  readonly label: string;
  /** Destino. Si falta, el escalon se pinta como texto y no como enlace. */
  readonly href?: string | undefined;
}

export interface MigasProps {
  /** Nombre accesible del `<nav>`, ya traducido. Ej.: "Ruta". */
  readonly label: string;
  /** De la raiz al sitio actual. El ULTIMO es siempre el sitio actual. */
  readonly items: readonly Miga[];
  readonly className?: string | undefined;
}

export function Migas({ label, items, className }: MigasProps): ReactNode
```

Estructura, y cada regla cierra un fallo concreto:

1. Un `<nav aria-label={label}>` que contiene una `<ol>` con un `<li>` por
   escalon. La estructura la da la lista, no los separadores.
2. **El ultimo escalon nunca es un enlace**, aunque traiga `href`. Se pinta como
   `<span>` con `aria-current="page"`. Un enlace a la pagina en la que ya estas
   es un clic que no hace nada, y para un lector de pantalla es una promesa
   falsa.
3. Un escalon **intermedio con `href`** se pinta con `<Link>` de
   `next/link`. Un escalon **intermedio sin `href`** se pinta como `<span>` sin
   `aria-current`: que un modulo todavia no tenga pagina propia no es motivo
   para ocultarle al alumno en que modulo esta.
4. El separador `›` va en un `<span aria-hidden="true">` **entre** escalones, y
   no despues del ultimo.
5. `items` vacio: el componente devuelve `null`. Un `<nav>` con una lista vacia
   es ruido para un lector de pantalla.
6. Los enlaces tienen blanco de toque: `min-h-11` e `inline-flex items-center`,
   igual que el `BackLink` que sustituyen. Un dedo de once anos no acierta un
   objetivo de 16 px.
7. Estilo con las clases de la app que ya usa `StudentNav.tsx` —`text-muted`,
   `text-ink`, `focus-visible:outline-2 focus-visible:outline-offset-2`—. **No
   escribas ningun hexadecimal**: hay un invariante en el repositorio que exige
   una sola paleta y la unica hoja que da valor a un color es `tokens.css`.

### 3.2 · `apps/web/src/components/nav/Migas.test.tsx`

Extension `.tsx`, no `.ts`: `vitest.config.ts` asigna jsdom por la extension
(`environmentMatchGlobs`), y con `.ts` el test correria en Node sin DOM.

Monta el componente de verdad con `@testing-library/react` y demuestra:

1. El `<nav>` tiene el nombre accesible que se le paso
   (`screen.getByRole("navigation", { name: "Ruta" })`).
2. Con tres escalones, los dos primeros con `href` y el tercero sin el: hay
   **exactamente dos** enlaces (`getAllByRole("link")`), y el tercer rotulo
   existe en el documento pero **no** es un enlace.
3. El ultimo escalon lleva `aria-current="page"` y **ninguno de los otros** lo
   lleva.
4. Un ultimo escalon **con** `href` sigue sin ser enlace: el `href` del ultimo
   se ignora a proposito. Comprueba que el numero de enlaces no sube.
5. Un escalon intermedio **sin** `href` aparece como texto, no desaparece: el
   documento contiene su rotulo y `getAllByRole("link")` no lo incluye.

   **Cuenta los enlaces con la regla 2 puesta, no sin ella.** Un intento
   anterior escribio este mismo test con esta entrada:

   ```
   [ {Aprender, /learn}, {Matematicas}, {Fracciones, /learn/fracciones} ]
   ```

   y afirmo `toHaveLength(2)`. Es **falso**, y el test murio ahi: «Aprender» es
   intermedio y con `href`, luego es enlace; «Matematicas» es intermedio y sin
   `href`, luego es texto; «Fracciones» es el **ultimo**, y el ultimo nunca es
   enlace **aunque traiga `href`**. Enlaces: **uno**.

   Antes de escribir cada numero, recorre tu fixture escalon por escalon y
   apunta en un comentario cual es enlace y cual no. La regla que tu mismo
   escribiste en el test 4 tiene que valer tambien en el 5.
6. Con `items: []` no se pinta nada: `queryByRole("navigation")` es `null`.
7. Los separadores no se anuncian: hay `items.length - 1` elementos con
   `aria-hidden="true"` que contienen el glifo, y el `textContent` accesible del
   `<nav>` —el que ve un lector— no termina en el separador.

Escribe cada `it` de forma que **falle si borras la regla que protege**. En el
comentario de cada uno, di cual es la mutacion que lo pondria rojo. Ejemplo: el
test 4 falla si alguien decide pintar el ultimo escalon como `<Link>` «porque
tiene href».

`next/link` funciona en jsdom sin router en las pruebas de este repositorio;
`PinInput.test.tsx` es un ejemplo del estilo de montaje que se usa aqui. Si aun
asi `next/link` te diese problemas en el entorno de test, **no lo sustituyas por
un `<a>`**: doblalo con `vi.mock("next/link", ...)` devolviendo un `<a>`, y dilo
en un comentario. El componente de produccion tiene que usar `next/link` o
rompe la navegacion sin recarga.

## 4 · Que NO cuenta como resuelto

- **Tocar `StudentNav.tsx` o su test.** Estan prohibidos. El rail funciona; lo
  que faltaba era el eslabon de abajo.
- **Tocar las paginas de `app/(student)/`.** Estan fuera del territorio. Este
  encargo entrega el componente; el cableado y los rotulos los pone otro.
- **Meter un diccionario dentro del componente.** Recibe `label` y los `label`
  de cada escalon ya resueltos. Un componente de navegacion que importe
  `getDictionary` deja de servir para las dos pantallas que lo necesitan.
- **Escribir un hexadecimal, un `rgb()` o un `hsl()`.** Hay un invariante que lo
  caza (`una-sola-paleta.test.ts`) y ademas es la causa raiz de un fallo de
  contraste de 1.57:1 que ya costo una jornada. Usa las clases existentes.
- **Un `aria-current` en todos los escalones.** «Actual» hay uno. Si el test 3
  solo comprueba que el ultimo lo lleva y no que los otros **no**, no protege
  nada: comprueba las dos mitades.
- **Un test que afirme sobre el array que tu mismo construiste.** Las
  afirmaciones van sobre el DOM que renderiza el componente, consultado por rol
  y por nombre accesible. Comparar un valor consigo mismo ya paso aqui siete
  veces en un dia.
- **Usar `getByText` donde se pueda usar `getByRole`.** El encargo es de
  accesibilidad: si el test no consulta por rol, no esta comprobando lo que un
  lector de pantalla percibe, que es exactamente el requisito.
- **Anadir una dependencia.** No hace falta ninguna: `@testing-library/react` y
  `@testing-library/dom` ya estan en `apps/web`.
- **Renderizar el separador como texto suelto dentro del `<li>` sin
  `aria-hidden`.** Un lector diria «mayor que» entre cada escalon.
