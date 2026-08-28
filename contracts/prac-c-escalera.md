---
id: prac-c-escalera
model: reasoner
territory: [packages/ui/src/progress/MasteryLadder.tsx, packages/ui/__tests__/escalera-hereda-la-tinta.test.tsx]
forbidden: [packages/ui/src/index.ts, packages/ui/src/tokens.css, packages/ui/src/navigation/**, apps/web/**]
context: [packages/ui/src/progress/MasteryLadder.tsx, packages/ui/src/tokens.css, packages/ui/src/lib/strings.ts, packages/ui/src/lib/i18n.tsx, packages/ui/__tests__/progreso-viene-de-datos.test.tsx, packages/ui/__tests__/contraste-materias.test.ts]
verify: pnpm --filter @cet/ui exec vitest run __tests__/escalera-hereda-la-tinta.test.tsx __tests__/progreso-viene-de-datos.test.tsx __tests__/mastery-overview.test.tsx
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 4
deadline: 4 rondas o 20 minutos
---

## 1 · El problema

`MasteryLadder` con `showLabel` escribe la palabra del nivel («Lo llevas bien»)
con un color FIJO: `text-[var(--cet-ink-muted)]`. El dibujo de al lado, en
cambio, ya usa `currentColor`, y su cabecera explica por que: con un token fijo
daba 2.9:1 dentro del chip activo, que va en inverso.

La palabra tiene hoy el mismo fallo que el dibujo tenia entonces, y esta a
punto de notarse: la tarjeta de tema de `/practice` va a pintarse sobre el
lavado de materia (`--cet-materia-*-suave`), y ahi `--cet-ink-muted` mide entre
**4.45:1 y 4.51:1**, por debajo del 4.5 que pide WCAG 1.4.3 para texto normal,
en tres de los siete tonos.

## 2 · La evidencia que ya tenemos

Medido sobre los tokens de `tokens.css`, `--cet-ink-muted` (#5d7086 en claro)
contra los siete lavados de materia en tema claro:

```
math    #eaf1f9  4.47:1      spanish #f6f0e7  4.49:1
science #e8f3ed  4.48:1      socials #f2f0f9  4.51:1
english #f9edec  4.45:1      ict     #e7f3f3  4.49:1
                             otra    #eef1f5  4.49:1
```

Con `--cet-ink` (#12202f) sobre esos mismos lavados: de 14.41:1 a 14.61:1. En
tema oscuro, `--cet-ink-muted` (#a7b8c9) sobre los lavados oscuros da de 6.45:1
a 6.72:1 — ahi no hay problema; el fallo es del tema claro.

El precedente literal esta en el propio fichero, en el comentario largo del
`fill` de los `<rect>`:

> Medido: con `--cet-teal-text` fijo, la escalera dentro del chip ACTIVO —que va
> en inverso, tinta sobre `--cet-ink`— daba 2.9:1. [...] Heredando el color del
> texto, el contraste de la escalera es por construccion el mismo que el del
> rotulo que tiene al lado, que ya esta validado en los dos fondos.

## 3 · El criterio de aceptacion

1. La palabra del nivel deja de fijar su color y **hereda el del contenedor**,
   igual que el dibujo. El contenedor pasa a ser quien decide, que es quien ha
   medido su fondo.
2. Donde ese color ya era el correcto, **no puede cambiar lo que se ve**. Hoy
   `MasteryLadder` con `showLabel` se usa dentro de la parrilla de practica,
   sobre `--cet-surface`, en tarjetas cuyo texto es `--cet-ink`. Si el cambio se
   limita a quitar el token fijo, la palabra pasa de atenuada a tinta normal:
   eso es un cambio visible y hay que decidirlo a la vista, no de tapadillo.
   Documenta en el propio fichero que se decidio y por que.
3. La palabra sigue siendo `aria-hidden`: el nivel ya viaja en el `<title>` del
   dibujo, y anunciarlo dos veces es peor que no anunciarlo.
4. Nueva prueba `packages/ui/__tests__/escalera-hereda-la-tinta.test.tsx` que
   falle si alguien vuelve a fijar el color:
   - renderiza con `showLabel` y comprueba que **ni el dibujo ni la palabra**
     llevan una clase de color de tinta fija (`text-[var(--cet-...)]`) ni un
     `fill`/`stroke` que no sea `currentColor`;
   - comprueba que el color efectivo del rotulo y el del dibujo son **el
     mismo**: son dos mitades del mismo indicador y no pueden separarse;
   - comprueba que sin `showLabel` no se escribe la palabra, y que con
     `level === null` no se pinta absolutamente nada.
5. Las pruebas que ya existen siguen verdes: `progreso-viene-de-datos` y
   `mastery-overview` entran en el `verify` justo para eso.

## 4 · Que NO cuenta como resuelto

- Cambiar `--cet-ink-muted` por otro token fijo: es el mismo fallo con otro
  hexadecimal detras. Lo que se pide es heredar.
- Tocar `tokens.css` o anadir un token nuevo. No es tu territorio y no hace
  falta: la paleta ya tiene lo necesario.
- Una prueba que compruebe la clase escrita en el JSX en vez de lo que llega al
  DOM, o que compare un valor consigo mismo.
- Un `data-testid` nuevo que el componente no tenga.
- Quitar el `aria-hidden` del rotulo «para que se lea»: se leeria dos veces.
- Tocar el dibujo de la escalera, sus geometrias o sus umbrales. Este encargo
  es de color heredado, nada mas.

## 5 · Verde por codigo de salida

```
pnpm --filter @cet/ui exec vitest run __tests__/escalera-hereda-la-tinta.test.tsx __tests__/progreso-viene-de-datos.test.tsx __tests__/mastery-overview.test.tsx
```
