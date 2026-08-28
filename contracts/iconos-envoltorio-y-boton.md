---
id: iconos-envoltorio-y-boton
model: chat
territory: [packages/ui/src/icons/Icono.tsx, packages/ui/src/primitives/Button.tsx, packages/ui/__tests__/iconos.test.tsx]
forbidden: [packages/ui/src/index.ts, packages/ui/src/icons/registro.ts, packages/ui/src/tokens.css, packages/ui/src/lib/cn.ts, packages/ui/__tests__/boton-conserva-su-tinta.test.ts, packages/ui/__tests__/paleta-de-botones.test.tsx, packages/ui/__tests__/a11y.test.tsx]
context: [packages/ui/src/primitives/Button.tsx, packages/ui/src/icons/registro.ts, packages/ui/src/lib/cn.ts, packages/ui/__tests__/boton-conserva-su-tinta.test.ts, packages/ui/src/feedback/HintPanel.tsx]
verify: pnpm --filter @cet/ui exec vitest run __tests__/iconos.test.tsx __tests__/a11y.test.tsx __tests__/paleta-de-botones.test.tsx __tests__/boton-conserva-su-tinta.test.ts
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 4
deadline: 4 rondas o 25 min
---

## 1 · El problema

El publico de esta aplicacion son ninos de unos once anos, y prefieren
intercambiar informacion por la via visual. Los botones son solo texto.

El registro de iconos **ya existe** y esta cerrado:
`packages/ui/src/icons/registro.ts` mapea nombres de producto (`comprobar`,
`saltar`, `pista`, `solucion`, ...) a dibujos de `lucide-react`. Es el unico
fichero del monorepo que importa esa libreria, y **no es tuyo**: esta prohibido.

Falta lo que lo conecta con la pantalla: el envoltorio que pinta un icono con el
tamano y el trazo correctos, y la prop de `Button` que lo coloca. Eso es este
encargo.

## 2 · La evidencia que ya tenemos

### 2.1 · Lo que exporta el registro

```ts
export const ICONOS = { comprobar: Check, siguiente: ArrowRight, ... } satisfies Record<string, LucideIcon>;
export type NombreDeIcono = keyof typeof ICONOS;
export function esNombreDeIcono(valor: string): valor is NombreDeIcono;
```

Un `LucideIcon` es un componente de React que acepta `size`, `strokeWidth`,
`className`, `aria-hidden` y demas atributos de `<svg>`, y pinta con
`currentColor`.

### 2.2 · Como compone `Button` sus clases hoy

```
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-sm font-semibold",
        ...
        VARIANTS[variant],
        SIZES[size],
```

Ya lleva `gap-2` y `inline-flex`: el hueco para el icono existe, no hay que
inventarlo.

Y `SIZES`:

```
  sm: "min-h-touch px-4 text-body-sm",
  md: "min-h-touch px-5 text-body",
  lg: "min-h-touch-comfy px-7 text-body-lg",
```

### 2.3 · La trampa que ya costo una jornada en este fichero

`cn` es `tailwind-merge`, y **borra la clase que considere del mismo grupo que
otra posterior**. En este mismo `Button`, `text-body` (del tamano) se comia
`text-[var(--cet-on-primary)]` (de la variante), y «Comprobar» acabo pintado a
**1.53:1** donde el token prometia 11.53:1.

`cn.ts` ya declara la escala tipografica y esta **prohibido**; el invariante que
lo vigila, `boton-conserva-su-tinta.test.ts`, tambien. Lo que te toca a ti es no
reabrir el agujero por otro lado: **no des el tamano del icono con una clase de
Tailwind** (`h-4 w-4`, `size-5`...) que pueda entrar en conflicto con lo que ya
compone `Button`. Pasalo por la prop `size` del componente de Lucide, que acaba
en el atributo `width`/`height` del `<svg>` y no pasa por `cn`.

## 3 · El criterio de aceptacion

La orden de `verify` sale en verde —incluidos los tres ficheros de invariantes
ya existentes, que estan prohibidos y **tienen que seguir pasando**— con:

### 3.1 · `packages/ui/src/icons/Icono.tsx`

```ts
export interface IconoProps {
  readonly nombre: NombreDeIcono;
  /** Lado del cuadro, en pixeles. */
  readonly tamano?: number | undefined;
  readonly className?: string | undefined;
}
export function Icono({ nombre, tamano, className }: IconoProps): ReactNode
```

Reglas:

1. **`aria-hidden="true"` SIEMPRE, y sin excepcion ni prop para desactivarlo.**
   En esta aplicacion el icono nunca va solo: siempre acompana al texto del
   boton, que ya da el nombre accesible. Un icono anunciado lo diria dos veces.
2. **`focusable="false"`** ademas del `aria-hidden`: en algunos navegadores un
   `<svg>` entra en el orden de tabulacion aunque este oculto para el lector, y
   entonces el alumno pulsa el tabulador y el foco cae en un dibujo.
3. `tamano` por defecto **18**. Se pasa por la prop `size` del componente de
   Lucide, no por una clase.
4. `strokeWidth` **2**, explicito.
5. `shrink-0` en el `className`: dentro de un `inline-flex` con texto largo, un
   `<svg>` sin eso se aplasta hasta ser ilegible cuando el boton se estrecha.
   Esa clase no choca con nada de `Button`.
6. **Sin `"use client"`.** La leccion se pinta en el SERVIDOR y este componente
   entra ahi. `rsc-boundary.test.ts` vigila ese limite. El icono no tiene estado
   ni manejadores: no lo necesita.

### 3.2 · `Button` gana `icon`

