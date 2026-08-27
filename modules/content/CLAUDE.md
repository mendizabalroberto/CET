# M06 · `content`

> Bloques de lección, media en Storage, y el **pipeline de extracción Y6A → content packs**.
> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Depende de: **M05 curriculum**. Código: `packages/content/`, tabla `lesson_blocks`.

---

## 1. Objetivo

Convertir 590 KB de HTML pedagógico escrito a mano en datos versionados, validados y **seguros
de renderizar**, sin perder nada por el camino y sin fingir que se extrajo lo que no se extrajo.

Los seis trainers de Y6A funcionan como pedagogía. Lo que no tienen es nada debajo: cero
persistencia, cero identidad, cero analítica (`grep localStorage` → 0 ocurrencias). Este módulo
es el puente entre ese material y la plataforma.

Dos frases resumen su postura:

> **El saneado es una frontera de seguridad, no una limpieza cosmética.** Ese HTML acaba en un
> `dangerouslySetInnerHTML` en el navegador de un niño de 11 años.

> **Mejor un hueco declarado que una cobertura fingida.** `packs/COVERAGE.md` dice qué no se
> extrajo y por qué, materia por materia.

---

## 2. Arquitectura

### La estructura común de los seis trainers

No estaba escrita en ningún sitio; se dedujo leyéndolos. Las seis materias comparten
arquitectura pero difieren en cada detalle, y el extractor tolera esas diferencias en un solo
sitio en vez de tener seis copias:

| | Math | Science | English | Español | Socials | ICT |
|---|---|---|---|---|---|---|
| **Lecciones** | `LESSONS[{t,h}]` | `TOPICS[{id,t,html}]` | HTML `.topic` | HTML `.topic` | `TOPICS[]` | `TOPICS[]` |
| **Banco** | *ninguno* | `BANK[]` clave `t` | `BANK[]` clave `c` | `BANK[]` clave `c` | `Q{k:[…]}` | `Q{k:[…]}` |
| **Blueprint** | `MOCK_PLAN[]` | implícito, 4×tema | `MPARTS[{c,n,t}]` | `MPARTS[]` | `plan={}` en `buildMock` | `plan={}` |
| **Plan** | tabla HTML | tabla HTML | `PLAN[]` plano | `PLAN[]` anidado | tabla HTML | tabla HTML |
| **Límite** | 25 min | sin límite | 20 min | 15 min | sin límite | sin límite |
| **Labs** | Shape | Circuit | 7 juegos | 5 juegos | Mountain/Map/River | Scratch/Excel |

Tres detalles que el extractor **debe** tolerar y que se descubrieron rompiéndose contra ellos:

1. La clave de categoría es `c` en unas materias, `t` en otras, y en Socials/ICT es la clave del
   objeto contenedor.
2. `PLAN[]` es `[título, tarea, tarea]` en English y `[título, [tareas]]` en Español.
3. Science construye su HTML llamando a `sym('cell', 120)`, que dibuja un SVG. Eso es código,
   no dato.

### Clases CSS → `block_kind`

Las clases de los trainers ya eran una taxonomía semántica. El mapeo es directo:

```
.rule            -> rule       regla / definición
.eg              -> example    ejemplo trabajado
.tip  .good      -> tip        truco, atajo, confirmación
.warn            -> warning    el error típico
.steps  .chain   -> steps      secuencia ordenada
table.t          -> table      tabla de datos
h3 p ul ol       -> text       prosa
svg canvas       -> (hueco)    NO se inventa
```

### El paquete

```
packages/content/
├── src/
│   ├── js-literal.ts     parser RESTRINGIDO de literales JS — no ejecuta código
│   ├── sanitize.ts       allowlist + re-serialización + verificador — la frontera
│   ├── schema.ts         esquemas Zod del content pack
│   ├── ids.ts            UUIDv5 deterministas (idempotencia)
│   ├── skills.ts         taxonomía + contrato de engine_key con @cet/engine
│   ├── extract/          html · blocks · bank · blueprint · plan · accordion
│   ├── subjects/         un extractor por materia
│   ├── pipeline.ts       orquestación + COVERAGE.md
│   └── cli.ts            `extract` y `extract --check`
├── packs/                salida: 6 JSON + COVERAGE.md
├── __tests__/            177 tests
└── REVIEW.md             pasadas 2 y 3
```

