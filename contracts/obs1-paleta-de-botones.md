---
id: obs1-paleta-de-botones
model: chat
territory: [packages/ui/src/primitives/Button.tsx, packages/ui/src/feedback/HintPanel.tsx, packages/ui/src/feedback/SolutionPanel.tsx, packages/ui/__tests__/paleta-de-botones.test.tsx]
forbidden: [packages/ui/src/index.ts, packages/ui/src/tokens.css, packages/ui/__tests__/contraste-tokens.test.ts, packages/ui/__tests__/a11y.test.tsx]
context: [packages/ui/src/primitives/Button.tsx, packages/ui/src/feedback/HintPanel.tsx, packages/ui/src/feedback/SolutionPanel.tsx, packages/ui/src/lib/strings.ts, packages/ui/src/lib/i18n.tsx, packages/ui/src/lib/cn.ts, packages/ui/__tests__/estados-no-solo-color.test.tsx]
verify: pnpm --filter @cet/ui exec vitest run __tests__/paleta-de-botones.test.tsx __tests__/a11y.test.tsx __tests__/contraste-tokens.test.ts
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 4
deadline: 4 rondas o 25 min
---

## 1 · El problema

En la pantalla de practica hay cuatro botones seguidos y **tres
implementaciones distintas de boton**. Dos vienen del `Button` del design
system; los otros dos se los escribio a mano cada panel. El resultado mide
distinto, se ve distinto, y uno de los cuatro tiene un contorno que **no cumple
el minimo de contraste de WCAG**.

Este encargo unifica los cuatro en `Button`. No mueve nada de sitio: eso es otro
contrato y otro territorio.

## 2 · La evidencia que ya tenemos

### 2.1 · Los tamanos no coinciden, y se puede leer donde

`packages/ui/src/primitives/Button.tsx`, tabla `SIZES`, tamano `md` (el que usa
la pantalla de practica):

```
  md: "min-h-touch px-5 text-body",
```

y en las clases comunes del mismo fichero: `border` (1 px, dentro de cada
entrada de `VARIANTS`).

`packages/ui/src/feedback/HintPanel.tsx`, lineas 39-51, se escribe su propio
`<button>`:

```
        className={cn(
          "inline-flex min-h-touch w-fit items-center gap-2 rounded-sm px-4 font-semibold",
          "border-2 border-[var(--cet-hint-accent)] bg-[var(--cet-surface)] text-[var(--cet-hint-text)]",
```

`packages/ui/src/feedback/SolutionPanel.tsx`, lineas 51-63, otro `<button>` mas:

```
        className={cn(
          "inline-flex min-h-touch w-fit items-center gap-2 rounded-sm px-4 font-semibold",
          "border-2 border-[var(--cet-border-strong)] bg-[var(--cet-surface)] text-[var(--cet-ink)]",
```

`px-4` frente a `px-5`, `border-2` frente a `border`. Dos botones con el mismo
texto, puestos uno al lado del otro, no miden lo mismo.

### 2.2 · El contraste, medido sobre los hexadecimales de `tokens.css`

Tema **claro**, calculado con la misma formula de luminancia relativa de WCAG 2.1
que usa `__tests__/contraste-tokens.test.ts`:

```
--cet-hint-accent   #f2a71b  sobre  --cet-surface #ffffff  =  2.04:1
--cet-border-strong #7d92a8  sobre  --cet-surface #ffffff  =  3.21:1
--cet-on-primary    #ffffff  sobre  --cet-primary #173a63  = 11.53:1
```

WCAG 2.1 SC 1.4.11 pide **3:1** para el contorno de un control. El contorno
ambar de «Ver una pista» da **2.04:1**: es el unico control de esa pantalla cuyo
borde no se ve sobre la tarjeta blanca. En tema oscuro el mismo par da 10.16:1,
y por eso llevaba meses sin detectarse.

La cabecera de `__tests__/contraste-tokens.test.ts` ya lo tenia escrito, textual:

> PAR QUE FALTA A PROPOSITO: `--cet-hint-accent` / `--cet-hint-bg` da 1.92:1 en
> tema claro. Es un defecto ABIERTO y documentado.

### 2.3 · Lo que NO esta roto

`Button` esta bien. Su `primary` da 11.53:1, su `secondary` apoya en
`--cet-border-strong` que da 3.21:1, y ningun tamano baja de 44 px de alto. El
fallo no es de `Button`: es de los dos ficheros que decidieron no usarlo.

## 3 · El criterio de aceptacion

`pnpm --filter @cet/ui exec vitest run __tests__/paleta-de-botones.test.tsx __tests__/a11y.test.tsx __tests__/contraste-tokens.test.ts`
sale en verde, con un fichero **nuevo** `packages/ui/__tests__/paleta-de-botones.test.tsx`
que demuestra, montando los componentes de verdad:

1. **`HintPanel` y `SolutionPanel` pintan su disparador con `Button`.**
   Ninguno de los dos ficheros de `src/feedback/` contiene ya la cadena
   `"<button"`. Compruebalo leyendo el fichero fuente desde el test con
   `readFileSync`, igual que hacen otros invariantes del repositorio, y ademas
   comprobando en el DOM montado que el disparador lleva las clases que `Button`
   pone siempre (`px-5` del tamano `md`, y **no** `px-4`, y **no** `border-2`).

