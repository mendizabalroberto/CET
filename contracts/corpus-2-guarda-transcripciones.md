---
id: corpus-2-guarda-transcripciones
model: chat
territory: [packages/content/__tests__/corpus-transcripts.test.ts]
forbidden: [packages/content/src/corpus/transcript.ts, packages/content/src/corpus/ingest.ts, packages/ui/src/index.ts]
context: [packages/content/src/corpus/transcript.ts, packages/content/src/corpus/ingest.ts, packages/content/__tests__/corpus.test.ts]
verify: pnpm --filter @cet/content test
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 3
deadline: 3 rondas o 15 min
---

## 1 · El problema

`packages/content/transcripts/` tiene 40 transcripciones: el texto de las
imagenes y los PDF escaneados de Y6A, escritos a mano mirando cada fichero.
Sobre esos spans se hacen CITAS LITERALES que llegan hasta preguntas publicadas.

Nadie las vigila. Hoy pueden estar rotas de cuatro maneras y el arbol sigue
verde:

1. Una transcripcion que ya no valida contra su esquema Zod.
2. Una transcripcion cuyo `checksum` no corresponde al fichero actual —es decir,
   describe una version anterior de esa imagen. Esto es lo peor de todo: no
   rompe nada, describe otra cosa.
3. Una transcripcion huerfana: apunta a un fichero de Y6A que ya no existe.
4. Un fichero de Y6A del carril de vision SIN transcripcion, que es trabajo
   pendiente que nadie ve.

## 2 · La evidencia que ya tenemos

- El esquema y el cargador estan en
  `packages/content/src/corpus/transcript.ts`: `transcripcion` (Zod),
  `cargarTranscripcion()`, `nombreDeTranscripcion()`, `TRANSCRIPTS_DIR`,
  `TranscripcionCaducaError`.
- El inventario de Y6A esta en `packages/content/src/corpus/ingest.ts`:
  `inventory(repoRoot)` devuelve, por fichero, su `path`, su `checksum`, su
  `method` (`vision | text_layer | office_xml | plain | html_trainer`) y si es
  duplicado exacto de otro.
- `packages/content/__tests__/corpus.test.ts` ya tiene un bloque
  `describe("cargarTranscripcion")` que prueba el CARGADOR con ficheros
  temporales. Este contrato es otra cosa: probar las transcripciones REALES que
  hay en el repositorio.
- Ojo con un detalle real: hay ficheros de Y6A clasificados `text_layer` por la
  heuristica de bytes que en realidad son escaneos, y tienen transcripcion. Un
  test que exija `method === "vision"` para tener transcripcion daria falsos
  rojos sobre siete documentos de English que estan bien.

## 3 · El criterio de aceptacion

Un fichero nuevo, `packages/content/__tests__/corpus-transcripts.test.ts`, y
`pnpm --filter @cet/content test` en verde. Tiene que fallar, con un mensaje que
diga QUE fichero y POR QUE, en cada uno de los cuatro casos de arriba.

El test recorre las transcripciones que hay de verdad en el repositorio. Si
manana alguien reemplaza una imagen de Y6A sin rehacer su transcripcion, este
test se pone rojo. Ese es el unico motivo por el que existe.

## 4 · Que NO cuenta como resuelto

- Un test que solo compruebe que el directorio existe o que tiene N ficheros.
- Un test que lea una transcripcion de ejemplo escrita por ti: el objeto de
  prueba son las 40 reales.
- Aflojar el esquema de `transcript.ts` para que alguna pase. Ese fichero esta
  PROHIBIDO en este contrato justamente por eso: si una transcripcion no valida,
  el fallo es de la transcripcion o del test, nunca del esquema.
- Un numero magico de transcripciones esperadas escrito a mano en el test: el
  numero cambia cada vez que alguien transcribe una mas, y un test que hay que
  editar en cada avance se acaba borrando.