### Tres decisiones que merecen defensa

**No se usa `eval` ni `node:vm`.** `vm` **no** es un sandbox de seguridad — su propia
documentación lo dice. Ejecutar el `<script>` de un HTML fuente le da al fichero los permisos del
proceso de build. En su lugar, `js-literal.ts` acepta exactamente la gramática de datos que Y6A
usa (literales, concatenación con `+`, comentarios) y rechaza todo lo demás con la posición
exacta. Las llamadas a función solo se aceptan si el llamante las **declara** con una
sustitución explícita.

**No se usa `node-html-parser`.** El saneado es una frontera de seguridad, y un parser tolerante
de terceros "recupera" etiquetas y reordena nodos con heurísticas que no controlamos. Esa
diferencia entre lo que el saneador vio y lo que el navegador verá es la puerta de la
mutation-XSS. El tokenizador propio es pequeño, estricto, y **no recupera nada**: lo que no
entiende se convierte en texto escapado, nunca en marcado.

**Math no emite preguntas estáticas.** Sus nueve generadores son lo que hace que cada intento
sea un examen nuevo; congelarlos en un banco fijo destruiría justo eso. Math emite preguntas
`kind:'generated'` que apuntan a un `engine_key` de `@cet/engine`.

---

## 3. Tablas

### `lesson_blocks` (§3 de `DATA_MODEL`)

`id`, `lesson_id` (cascade), `ord`, `kind` (`block_kind`), `content` jsonb, `media_id`.

`content` es jsonb pero **no** es libre: unión discriminada por `kind`, validada por Zod en el
pack y por un trigger contra JSON Schema en la DB. Formas:

| kind | forma |
|---|---|
| `rule` `example` `tip` `warning` `text` | `{ html: I18nText }` |
| `steps` | `{ intro?: I18nText, steps: I18nText[] }` |
| `table` | `{ headers?: (I18nText\|null)[], rows: (I18nText\|null)[][] }` |
| `interactive` | `{ engineKey, caption }` — reservado para los labs |

Una celda de tabla puede ser `null`: las tablas de Math abren con `<th></th>`, y forzar un
`I18nText` ahí obligaría a inventar una cadena vacía que el contrato prohíbe.

### `media_assets`

`alt_text` es **not null**: la accesibilidad no es opcional. `checksum` sha256 para deduplicar.
Hoy ningún pack lo usa — los trainers no traen imágenes en las lecciones.

---

## 4. APIs

Este módulo es sobre todo un proceso de build, no un servicio.

```bash
pnpm --filter @cet/content extract          # regenera packs/ y COVERAGE.md
pnpm --filter @cet/content extract:check     # CI: falla si packs/ está desactualizado
```

En tiempo de ejecución:

```
getLessonBlocks(lessonId)        Server Component, RLS activa
upsertLessonBlock(...)           Server Action de staff, validada con Zod
importContentPack(pack)          M05; escribe lessons + lesson_blocks
```

---

## 5. Frontend

`@cet/ui` renderiza cada `block_kind` con su componente:

- `rule` → caja azul con borde a la izquierda · `tip` → ámbar · `warning` → rojo
- `example` → caja punteada con los pasos en monoespaciada
- `steps` → lista numerada · `table` → tabla con scroll horizontal propio en móvil

**El HTML del bloque se renderiza con `dangerouslySetInnerHTML`.** Es seguro porque ya pasó por
`sanitize.ts`, y `@cet/ui` **vuelve a sanear** al pintar. Defensa en profundidad: si un bloque
llega por otra vía (autoría de un profesor, importación futura), sigue filtrado.

Accesibilidad: cada bloque lleva su rol semántico, contraste AA, y las tablas cabecera real.