```ts
  /** Nombre del registro. El icono va SIEMPRE antes del texto. */
  readonly icon?: NombreDeIcono | undefined;
```

- Se pinta **antes** de `children`, dentro del mismo `<Comp>`. El `gap-2` que ya
  hay lo separa; no anadas margenes.
- El tamano sale del `size` del boton: **18** en `sm` y `md`, **20** en `lg`. Es
  una tabla al lado de `SIZES`, no un `if` suelto.
- Sin `icon`, el boton se pinta **exactamente** como hoy: nada de un `<span>`
  vacio ni un hueco reservado. Hay tests existentes que comparan el `className`
  y el nombre accesible de botones sin icono, y estan prohibidos.
- El nombre accesible **no cambia** al anadir icono: sigue siendo el texto. Es
  lo que comprueban `paleta-de-botones.test.tsx` y `a11y.test.tsx`.

### 3.3 · `packages/ui/__tests__/iconos.test.tsx`

Monta los componentes de verdad con `@testing-library/react` y demuestra:

1. **El icono llega a la pantalla.** `<Button icon="comprobar">Comprobar</Button>`
   renderiza un `<svg>` DENTRO del boton. Consulta el boton por rol y busca el
   `svg` con `container.querySelector` desde el propio boton, no desde el
   documento. Despues de lo de `tailwind-merge`, en este repositorio no se da
   por hecho que algo llega a la pantalla: se comprueba.
2. **El tamano sale del `size` del boton**, no de una clase: el `<svg>` tiene
   `width="18"` en `md` y `width="20"` en `lg`. Comprueba el ATRIBUTO, no el
   `className` — si alguien lo cambia a `h-4 w-4`, este test tiene que ponerse
   rojo, porque esa es justamente la via que reabre el conflicto de `cn`.
3. **El icono es invisible para el lector**: el `<svg>` lleva
   `aria-hidden="true"` y `focusable="false"`, y el nombre accesible del boton
   sigue siendo exactamente `"Comprobar"` —ni mas largo ni distinto—.
4. **Sin `icon` no hay `<svg>`**: `<Button>Comprobar</Button>` no renderiza
   ninguno. Sin este caso, un envoltorio que pinte siempre algo pasaria el test 1.
5. **Dentro de un grupo, dos acciones no comparten dibujo.** Es asi como se
   fabrica un jeroglifico: cuatro botones y dos flechas iguales. Declara los
   grupos que de verdad se ven juntos y comprueba que dentro de cada uno los
   componentes de `ICONOS` son distintos entre si:

   ```ts
   const GRUPOS = [
     ["comprobar", "saltar", "pista", "solucion"],      // zona de acciones
     ["siguiente", "anterior", "marcar", "entregar"],   // barra del examen
     ["navAprender", "navPracticar", "navExamenes"],    // rail lateral
   ] as const;
   ```

   Ojo: `practicar` y `navPracticar` **son el mismo dibujo a proposito** (la
   misma diana), y no aparecen juntos en ningun grupo. No los metas en uno.
6. **`lucide-react` se importa en un solo sitio.** Recorre los `.ts`/`.tsx` de
   `packages/ui/src` leyendo del disco y comprueba que el unico que contiene
   `from "lucide-react"` es `icons/registro.ts`. Afirma primero que recorriste
   mas de 30 ficheros: un recorrido que no encuentra nada pasaria en verde sin
   mirar nada.
7. **Todo nombre del registro pinta algo.** Recorre `Object.keys(ICONOS)`,
   monta cada uno y comprueba que sale un `<svg>`. Afirma que hay mas de 15
   nombres, por lo mismo del punto anterior.

## 4 · Que NO cuenta como resuelto

- **Tocar `registro.ts`.** Prohibido. La eleccion de cada dibujo es una decision
  de producto ya tomada y revisada. Si crees que falta un nombre, dilo en un
  comentario; no lo anadas.
- **Tocar `cn.ts`, `tokens.css` o el barril `index.ts`.** Prohibidos. El barril
  lo actualiza otro; no hace falta para que tu `verify` salga verde.
- **Tocar los tres ficheros de invariantes.** Prohibidos. Si tu cambio los pone
  rojos, el cambio esta mal, no el test.
- **Dar el tamano con una clase de Tailwind.** `h-4 w-4` o `size-5` vuelven a
  meter el tamano en el mismo saco del que `tailwind-merge` ya se comio un color
  en este fichero. Va por la prop `size`, y el test 2 lo fija mirando el
  atributo del `<svg>`.
- **Importar `lucide-react` en `Icono.tsx` o en `Button.tsx`.** Todo sale del
  registro. El test 6 existe para eso, y si lo escribes de forma que tu propio
  fichero se libre, no has probado nada.
- **Poner `"use client"` en `Icono.tsx`.** Rompe el limite de servidor y hay un
  test que lo vigila fuera de tu territorio.
- **Un `aria-label` en el icono, o quitarle el `aria-hidden`.** El texto del
  boton ya es el nombre accesible. Dos nombres es peor que uno.
- **Un test que afirme sobre el elemento que tu mismo construyes.** Las
  afirmaciones van sobre el DOM que renderiza `Button`, consultado por rol, o
  sobre el texto de los ficheros leidos del disco.
- **Comprobar el punto 5 comparando nombres consigo mismos.** Lo que tiene que
  ser distinto son los COMPONENTES (`ICONOS[a] !== ICONOS[b]`), no las cadenas:
  dos claves distintas apuntando al mismo dibujo es exactamente el fallo que se
  busca, y comparar las claves lo dejaria pasar siempre.
- **Dejar dos comentarios de seccion numerados igual.** Si insertas un bloque,
  renumera lo que venga detras.
