---
id: corpus-1-pdf-restos
model: chat
territory: [packages/content/src/corpus/pdf.ts, packages/content/__tests__/corpus-pdf.test.ts]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, packages/content/src/corpus/ingest.ts]
context: [packages/content/src/corpus/pdf.ts, packages/content/__tests__/corpus-pdf.test.ts, packages/content/src/corpus/spans.ts]
verify: pnpm --filter @cet/content test
setup: pnpm install --prefer-offline --frozen-lockfile && node -e "require('fs').cpSync('D:/Cambridge Exam Trainer/Y6A','Y6A',{recursive:true})"
rounds: 3
deadline: 3 rondas o 20 min
---

## 1 · El problema

`pdfToSpans()` ya une fracciones apiladas y reconstruye columnas. Quedaron tres
casos sin resolver, documentados por quien hizo ese trabajo. Este contrato
ataca **solo el primero**.

En `Y6A/Math/Grade 5 Math Exam - ANSWER KEY.pdf`, pagina 2, la SECTION I es una
tabla real de 4 columnas donde **cada celda ocupa varias lineas**. El "Working"
de una fila se solapa en Y con el "Area" de la siguiente, asi que el agrupado
por coordenada Y las mezcla. Hoy sale en spans sueltos e inservibles.

Es el documento de mas valor del corpus —es la clave de respuestas de un examen
real— y esa seccion es la unica parte que sigue ilegible.

## 2 · La evidencia que ya tenemos

Salida actual, literal:

```
1 (cm) Big rectangle 12 × 9 = 108; ... 42 cm
cm²
P = 12 + 9 + 7 + 5 + 5 + 4
```

El resto del fichero SI sale bien desde el trabajo anterior:

```
[4] p1 1 | b) 3/4
[6] p1 3 | b) 31/7
[26] p1 a) 24/36 = 2/3 | a) 5/9 < 2/3
[31] p1 3/8 + 1/6 = 13/24 | 2/5 + 7/10 = 11/10 = 1 1/10
```

Para ver el estado de esa pagina:

```
cd packages/content && npx tsx -e "import {inventory,ingest} from './src/corpus/ingest.ts'; const r=process.cwd()+'/../..'; const e=inventory(r).find(x=>x.path.includes('ANSWER KEY')); ingest(r,e).then(d=>{for(const s of d.spans.filter(s=>s.page===2)) console.log('['+s.ord+'] '+s.text);});"
```

## 3 · El criterio de aceptacion

`pnpm --filter @cet/content test` en verde, con al menos un test NUEVO en
`packages/content/__tests__/corpus-pdf.test.ts` que compruebe que en la pagina 2
de ese fichero cada fila de la SECTION I sale en UN span, con sus celdas unidas
por ` | ` y con `kind` igual a `table_row`.

Y una no-regresion que ya existe y no puede bajar: el numero total de
caracteres extraidos de `Y6A/Socials/SSBooklet25.pdf` (22 paginas de prosa) no
debe disminuir, ni el de los otros tres PDF de examen de Math.

## 4 · Que NO cuenta como resuelto

- Un test que compruebe que la funcion no lanza. Eso ya pasaba antes.
- Unir lineas verticalmente "por si acaso" en todo el documento: romperia la
  prosa de SSBooklet25, que es el otro caso de este mismo extractor. La union
  vertical de celdas tiene que estar acotada a una tabla ya detectada.
- Inventar el contenido de una celda por analogia con la de al lado. Si una
  celda no se puede reconstruir con fundamento, es preferible dejarla como
  esta: un dato plausible no es un dato correcto.
- Cambiar el fixture o el umbral de un test existente para que pase.
- Tocar `ingest.ts`: esta prohibido a proposito, para que la mejora se pruebe
  donde vive.

## 5 · Dos condiciones del entorno que no puedes ignorar

**`Y6A/` no esta en git.** Es material del centro educativo, propiedad de
terceros, y `.gitignore` lo excluye a proposito. En este worktree lo tienes
porque el `setup` de este contrato lo copia SOLO para poder verificar; en CI y
en cualquier otro clon NO existe.

Consecuencia, y es obligatoria: todo `describe` que lea un fichero de `Y6A`
tiene que saltarse limpiamente cuando el material no esta. El patron ya existe
en este mismo paquete y se usa en `pipeline.test.ts`, `corpus.test.ts` y
`corpus-pdf.test.ts`:

```ts
const hayMaterial = existsSync(join(repoRoot, "Y6A"));
const describeConMaterial = hayMaterial ? describe : describe.skip;
```

Y ojo con un detalle de vitest: `describe.skip` SI ejecuta su callback para
recolectar los tests. Un `readFileSync` suelto en el cuerpo del describe revienta
igual. La carga va dentro de `beforeAll`, con la variable declarada fuera.

Un test que reviente sin material deja CI en rojo. Ya paso una vez, y costo dos
contratos agotados en rojo por un motivo que no tenia nada que ver con el
encargo.