---

## 6. Seguridad

**Es el punto central de este módulo.** El saneador funciona en cuatro capas:

1. Tokenizar con nuestro propio tokenizador.
2. Descartar todo lo que no esté en la allowlist: etiqueta, atributo, y para `class` incluso el
   **valor** (si no, un HTML manipulado inyecta la clase de un componente del design system y
   suplanta UI de la aplicación).
3. **Re-serializar desde cero**. Ni un byte del original llega al pack sin pasar por
   `escapeHtml`, salvo nombres de etiqueta y valores de atributo ya validados.
4. `assertSafe()` vuelve a escanear el resultado y **lanza** ante `<script`, un `on*=`, un
   `javascript:` o cualquier etiqueta fuera de la allowlist. La capa 4 es redundante a
   propósito: existe para que un fallo futuro en las capas 1–3 rompa el build en vez de publicar
   un XSS.

Se prueba con 33 cargas reales de listas de bypass: `<svg/onload>`, `<img onerror>`, doble
codificación, comentarios condicionales de IE, `srcdoc`, atributos duplicados, mayúsculas
mixtas, `vbscript:`.

`assertSafe` comprueba atributos **solo dentro del marcado**, nunca en el texto: una lección de
ICT puede hablar legítimamente de `onclick` o de `javascript:` y no debe romper el build.

Otras garantías:

- El parser de literales bloquea la contaminación de prototipo (`__proto__`, `constructor`).
- El pipeline no ejecuta ni una línea del fichero fuente.
- Los surrogates sueltos se sustituyen por U+FFFD: uno propagado rompe la serialización JSON
  aguas abajo.

---

## 7. Pruebas

**177 tests en Vitest.**

| Fichero | Cubre |
|---|---|
| `sanitize.test.ts` | 33 vectores de ataque; preservación de acentos, `ñ`, emoji (incluidos ZWJ y pares suplentes), fracciones apiladas, `sub`/`sup`; entidades; HTML mal anidado; estabilidad del saneado |
| `js-literal.test.ts` | Lo que acepta y, sobre todo, lo que rechaza: llamadas, flechas, ternarios, interpolación, contaminación de prototipo; recorte de símbolos; regresiones de D-1 y D-2 |
| `extract.test.ts` | Extractor sobre un fixture con `<script>`, `onerror=` y `javascript:` inyectados; las tres formas de banco; las dos formas de `PLAN`; bancos corruptos; HTML sin cerrar |
| `pipeline.test.ts` | Los **seis trainers reales**: validación Zod, idempotencia byte a byte, `packs/` al día, cero ids repetidos entre materias, cero mojibake, contrato de `engine_key` |

**Idempotencia**: se demuestra extrayendo dos veces desde disco y comparando byte a byte, no
comparando un objeto consigo mismo.

---

## 8. Criterios de finalización

- [x] Pipeline extrae las 6 materias sin error
- [x] Todo pack valida contra su esquema Zod
- [x] Idempotencia verificada (dos ejecuciones, salida idéntica)
- [x] Saneado con allowlist + verificador; 33 vectores de ataque neutralizados
- [x] `packs/COVERAGE.md` dice qué quedó fuera y por qué, materia por materia
- [x] Trazabilidad `source:{file,symbol,index}` en todo elemento extraído
- [x] Math completo: 8 lecciones, 56 bloques, 9 generadores, blueprint de 20 ítems, plan de 5 días
- [x] Los 9 `engine_key` de Math emitidos con el nombre acordado con `@cet/engine`
- [x] `REVIEW.md` con los hallazgos de la pasada 2 y su corrección
- [ ] `lesson_blocks` creada con RLS y trigger de validación de `content` *(vía A)*
- [ ] `@cet/ui` renderiza los 7 `block_kind` emitidos *(vía D)*
- [ ] `math.json` sembrado y visible en la aplicación *(Hito 2)*
- [ ] Test de contrato: los 9 `engine_key` existen en `@cet/engine` *(vía B)*
