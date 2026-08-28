---
id: nav-a-tarjeta
model: claude
territory:
  - packages/ui/src/navigation/SubjectCard.tsx
  - packages/ui/src/navigation/SubjectGrid.tsx
  - packages/ui/__tests__/tarjeta-de-materia.test.tsx
forbidden:
  - packages/ui/src/index.ts
  - packages/ui/src/tokens.css
  - packages/ui/src/navigation/subject-identity.ts
  - packages/ui/src/navigation/SubjectIcon.tsx
  - packages/ui/src/navigation/ModuleSection.tsx
  - packages/ui/src/navigation/LessonTile.tsx
  - apps/web/**
context:
  - packages/ui/src/navigation/subject-identity.ts
  - packages/ui/src/navigation/SubjectIcon.tsx
  - packages/ui/src/data/ProgressBar.tsx
  - packages/ui/src/primitives/Progress.tsx
  - packages/ui/src/lib/strings.ts
  - packages/ui/__tests__/identidad-de-materia.test.tsx
  - docs/superpowers/specs/2026-08-28-navegacion-visual-materias-design.md
verify: cd packages/ui && pnpm vitest run __tests__/tarjeta-de-materia.test.tsx && pnpm typecheck && pnpm lint
setup: ninguno — la costura (tokens, identidad, iconos) ya esta en el arbol y en verde
rounds: 5
---

## 1 · El problema

`/learn` es hoy una lista anidada de `<ol>` y `<ul>`. Se va a convertir en una
rejilla de tarjetas, una por materia. Te toca **la tarjeta y la rejilla**.

Otros dos agentes trabajan en paralelo sobre la misma tanda: uno hace las fichas
de lección (`ModuleSection`, `LessonTile`), otro la consulta de avance en la
app. **No toques nada fuera de tu territorio**, ni siquiera para "arreglarlo".

## 2 · Lo que ya existe y NO escribes tú

`packages/ui/src/navigation/subject-identity.ts` y `SubjectIcon.tsx` ya están en
el árbol, con sus pruebas en verde. Los usas, no los modificas:

```ts
subjectIdentity(code) // -> { code, fill, soft, order }
//   fill: "var(--cet-materia-math)"        RELLENA: rail, medallon, barra
//   soft: "var(--cet-materia-math-suave)"  CUERPO de la tarjeta
<SubjectIcon code={code} />                 // svg, aria-hidden, currentColor
```

Los doce tokens están medidos en `tokens.css` y vigilados por
`__tests__/contraste-materias.test.ts`. **Sobre el relleno solo va blanco**
(`--cet-ink-inverse`), y está medido a ≥ 4.5:1. Sobre el suave va `--cet-ink`.
Cualquier otra combinación no está medida y no vale.

## 3 · Qué escribes

### `SubjectCard.tsx`

```ts
export interface SubjectCardProps {
  readonly code: string;              // subjects.code; uno desconocido cae en la identidad neutra
  readonly name: string;              // ya resuelto al idioma por la app
  readonly href: string;              // ya construido por la app
  readonly total: number;             // lecciones publicadas de la materia
  readonly completed: number | null;  // null = no hay dato de avance (consulta caida)
  readonly started: number | null;    // idem
  readonly className?: string | undefined;
}
```

La tarjeta es **un solo enlace**: `<a href>` envolviendo todo, no un `<div>` con
un `<a>` dentro del título. El objetivo pulsable es la tarjeta entera.

Lleva: el medallón con el icono, el nombre de la materia, el resumen de avance y
una barra de dos capas (terminadas + empezadas).

### `SubjectGrid.tsx`

```ts
export interface SubjectGridProps {
  readonly subjects: readonly SubjectCardProps[];
  readonly className?: string | undefined;
}
```

Rejilla responsiva: 1 columna, 2 desde `sm`, 3 desde `lg`. Ordena por
`subjectIdentity(code).order` y, a igualdad, por `name` — así la materia del
alumno cae siempre en la misma casilla y la memoria espacial funciona sin leer.
Marcado de lista (`<ul>` / `<li>`): son N cosas navegables, y un lector de
pantalla debe poder decir cuántas hay.

## 4 · Las tres reglas de la casa que aquí se incumplen fácil

1. **44 px de área táctil como mínimo.** Existe `--cet-touch-min` en los tokens.
   El público son niños de once años en tableta.
2. **El avance nunca se dice sólo con la barra.** La cifra va escrita al lado
   («3 de 12 terminadas · 2 en marcha»). Una barra sin número obliga a estimar
   longitudes, que es lo peor para baja visión.
3. **`completed === null` no es cero.** Cuando el avance no está disponible, la
   tarjeta se pinta **sin barra y sin cifras** — sigue siendo navegable y no
   miente. Una consulta caída pintada como 0 % le dice al alumno que no ha hecho
   nada, y es falso.

Y una cuarta que es de este proyecto y no negociable: **el color no identifica
la materia.** Los seis colores son el mismo color en deuteranopia y el mismo
gris en escala de grises. La materia se reconoce por el icono y por el nombre.
Si tu tarjeta necesita el color para saber qué materia es, está mal.

## 5 · Textos

AD-7: **cero literales de cara al usuario dentro del componente.** Los textos
que la tarjeta necesita («terminadas», «en marcha», «Sin empezar», «Sin datos de
avance») se añaden como `I18nText` en `packages/ui/src/lib/strings.ts`… **que
está fuera de tu territorio.** Así que van como props opcionales tipadas
`I18nText | undefined` y se resuelven con `useI18n()`, igual que hace
`ProgressBar` con `UI_STRINGS.progress`. Documenta en la cabecera qué props de
texto espera la app.

## 6 · El criterio de aceptación

Escribe `packages/ui/__tests__/tarjeta-de-materia.test.tsx` y haz que salga
verde por código de salida:

```
cd packages/ui && pnpm vitest run __tests__/tarjeta-de-materia.test.tsx && pnpm typecheck && pnpm lint
```

Las pruebas que ese fichero DEBE contener, porque son los fallos reales de esta
pantalla y no los que se le ocurren a uno solo:

- la tarjeta entera es el enlace, y su nombre accesible incluye el nombre de la
  materia (no «leer más»);
- `completed: null` → **no hay barra ni porcentaje** en el marcado, y sí un
  texto que lo explica;
- `completed: 0, started: 0, total: 12` → dice «sin empezar», y NO es el mismo
  marcado que el caso anterior. Distinguir «no has empezado» de «no lo sabemos»
  es la mitad del encargo;
- `completed: 12, total: 12` → estado terminado, y el número dice 12 de 12;
- un `code` desconocido (`music`) se pinta igual de bien: hay icono, hay nombre,
  y el token es `--cet-materia-otra`;
- `SubjectGrid` ordena por `order` y no por el orden del array de entrada;
- `jest-axe`: cero violaciones, en la rejilla completa. El paquete ya lo tiene
  (`__tests__/a11y.test.tsx` enseña cómo).

## 7 · Qué NO cuenta como resuelto

- Un `<div onClick>` en vez de un enlace. No es navegable con teclado y no se
  puede abrir en otra pestaña.
- Un hexadecimal en cualquier sitio de tu código. La paleta vive en
  `tokens.css`, y `__tests__/una-sola-paleta.test.ts` pondrá rojo el árbol
  entero. Usa `identity.fill` / `identity.soft`.
- `useState`, `useEffect` o un manejador de eventos. Estos componentes no tienen
  interacción propia: la navegación la hace el navegador con un enlace. Pueden
  ser de cliente sólo por `useI18n`, como `ProgressBar`.
- Texto literal en español o inglés dentro del `.tsx`.
- Tocar `index.ts` para exportar lo tuyo. Lo hace el supervisor al integrar.
