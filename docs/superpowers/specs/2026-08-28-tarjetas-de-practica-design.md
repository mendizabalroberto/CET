# Práctica con las tarjetas de Aprender — diseño

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Continúa `2026-08-28-navegacion-visual-materias-design.md`, cuyo §8 decía
> «no toca `/practice`». Esto es lo que faltaba.

---

## 1 · El problema, en una pantalla

`/learn` entra por tarjetas: medallón con la silueta de la materia, nombre en
`text-body-lg`, rail de color, lavado de fondo, sombra y elevación al pasar por
encima. `/practice` es la misma clase de pantalla —elegir a dónde ir— y hasta
hoy tenía tarjetas a medias: rail, caja y escala tipográfica compartidos
(commit `04bbb1c`), pero **sin medallón y sin lavado**. Dos motivos, los dos
escritos entonces y los dos resolubles:

1. **El lavado.** `--cet-ink-muted` sobre `--cet-materia-*-suave` mide de
   4.45:1 a 4.51:1, por debajo del 4.5 de WCAG 1.4.3 en tres de los siete
   tonos. La tarjeta de práctica lleva texto atenuado y la de materia no.
2. **El medallón.** El icono de materia IDENTIFICA la materia, y los diez
   temas de práctica son todos de la misma: diez cruces azules idénticas no
   distinguen nada.

Ninguno de los dos es un argumento contra la tarjeta: son dos cosas que faltan
por hacer. Este encargo las hace.

---

## 2 · Las dos decisiones

### 2.1 · La silueta es del TEMA; el color, de la materia

La regla de la casa no cambia, se aplica un nivel más abajo: **el color nunca
identifica**. En `/learn` la silueta dice qué materia es; en `/practice` dice
qué tema es. El color —rail, medallón, lavado— sigue siendo el de la materia a
la que pertenece el tema, y por tanto es el mismo en los diez: refuerzo de
«esto es Matemáticas», no distintivo del tema.

Consecuencia directa: hacen falta **diez siluetas nuevas** —`simplify`,
`compare`, `fracop`, `mixed`, `decimal`, `powten`, `metric`, `shape`, `word`—
más la neutra de `mix`, distinguibles entre sí a 20 px y en escala de grises, y
distinguibles también de las siete de materia, porque un alumno ve las dos
familias en la misma sesión.

`mix` no es un tema: es un sorteo entre los demás. Le toca la identidad neutra
y, con un medallón propio, el emoji 🎲 que hoy lleva pegado al rótulo sobra —
sale del diccionario.

### 2.2 · El lavado entra, y el texto atenuado sale

La tarjeta de materia no tiene ni una línea de texto atenuado: sobre el lavado
solo va `--cet-ink` (14.4:1 a 14.6:1 en claro, 11.3:1 a 11.8:1 en oscuro). La
de práctica se ajusta a esa misma disciplina:

- la pista y el recuento pasan de `text-muted` a `text-ink`;
- la palabra del nivel que escribe `MasteryLadder` con `showLabel` deja de
  llevar `--cet-ink-muted` fijo y **hereda `currentColor`**, exactamente por el
  motivo por el que el dibujo de la escalera ya lo hace (está escrito en su
  cabecera: con un token fijo daba 2.9:1 dentro del chip activo). Así el
  contraste de la palabra es por construcción el del texto que tiene al lado,
  que sí está medido en los dos fondos.

Lo que **no** se toca: `EffortMeter`, `MasteryOverview` y la derivación del
progreso. Este encargo es de dibujo, no de medida.

---

## 3 · Qué se escribe

| Pieza | Dónde | Quién |
|---|---|---|
| `card-chrome.ts` — la caja compartida (rail, radio, sombra, área táctil) | `packages/ui/src/navigation/` | supervisor (costura) |
| `topic-identity.ts` + `TopicIcon.tsx` — once siluetas | `packages/ui/src/navigation/` | `prac-a-iconos` |
| `TopicCard.tsx` + `TopicGrid.tsx` | `packages/ui/src/navigation/` | `prac-b-tarjeta` |
| La palabra del nivel hereda la tinta | `packages/ui/src/progress/MasteryLadder.tsx` | `prac-c-escalera` (DeepSeek) |
| Cableado de `/practice`, diccionario, capturas | `apps/web/` | supervisor |