2. **Los tres botones no principales son identicos en cromado.**
   Monta `<Button variant="secondary">`, el disparador de `HintPanel` y el de
   `SolutionPanel`, y comprueba que los tres tienen exactamente el mismo
   `className` salvo lo que anada el llamante. El test debe fallar si alguien
   le devuelve a uno de los dos su `border-2` o su `px-4`.

3. **El ambar ya no es el contorno de un control.**
   Ni `HintPanel.tsx` ni `SolutionPanel.tsx` contienen ya
   `border-[var(--cet-hint-accent)]`. El disparador de la pista se distingue por
   un **punto ambar** dentro del boton: un `<span aria-hidden="true">` con
   `bg-[var(--cet-hint-vivid)]`, redondo, de 8 px, antes del texto. El cuerpo
   del panel conserva su `border-l-[var(--cet-hint-accent)]` y su
   `bg-[var(--cet-hint-bg)]` intactos: ahi el ambar no es el contorno de un
   control y no le aplica el 3:1.
   El test comprueba las dos cosas: que el punto existe dentro del disparador y
   que el borde izquierdo del cuerpo sigue siendo ambar.

4. **El cableado ARIA sobrevive.** El disparador sigue llevando
   `aria-expanded` con el valor de `open` y `aria-controls` apuntando al `id`
   real del cuerpo, y pulsarlo sigue llamando a `onOpenChange` con el valor
   contrario. Escribe un test que pulse con `userEvent` y lo compruebe.

5. **`part`: disparador y cuerpo se pueden pintar por separado.**
   Los dos componentes aceptan una prop nueva `part`:
   - `part` ausente o `"all"` (por defecto): se comporta exactamente como hoy,
     disparador y cuerpo dentro del mismo `<div>`. **Esto no puede cambiar**:
     `__tests__/a11y.test.tsx` monta `HintPanel` sin esa prop y esta fuera de tu
     territorio.
   - `part="trigger"`: pinta **solo** el disparador.
   - `part="panel"`: pinta **solo** el cuerpo.

   Cuando `part` no es `"all"` el `useId` interno ya no vale, porque las dos
   mitades son dos montajes distintos y generarian identificadores diferentes:
   `aria-controls` apuntaria al vacio. Por eso el `id` pasa a ser
   **obligatorio en tipos** en ese caso, con una union discriminada:

   ```ts
   type Partido = { readonly part: "trigger" | "panel"; readonly id: string };
   type Entero  = { readonly part?: "all" | undefined; readonly id?: string | undefined };
   ```

   El test monta las dos mitades con el mismo `id` en dos sitios distintos del
   arbol y comprueba que el `aria-controls` del disparador coincide con el `id`
   del elemento del cuerpo, y que ese elemento existe.

Todo con `@testing-library/react` y `userEvent`, que ya son dependencias del
paquete. Envuelve en `LocaleProvider` si el componente lo necesita, como hace
`__tests__/a11y.test.tsx`.

## 4 · Que NO cuenta como resuelto

- **Tocar `tokens.css`.** Esta prohibido y no hace falta: todos los tokens que
  necesitas ya existen. Cambiar el valor del ambar es otro encargo.
- **Tocar `contraste-tokens.test.ts` o `a11y.test.tsx`.** Estan prohibidos. Si
  tu cambio los pone rojos, el cambio esta mal, no el test. En particular:
  `a11y.test.tsx` monta `HintPanel` **sin** `part`, y tiene que seguir pasando
  por `jest-axe` sin una sola violacion.
- **Tocar `packages/ui/src/index.ts`.** El barril es ajeno siempre. Los
  componentes ya estan exportados; no hace falta anadir nada.
- **Anadir una variante nueva a `Button`.** `secondary` ya es exactamente el
  contorno que hace falta, y su par ya esta medido. Una variante mas es una
  escala mas, que es el problema que este encargo cierra.
- **Rellenar el boton de pista de ambar.** `--cet-hint-vivid` sobre
  `--cet-on-vivid` daria 11.09:1 y pasaria el umbral, pero dos botones rellenos
  compitiendo en la misma fila es justo el desorden que se esta corrigiendo.
  Relleno hay uno, y es el principal, y no esta en tu territorio.
- **Un test que afirme sobre un objeto que tu mismo construyes.** La afirmacion
  va sobre el DOM que renderiza el componente real o sobre el texto del fichero
  fuente leido del disco. Comparar un valor consigo mismo ya paso aqui siete
  veces en un dia.
- **Un test de «no hay `<button>`» que busque en la cadena equivocada.**
  Si lees el fuente, lee `packages/ui/src/feedback/HintPanel.tsx` resolviendo la
  ruta desde `process.cwd()`, que en estos tests es `packages/ui`. Un
  `readFileSync` que falle por ruta pondria el test rojo, no verde; pero un
  `existsSync` mal usado que se salte la comprobacion la dejaria verde sin mirar
  nada. Afirma primero que el fichero se leyo y tiene mas de 500 caracteres.
- **Romper `w-fit`.** El disparador no debe estirarse a ancho completo por su
  cuenta: quien decide el ancho es el contenedor, y eso lo pone otro contrato.
  Usa `className="w-fit"` sobre el `Button`, no `fullWidth`.
- **Dejar el `useId` colgando.** Si `part` obliga a `id`, el camino `"all"`
  sigue usando `useId` cuando no le dan `id`. No elimines ese camino: dejarias
  sin identificador a quien no pasa `id`, que es el uso mayoritario.
