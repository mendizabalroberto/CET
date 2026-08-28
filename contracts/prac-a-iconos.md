---
id: prac-a-iconos
model: claude
territory:
  - packages/ui/src/navigation/TopicIcon.tsx
  - packages/ui/__tests__/identidad-de-tema.test.tsx
forbidden:
  - packages/ui/src/index.ts
  - packages/ui/src/tokens.css
  - packages/ui/src/navigation/topic-identity.ts
  - packages/ui/src/navigation/card-chrome.ts
  - packages/ui/src/navigation/TopicCard.tsx
  - packages/ui/src/navigation/TopicGrid.tsx
  - packages/ui/src/navigation/SubjectIcon.tsx
  - packages/ui/src/navigation/SubjectCard.tsx
  - packages/ui/src/progress/**
  - apps/web/**
context:
  - packages/ui/src/navigation/SubjectIcon.tsx
  - packages/ui/src/navigation/topic-identity.ts
  - packages/ui/__tests__/identidad-de-materia.test.tsx
  - apps/web/src/lib/i18n/dictionaries/learn.es.ts
  - docs/superpowers/specs/2026-08-28-tarjetas-de-practica-design.md
verify: cd packages/ui && pnpm vitest run __tests__/identidad-de-tema.test.tsx && pnpm typecheck && pnpm lint
rounds: 4
deadline: 4 rondas
---

## 1 · El problema

`/practice` va a pasar a las mismas tarjetas que `/learn`, con medallón. En
`/learn` la silueta del medallón dice qué **materia** es. En `/practice` las
diez tarjetas son todas de Matemáticas, así que ahí la silueta tiene que decir
qué **tema** es: es el único canal que lo hace, porque el color es el mismo en
las diez y en escala de grises los tonos de materia son el mismo gris.

Hoy `TopicIcon.tsx` está en el árbol como **andamio**: la interfaz definitiva y
once siluetas provisionales que comparten trazo. Te toca la geometría de
verdad, y la prueba que la vigila.

## 2 · Lo que ya existe y NO escribes tú

`topic-identity.ts` está en el árbol y es ajeno: define las claves y normaliza
la desconocida. Lo usas, no lo tocas.

```ts
TOPIC_CODES  // simplify, compare, fracop, mixed, decimal, powten, metric, shape, word, mix
UNKNOWN_TOPIC = "otro"
topicIdentity(code) // -> TopicIdentityCode; una clave desconocida cae en "otro"
```

`SubjectIcon.tsx` es el modelo a seguir, y también es ajeno. Léelo entero antes
de dibujar: sus tres reglas son las tuyas.

## 3 · Qué escribes

### `TopicIcon.tsx`

Solo el mapa `PATHS`: once siluetas, una por clave de `TopicIdentityCode`. La
interfaz, el `viewBox`, el `aria-hidden`, el `strokeWidth` y el
`currentColor` ya están y no se tocan.

Qué es cada tema, con el rótulo y la pista que el alumno ve (`learn.es.ts`):

| clave | rótulo | pista |
|---|---|---|
| `simplify` | Simplificar | Divide arriba y abajo por el mismo número |
| `compare` | Comparar | ¿Qué fracción es mayor? |
| `fracop` | + − × ÷ fracciones | Las cuatro operaciones con fracciones |
| `mixed` | Impropias ↔ mixtas | De fracción impropia a número mixto y al revés |
| `decimal` | Decimales × ÷ | Multiplicar y dividir decimales |
| `powten` | × ÷ 10, 100, 1.000 | Se mueven las cifras, no la coma |
| `metric` | Unidades métricas | Cambia entre km, m, cm, kg, g, L y mL |
| `shape` | Figuras compuestas | Área y perímetro de figuras hechas con rectángulos |
| `word` | Problemas de enunciado | Léelo dos veces y elige la operación |
| `mix` | Mezcla | Un poco de todo (es un sorteo, no un tema) |
| `otro` | — | El tema que este design system aún no conoce |

Las tres reglas, que son de `SubjectIcon` y no se negocian:

1. **Siluetas distintas, no variaciones.** Se tienen que distinguir a 20 px y
   en escala de grises. Y no solo entre ellas: también de las siete de materia
   (cruz, libro, bocadillo, matraz, globo, pantalla, marcador), porque el
   alumno ve las dos familias en la misma sesión. Cuidado especial con `fracop`
   frente a la cruz de `math`, y con `word` frente al libro de `english`.
2. **Solo trazo, `currentColor`.** Ni un hexadecimal, ni un `fill` de color.
3. **`aria-hidden`.** El nombre del tema va escrito al lado, siempre.

Consejo de dibujo, no obligación: cuatro de los diez temas son de fracciones y
es donde más fácil se cae en variaciones del mismo dibujo. Si dos siluetas se
parecen, el fallo es de dibujo y se arregla dibujando, no bajando el listón de
la prueba.

### `packages/ui/__tests__/identidad-de-tema.test.tsx`

Modelo: `identidad-de-materia.test.tsx`, que ya hace esto para las materias.
Como mínimo:

- **Todas las claves tienen dibujo.** Recorre `TOPIC_CODES` más `UNKNOWN_TOPIC`
  y exige un `path` con `d` no vacío. Que se recorra la lista y no una copia
  escrita a mano: una clave nueva sin silueta tiene que poner esto rojo.
- **Las once `d` son distintas dos a dos.** Ésta es la prueba de que no hay
  variaciones repintadas.
- **Ninguna comparte `d` con una silueta de materia.** Importa `SubjectIcon` y
  compara.
- **Ni color propio ni anuncio.** `stroke="currentColor"`, sin `fill` de color,
  `aria-hidden="true"` y sin texto accesible.
- **Una clave desconocida no revienta ni sale vacía**: `code="math.angles"`
  pinta la silueta neutra.

## 4 · Qué NO cuenta como resuelto

- Una prueba que enumere las once claves a mano: el día que se registre un
  generador nuevo no dirá nada.
- Comparar una `d` consigo misma, o comparar longitudes en vez de contenidos.
- «Se distinguen» comprobado solo por que las cadenas difieran en un espacio:
  si dos siluetas son el mismo dibujo con un punto movido, la prueba pasa y el
  encargo no está hecho.
- Tocar `topic-identity.ts` para añadir o quitar claves. No es tu territorio.
- Un icono con relleno de color, o que se anuncie al lector.

## 5 · Verde por código de salida

```
cd packages/ui && pnpm vitest run __tests__/identidad-de-tema.test.tsx && pnpm typecheck && pnpm lint
```

Cuando esté verde, escribe `contracts/prac-a-iconos.result.md` con: qué
dibujaste (una línea por silueta, en palabras: «matraz», «escalera»), qué
comprobó la prueba, y qué dejaste sin hacer.
