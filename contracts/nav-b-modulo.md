---
id: nav-b-modulo
model: claude
territory:
  - packages/ui/src/navigation/ModuleSection.tsx
  - packages/ui/src/navigation/LessonTile.tsx
  - packages/ui/__tests__/fichas-de-leccion.test.tsx
forbidden:
  - packages/ui/src/index.ts
  - packages/ui/src/tokens.css
  - packages/ui/src/navigation/subject-identity.ts
  - packages/ui/src/navigation/SubjectIcon.tsx
  - packages/ui/src/navigation/SubjectCard.tsx
  - packages/ui/src/navigation/SubjectGrid.tsx
  - apps/web/**
context:
  - packages/ui/src/navigation/subject-identity.ts
  - packages/ui/src/lib/strings.ts
  - packages/ui/__tests__/estados-no-solo-color.test.tsx
  - packages/ui/src/tokens.css
  - docs/superpowers/specs/2026-08-28-navegacion-visual-materias-design.md
verify: cd packages/ui && pnpm vitest run __tests__/fichas-de-leccion.test.tsx && pnpm typecheck && pnpm lint
setup: ninguno — la costura (tokens, identidad, iconos) ya esta en el arbol y en verde
rounds: 5
---

## 1 · El problema

Dentro de una materia, el alumno ve hoy un `<ul>` de enlaces de texto. Se
convierte en secciones de módulo con fichas táctiles. Te toca **el módulo y la
ficha de lección**.

Otros dos agentes trabajan en paralelo: uno hace la tarjeta de materia, otro la
consulta de avance. **No toques nada fuera de tu territorio.**

## 2 · Qué escribes

### `LessonTile.tsx`

```ts
export type LessonState = "not_started" | "started" | "completed";

export interface LessonTileProps {
  readonly title: string;                 // ya resuelto al idioma por la app
  readonly href: string;                  // ya construido por la app
  readonly state: LessonState;
  readonly minutes: number | null;        // estimated_minutes; null = no consta
  readonly stateLabel: I18nText;          // el texto del estado, obligatorio (ver §4)
  readonly minutesLabel?: I18nText | undefined;
  readonly className?: string | undefined;
}
```

Una ficha es **un solo enlace** que envuelve todo. Lleva el indicador de estado,
el título y los minutos si constan.

### `ModuleSection.tsx`

```ts
export interface ModuleSectionProps {
  readonly title: string;                 // ya resuelto al idioma
  readonly ord: number;                    // el numero del modulo
  readonly ordLabel: I18nText;             // "Modulo {ord}" — la app trae la plantilla ya interpolada
  readonly lessons: readonly LessonTileProps[];
  readonly className?: string | undefined;
}
```

Un `<section>` con encabezado propio y una lista (`<ul>` / `<li>`) de fichas. Un
módulo **sin lecciones** no se pinta vacío: dice que aún no tiene lecciones.

## 3 · El estado de la lección: la regla dura de este proyecto

Tres estados, y **ninguno se señala sólo con el color**. Cada uno lleva a la vez:

1. un **glifo distinto** (silueta, no color: círculo vacío / medio / marca de
   verificación),
2. el **texto del estado** para el lector de pantalla (`VisuallyHidden`, o
   `aria-label` en el enlace),
3. y el color, que es el tercer canal, no el primero.

Esto no es una preferencia: `__tests__/estados-no-solo-color.test.tsx` ya vigila
esta regla en el resto del paquete, porque en deuteranopia el verde y el rojo de
esta paleta son el mismo color (1.29:1). Léelo antes de escribir el tuyo.

**`started` es un estado de primera clase**, no «casi sin empezar». El alumno
que abrió la lección y se fue tiene que verlo distinto de la que no ha tocado —
es lo que le dice por dónde iba.

## 4 · Textos

AD-7: **cero literales de cara al usuario.** `packages/ui/src/lib/strings.ts`
está fuera de tu territorio, así que los textos entran por props tipadas
`I18nText` y se resuelven con `useI18n()`. `stateLabel` es **obligatoria**: sin
ella el estado se quedaría sólo en el glifo y el color, que es exactamente el
fallo que la §3 prohíbe. Un tipo que permite omitirla es un tipo que permite el
fallo.

## 5 · El criterio de aceptación

```
cd packages/ui && pnpm vitest run __tests__/fichas-de-leccion.test.tsx && pnpm typecheck && pnpm lint
```

Las pruebas que ese fichero DEBE contener:

- los tres estados producen **glifos distintos** (compara el `d` de los `path`,
  o el marcado: que no sea el mismo dibujo pintado de otro color);
- el nombre accesible de cada ficha incluye el título **y** el estado;
- `minutes: null` → no aparece ninguna cifra de minutos, ni un «0 min»;
- un módulo con `lessons: []` dice que no tiene lecciones, y no pinta una lista
  vacía;
- el área táctil declarada de la ficha no baja de 44 px (`--cet-touch-min`);
- `jest-axe`: cero violaciones en una sección con las tres fichas. El paquete ya
  lo tiene montado (`__tests__/a11y.test.tsx`).

## 6 · Qué NO cuenta como resuelto

- Un `<div onClick>` en lugar de un enlace.
- El estado distinguido sólo por color, o por un mismo glifo recoloreado.
- Un hexadecimal en tu código: la paleta vive en `tokens.css` y
  `__tests__/una-sola-paleta.test.ts` pone rojo el árbol entero.
- `useState`, `useEffect` o manejadores de eventos. No hay interacción propia:
  navega el navegador. De cliente sólo por `useI18n`, como `ProgressBar`.
- Texto literal en español o inglés dentro del `.tsx`.
- Tocar `index.ts`. Exporta el supervisor al integrar.
