---
id: prac-b-tarjeta
model: claude
territory:
  - packages/ui/src/navigation/TopicCard.tsx
  - packages/ui/src/navigation/TopicGrid.tsx
  - packages/ui/__tests__/tarjeta-de-tema.test.tsx
forbidden:
  - packages/ui/src/index.ts
  - packages/ui/src/tokens.css
  - packages/ui/src/navigation/card-chrome.ts
  - packages/ui/src/navigation/topic-identity.ts
  - packages/ui/src/navigation/TopicIcon.tsx
  - packages/ui/src/navigation/SubjectCard.tsx
  - packages/ui/src/navigation/SubjectGrid.tsx
  - packages/ui/src/progress/**
  - apps/web/**
context:
  - packages/ui/src/navigation/SubjectCard.tsx
  - packages/ui/src/navigation/SubjectGrid.tsx
  - packages/ui/src/navigation/card-chrome.ts
  - packages/ui/src/navigation/topic-identity.ts
  - packages/ui/src/navigation/TopicIcon.tsx
  - packages/ui/src/navigation/subject-identity.ts
  - packages/ui/src/progress/MasteryLadder.tsx
  - packages/ui/src/progress/EffortMeter.tsx
  - packages/ui/src/lib/i18n.tsx
  - packages/ui/__tests__/tarjeta-de-materia.test.tsx
  - apps/web/src/components/learn/densidad-de-indicadores.test.tsx
  - docs/superpowers/specs/2026-08-28-tarjetas-de-practica-design.md
verify: cd packages/ui && pnpm vitest run __tests__/tarjeta-de-tema.test.tsx && pnpm typecheck && pnpm lint
rounds: 5
deadline: 5 rondas
---

## 1 · El problema

La parrilla de `/practice` pinta hoy sus tarjetas a mano dentro de la app
(`apps/web/src/components/learn/PracticeTopicGrid.tsx`). Tiene ya la caja del
design system, pero le faltan el medallón y el lavado, y sobre todo el marcado
vive en la aplicación en vez de en el design system, que es donde vive el de
`/learn`.

Escribes `TopicCard` y `TopicGrid` en `@cet/ui`: la misma tarjeta que
`SubjectCard`, con dentro lo que tiene un tema de práctica —nivel, evidencia y
siguiente paso— en vez de lecciones terminadas.

Otros dos agentes trabajan en paralelo sobre esta tanda: uno dibuja las once
siluetas de tema, otro toca `MasteryLadder`. **No toques nada fuera de tu
territorio**, ni siquiera para «arreglarlo».

## 2 · Lo que ya existe y NO escribes tú

```ts
import { CARD_CHROME, MEDALLION_CHROME, cardSkin, medallionSkin } from "./card-chrome.js";
import { subjectIdentity } from "./subject-identity.js";   // color: rail, medallon, lavado
import { TopicIcon } from "./TopicIcon.js";                // silueta del TEMA
```

- `CARD_CHROME` es **la** caja. Se usa tal cual, con `cn(CARD_CHROME, className)`.
  No la copies ni la amplíes con clases de caja propias: es el fichero que
  impide que `/learn` y `/practice` vuelvan a divergir.
- `cardSkin(identity)` da el lavado del cuerpo y el color del rail;
  `medallionSkin(identity)` da el relleno del medallón con la tinta inversa.
  Son los únicos pares medidos: sobre el relleno solo va `--cet-ink-inverse`,
  sobre el lavado solo va `--cet-ink`.
- `TopicIcon` está de andamio (las once siluetas comparten trazo hoy). Lo
  montas y no afirmas nada sobre su geometría: eso es del contrato `prac-a`.
- `MasteryLadder` y `EffortMeter` ya existen y se usan tal cual.

## 3 · Qué escribes

### `TopicCard.tsx`

```ts
export interface TopicCardProps {
  readonly topic: string;        // clave de silueta: 'simplify' ... 'mix'; desconocida -> neutra
  readonly subjectCode: string;  // materia: da rail, medallon y lavado
  readonly name: string;         // ya resuelto al idioma por la app
  readonly hint: string;         // la pista corta, ya resuelta
  readonly href: string;         // ya construido por la app
  readonly level: MasteryLevel | null;            // null = sin evidencia: NO se pinta escalera
  readonly groupLabel: I18nText;                  // nombre accesible de la escalera
  readonly evidenceText?: I18nText | undefined;   // "10 preguntas respondidas" / "Sin practicar todavia"
  readonly targets?: number | undefined;          // circulos del EffortMeter; 0 o ausente = ninguno
  readonly nextStepText?: I18nText | undefined;   // la frase del siguiente paso
  readonly className?: string | undefined;
}
```

Estructura, y el orden importa porque es el nombre accesible del enlace:

1. **Fila de cabecera**: medallón (`MEDALLION_CHROME` + `medallionSkin`, con
   `TopicIcon`), nombre en `text-body-lg font-bold`, y a la derecha la escalera
   (`MasteryLadder level size="sm" showLabel`) cuando hay nivel.
2. **La pista**, en `text-body-sm`.
3. **La evidencia**, cuando la app la pasa.
4. **El siguiente paso**: `EffortMeter` si `targets > 0`; si no, la frase en
   `text-body-sm font-semibold`, y nada si la app no pasa texto.

Reglas que no se negocian:

- **Un solo `<a>` envolviendo la tarjeta entera.** No un `div` con un enlace en
  el título: el objetivo pulsable sería el renglón, y esto se usa con el dedo.
  El motivo largo está en la cabecera de `SubjectCard`.
- **Ni un literal de cara al usuario** (AD-7). Todo texto entra por prop:
  `name` y `hint` ya resueltos, el resto como `I18nText` resuelto con
  `useI18n()`. Si falta uno, `t()` devuelve cadena vacía y la fila **no se
  pinta**, en vez de escribir un hueco.
- **Sobre el lavado NO va texto atenuado.** `--cet-ink-muted` sobre
  `--cet-materia-*-suave` mide 4.45:1 a 4.51:1 y no llega al 4.5 de WCAG 1.4.3
  en tres de los siete tonos. La pista y la evidencia van en la tinta normal.
- **`level === null` no pinta escalera.** No existe un «nivel cero»: cuatro
  peldaños vacíos le dirían a quien no ha empezado que va mal.
- `data-topic` con la clave normalizada y `data-subject` con la materia, para
  que las pruebas puedan verlo.

### `TopicGrid.tsx`

```ts
export interface TopicGridProps {
  readonly topics: readonly TopicCardProps[];
  readonly className?: string | undefined;
}
```

`<ul>`/`<li>`, una columna, dos desde `sm`, tres desde `lg`, `gap-4`. Lista y
no divs: el lector anuncia «lista de 10 elementos» antes de entrar. **Respeta
el orden de entrada**, al revés que `SubjectGrid`: aquí lo manda el registro de
generadores y la app ya lo ha decidido.

### `packages/ui/__tests__/tarjeta-de-tema.test.tsx`

Modelo: `tarjeta-de-materia.test.tsx`. Como mínimo:

- La tarjeta es un `<a href>` y todo su contenido está dentro.
- Lleva las clases de `CARD_CHROME` —léelas de la constante importada, no las
  copies— y el rail y el lavado salen de `subjectIdentity`, nunca un hex.
- Sin nivel no hay escalera; con nivel, la escalera lleva el nombre del grupo
  en su texto accesible.
- `targets = 0` o ausente: ni un círculo de `EffortMeter`.
- Un rótulo que la app no pasa **no** deja un hueco ni un literal.
- **Densidad**: con datos, la tarjeta no monta más de **tres** filas que
  cambien con el progreso, y el número de filas es el mismo con y sin cada
  texto opcional presente. `apps/web/.../densidad-de-indicadores.test.tsx` te
  explica por qué; ese fichero es de otro territorio, pero su límite es ley
  para lo que escribes.
- Un `topic` desconocido y un `subjectCode` desconocido no revientan.

## 4 · Qué NO cuenta como resuelto

- Copiar las clases de `CARD_CHROME` en vez de importarlas: es exactamente la
  duplicación que esta tanda vino a quitar.
- Texto atenuado sobre el lavado.
- Afirmar algo sobre la geometría de `TopicIcon` (no es tu territorio, y hoy es
  andamio: una prueba así se pondrá roja cuando `prac-a` dibuje de verdad).
- Un `data-testid` que no existe en el componente, un `if` que nunca se cumple,
  o una aserción que compara un valor consigo mismo.
- Tocar `apps/web/**`. El cableado de la pantalla lo hace el supervisor.

## 5 · Verde por código de salida

```
cd packages/ui && pnpm vitest run __tests__/tarjeta-de-tema.test.tsx && pnpm typecheck && pnpm lint
```

Cuando esté verde, escribe `contracts/prac-b-tarjeta.result.md`: qué monta la
tarjeta, qué comprueba la prueba, y qué decisiones tomaste que el contrato no
te daba masticadas.