`packages/ui/src/index.ts` y `tokens.css` son del supervisor y están en el
`forbidden` de los tres contratos: son el único punto donde tres ramas
paralelas podrían chocar. No hacen falta tokens nuevos: la paleta de materias
ya está medida y no se añade ni un color.

### 3.1 · El contrato de `TopicCard`

```ts
export interface TopicCardProps {
  readonly topic: string;        // clave de silueta: 'simplify' ... 'mix'; desconocida -> neutra
  readonly subjectCode: string;  // materia: da rail, medallon y lavado
  readonly name: string;         // ya resuelto al idioma por la app
  readonly hint: string;         // la pista corta, ya resuelta
  readonly href: string;         // ya construido por la app
  readonly level: MasteryLevel | null;   // null = sin evidencia: NO se pinta escalera
  readonly groupLabel: I18nText;         // nombre accesible de la escalera
  readonly evidenceText?: I18nText | undefined;   // "10 preguntas respondidas"
  readonly targets?: number | undefined;          // circulos del EffortMeter; 0 o ausente = ninguno
  readonly nextStepText?: I18nText | undefined;   // la frase del siguiente paso
  readonly className?: string | undefined;
}
```

### 3.2 · El límite que no se puede pasar

`apps/web/src/components/learn/densidad-de-indicadores.test.tsx` es ley:

- **tres filas por tarjeta** que cambien con el progreso, ni una más. Con el
  medallón dentro de la fila del nombre, las tres siguen siendo cabecera
  (escalera), evidencia y siguiente paso;
- **el número de filas no puede variar** entre escenarios de progreso.

Y `libreria-visual-compartida.test.tsx` (app) exige que la caja de la tarjeta
de práctica lleve las mismas clases que `SubjectCard`. Cuando la caja pase a
`card-chrome.ts`, ese test sigue valiendo: lee el fuente de `SubjectCard`, que
la seguirá importando.

---

## 4 · Cómo se reparte, y qué NO se delega a DeepSeek

`HANDOFF-DEEPSEEK.md §0.2`: DeepSeek no ve imágenes. Dibujar once siluetas y
juzgar si se distinguen a 20 px **no es delegable**, y tampoco lo es la
tarjeta. Por eso los dos contratos visuales van a agentes que sí ven capturas,
y a DeepSeek le toca el único trozo de esta tanda que es texto y medida: que la
palabra del nivel herede la tinta, con su prueba, verificado por código de
salida.

Tres territorios disjuntos, en paralelo:

| Contrato | Territorio | Verde por código de salida |
|---|---|---|
| `prac-a-iconos` | `navigation/topic-identity.ts`, `TopicIcon.tsx` + test | `pnpm --filter @cet/ui test identidad-de-tema` |
| `prac-b-tarjeta` | `navigation/TopicCard.tsx`, `TopicGrid.tsx` + test | `pnpm --filter @cet/ui test tarjeta-de-tema` |
| `prac-c-escalera` | `progress/MasteryLadder.tsx` + test | `pnpm --filter @cet/ui test escalera` |

Para que `prac-b` compile desde el minuto uno sin esperar a `prac-a`, el
supervisor deja en el árbol un `TopicIcon` **de andamio**: la interfaz
definitiva y una silueta provisional para las once claves. `prac-a` sustituye
la geometría y escribe su prueba; `prac-b` nunca afirma nada sobre el dibujo,
que no es su territorio.

---

## 5 · Verificación

1. Los tres `verify` en verde, cada uno en su rama.
2. Integración: `pnpm --filter @cet/ui test`, `pnpm --filter @cet/web test`,
   typecheck y lint de los dos.
3. Capturas en `tocheck/practica-05..08`: escritorio, 360 px, escala de grises
   y tema oscuro, desde `/dev/practice-preview`, que pinta el componente real.
   La de escala de grises es la prueba de que la silueta —y no el color— es lo
   que distingue un tema de otro.

## 6 · Lo que este encargo NO hace

No toca la derivación del progreso ni sus consultas. No entra en
`/practice/[skillCode]` (el bucle). No añade tokens ni animaciones de
transición. No revive `skill_mastery`.
