---
id: obs1-zona-de-acciones
model: chat
territory: [apps/web/src/components/learn/PracticeSession.tsx, apps/web/src/components/learn/zona-de-acciones.test.tsx]
forbidden: [packages/ui/src/index.ts, apps/web/src/components/learn/PracticeSession.test.tsx, apps/web/src/lib/i18n/dictionaries/learn.es.ts, apps/web/src/lib/i18n/dictionaries/learn.en.ts]
context: [apps/web/src/components/learn/PracticeSession.tsx, apps/web/src/components/learn/PracticeSession.test.tsx, packages/ui/src/feedback/HintPanel.tsx, packages/ui/src/feedback/SolutionPanel.tsx, apps/web/src/lib/i18n/dictionaries/learn.es.ts]
verify: pnpm --filter @cet/web exec vitest run src/components/learn/PracticeSession.test.tsx src/components/learn/zona-de-acciones.test.tsx
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 4
deadline: 4 rondas o 25 min
---

## 1 · El problema

La pantalla de practica tiene cuatro acciones —Comprobar, Saltar, Ver una pista,
Ver como se hace— repartidas en **tres contenedores distintos**, sin agrupar y
sin nombre accesible. Visualmente son tres bloques apilados; para un lector de
pantalla son cuatro botones sueltos sin ninguna relacion declarada entre ellos.

Este encargo las junta en **una** zona, en un orden fijo. El cromado de los
botones ya esta resuelto y **no es tuyo**: los cuatro salen ya del mismo
`Button`.

## 2 · La evidencia que ya tenemos

`apps/web/src/components/learn/PracticeSession.tsx`, dentro del
`<div role="group" aria-labelledby={stemId}>` que empieza en la linea 447. Hoy
hay tres bloques hermanos y en este orden:

```
            <div className="flex flex-wrap gap-3">
              <Button type="button" ref={actionRef} onClick={submit}>
                {answered ? t.nextQuestion : t.check}
              </Button>
              <Button type="button" variant="secondary" onClick={skip} disabled={answered}>
                {t.skip}
              </Button>
            </div>
```

y despues, cada uno por su cuenta y cada uno con su propio disparador dentro:

```
            {item.hint ? (
              <HintPanel ... />
            ) : null}

            {item.solution ? (
              <SolutionPanel ... />
            ) : null}
```

### 2.1 · La herramienta que necesitas ya existe

`HintPanel` y `SolutionPanel` aceptan desde hoy una prop `part`:

- `part="trigger"` pinta **solo** el boton.
- `part="panel"` pinta **solo** el cuerpo desplegable.
- sin `part`, se comportan como siempre.

Cuando partes uno en dos, **el tipo te obliga a pasar `id`**, y las dos mitades
tienen que llevar **el mismo**: es lo que ata el `aria-controls` del disparador
al `id` del cuerpo. Con `id` distintos compila, pero el lector anuncia contenido
asociado que no existe. Usa `useId()`, que ya esta importado en el fichero.

### 2.2 · El rotulo del grupo ya esta traducido

`apps/web/src/lib/i18n/dictionaries/learn.es.ts` y su gemelo en ingles traen ya
la clave, dentro de `practice`:

```
    actionsLabel: "Acciones",
```

Se lee como el resto: `t.actionsLabel`, donde `t` es
`getLearnDictionary(locale).practice`, que el componente ya tiene resuelto. **No
toques los diccionarios**: estan prohibidos y la clave ya esta puesta.

## 3 · El criterio de aceptacion

`pnpm --filter @cet/web exec vitest run src/components/learn/PracticeSession.test.tsx src/components/learn/zona-de-acciones.test.tsx`
sale en verde —los 19 tests que ya existen de `PracticeSession` incluidos, y ese
fichero esta prohibido— con un fichero nuevo
`apps/web/src/components/learn/zona-de-acciones.test.tsx` que demuestra:

### 3.1 · Una sola zona, con nombre

Los cuatro disparadores viven dentro de **un unico** elemento con
`role="group"` y nombre accesible `"Acciones"`. En el test:

```ts
const zona = screen.getByRole("group", { name: "Acciones" });
within(zona).getByRole("button", { name: "Comprobar" });
```

y los cuatro se encuentran con `within(zona)`, no con `screen`. Un test que los
busque con `screen` pasaria igual con los tres bloques de hoy, y no estaria
comprobando nada.

### 3.2 · El orden es fijo y es este

De primero a ultimo, en el **orden del DOM**:

```
1. Comprobar  (o "Siguiente pregunta" cuando ya se ha respondido)
2. Saltar
3. Ver una pista
4. Ver cómo se hace
```

Primero lo que cierra la pregunta, despues lo que la esquiva, despues las dos
ayudas de menor a mayor. El test lee los botones de la zona **en orden de
documento** (`within(zona).getAllByRole("button")`) y compara la lista de
nombres accesibles con esa secuencia exacta. Si alguien los reordena, rojo.

Ojo con el teclado en pantalla: `AnswerKeypad` tambien pinta botones y va
**antes** de la zona, no dentro. Si tus `getAllByRole("button")` recogen teclas
del teclado numerico, es que has metido la zona donde no era.

### 3.3 · Los cuerpos van despues de los cuatro botones

El cuerpo desplegable de la pista y el de la solucion se montan **detras** de
los cuatro disparadores, no intercalados. El test abre la pista con `userEvent`,
comprueba que el texto de la pista aparece, y que el elemento que lo contiene va
**despues** del ultimo boton en orden de documento
(`compareDocumentPosition` con `Node.DOCUMENT_POSITION_FOLLOWING`).

### 3.4 · El cableado ARIA sobrevive al reparto

Es lo unico que se puede romper en silencio al partir un desplegable en dos. El
test comprueba, con la pista abierta:

- el `aria-controls` del boton «Ver una pista» apunta a un `id` que **existe en
  el documento**, y
- ese elemento es el que contiene el texto de la pista.

Lo mismo para la solucion. Un test que solo mire que `aria-controls` no esta
vacio no protege nada: el fallo que se busca es que apunte a un identificador
que nadie genera.

### 3.5 · La rejilla

Los cuatro botones en dos columnas desde `sm` y apilados a ancho completo por
debajo: `grid grid-cols-1 sm:grid-cols-2 gap-3` en la zona, y los botones con
`fullWidth` para que las dos columnas queden a la misma anchura. Esto no se
prueba —el ancho no existe en jsdom— pero se escribe asi, y el test **si**
comprueba que la zona lleva `grid` en su `className`: es lo que impide que
alguien lo devuelva a `flex flex-wrap` y vuelvan a quedar desiguales.

### 3.6 · Lo que no cambia

El `ref={actionRef}` sigue en el boton principal: `PracticeSession.test.tsx`
comprueba que tras responder el foco no se cae al `<body>`, y ese foco lo pone
ese `ref`. Si lo pierdes, ese fichero se pone rojo y no lo puedes tocar.

El `disabled={answered}` de «Saltar» tambien se queda.

Los paneles siguen montandose **solo** si `item.hint` / `item.solution` existen,
y su HTML sigue montandose **solo** cuando estan abiertos. Ese `state.hintOpen ?
resolveI18n(...) : ""` no es una optimizacion: es lo que impide que la respuesta
correcta este en el DOM antes de que el alumno conteste, y hay un test que lo
comprueba en el fichero prohibido. Cuando la pista no existe, la zona tiene tres
botones y el test tiene que contemplarlo.

## 4 · Que NO cuenta como resuelto

- **Tocar `PracticeSession.test.tsx`.** Prohibido. Si tu cambio lo pone rojo, el
  cambio esta mal. Sus 19 tests son el contrato de lo que ya funcionaba.
- **Tocar los diccionarios.** Prohibidos, y la clave `actionsLabel` ya existe.
- **Tocar `packages/ui`.** Fuera del territorio. Los paneles ya saben partirse;
  si crees que les falta algo, resuelvelo desde `PracticeSession.tsx`.
- **Anadir un `role="group"` anidado dentro del que ya hay.** El componente ya
  tiene un `<div role="group" aria-labelledby={stemId}>` que envuelve el campo de
  respuesta: la zona de acciones es **otro** grupo, hermano o hijo, pero con su
  propio `aria-label`. Comprueba en el test que `getByRole("group", { name:
  "Acciones" })` encuentra **uno** y no lanza por ambiguedad.
- **Partir los paneles sin pasarles el mismo `id` a las dos mitades.** Compila y
  deja el `aria-controls` colgando. El test 3.4 existe para eso; si lo escribes
  de forma que pase con el `id` mal, no has probado nada.
- **Un test que afirme sobre el array de nombres que tu mismo escribiste.** La
  lista de nombres sale de consultar el DOM por rol, en orden de documento, y se
  compara con la secuencia literal del apartado 3.2.
- **`getByText` donde cabe `getByRole`.** El encargo es de estructura accesible.
- **Escribir un hexadecimal.** Hay un invariante que lo caza: una sola paleta, y
  la unica hoja que da valor a un color es `tokens.css`.
- **Dejar dos comentarios de seccion numerados igual, o renumerar mal.** Si
  insertas un bloque, renumera lo que venga detras.
