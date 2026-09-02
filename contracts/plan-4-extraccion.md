---
id: plan-4-extraccion
model: chat
territory: [apps/web/src/lib/plan/boletin*]
forbidden: [apps/web/src/lib/plan/tipos.ts, apps/web/src/lib/plan/__fixtures__/leo-boletin.txt, apps/web/src/lib/tutor/schemas.ts]
context: [apps/web/src/lib/plan/tipos.ts, apps/web/src/lib/plan/__fixtures__/leo-boletin.txt, apps/web/src/lib/tutor/schemas.ts, apps/web/src/lib/tutor/schemas.test.ts]
verify: pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec vitest run src/lib/plan/boletin
rounds: 4
deadline: 4 rondas o 30 min
---

## 1 · El problema

El tutor sube el boletín en PDF; la app saca el texto y se lo manda a un modelo
que devuelve `{gestion, trimestre, notas: [{materia, nota}]}`. Ese JSON no vale
hasta que pasa dos puertas duras y se mapea a las materias que la app cubre. Te
toca **la parte pura, sin red**: `apps/web/src/lib/plan/boletin.ts` y
`apps/web/src/lib/plan/boletin.test.ts`. La llamada HTTP la escribe otro agente
en `deepseek.ts`; no la escribas tú.

## 2 · La evidencia que ya tenemos

- Los tipos `CodigoMateria`, `Banda`, `NotaExtraida`, `BoletinExtraido` y la
  lista `MATERIAS_CON_CONTENIDO` están en `apps/web/src/lib/plan/tipos.ts` (te
  lo doy). **No lo modifiques**: importa de `./tipos`.
- El texto REAL del boletín de LEO, tal como lo devuelve `pdfToSpans`, está en
  `apps/web/src/lib/plan/__fixtures__/leo-boletin.txt` (te lo doy). Léelo en el
  test con `readFileSync(new URL("./__fixtures__/leo-boletin.txt", import.meta.url), "utf8")`.
  Trae once materias, entre ellas `Information & Communication Technology`,
  `Social Studies`, `Religion and Values`, `Physical Education`, `COML -
  Communication and Languages`, y la escala impresa: Outstanding 91-100, Well
  Done 81-90, Good 71-80, Satisfactory 61-70, Needs Improvement 51-60, Failing
  ≤ 50. Solo hay notas de un trimestre (la columna T 1), gestión 2026.
- `apps/web/src/lib/tutor/schemas.ts` y su test (te los doy) son la forma de la
  casa para esquemas Zod y para probarlos. `zod` ya es dependencia de
  `@cet/web`.
- El proyecto compila con `exactOptionalPropertyTypes` y
  `noUncheckedIndexedAccess`.

## 3 · El criterio de aceptación

`pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec vitest run src/lib/plan/boletin` sale en 0.

`boletin.ts` exporta exactamente esto:

```ts
export const extraccionCrudaSchema: z.ZodType<{ gestion: number; trimestre: number | null; notas: { materia: string; nota: number }[] }>;
export function bandaDeNota(nota: number): Banda;
export function mapearMateria(materia: string): CodigoMateria | null;
export class ExtraccionInvalidaError extends Error { readonly motivo: "forma" | "materia_inventada"; }
export function validarExtraccion(textoDelPdf: string, salidaCruda: unknown): BoletinExtraido;
export function promptDeExtraccion(textoDelPdf: string): { readonly system: string; readonly user: string };
```

- `extraccionCrudaSchema`: `gestion` entero 2020..2100; `trimestre` entero
  1..3 o `null`; `notas` con al menos una fila; `materia` cadena no vacía
  (recortada); `nota` **entero 0..100**. Una nota de 105 o de −1 tumba la
  extracción entera (`ExtraccionInvalidaError` con `motivo: "forma"`).
- `bandaDeNota`: la escala impresa. 100 → `outstanding`, 91 → `outstanding`,
  90 → `well_done`, 81 → `well_done`, 80 → `good`, 71 → `good`, 70 →
  `satisfactory`, 64 → `satisfactory`, 60 → `needs_improvement`, 51 →
  `needs_improvement`, 50 → `failing`, 0 → `failing`.
- `mapearMateria`: insensible a mayúsculas, acentos y espacios sobrantes.
  Sinónimos mínimos: `english`, `inglés`, `ingles` → `english`; `math`,
  `maths`, `mathematics`, `matemáticas`, `matematica(s)` → `math`; `science`,
  `sciences`, `ciencias`, `ciencias naturales` → `science`; `spanish`,
  `español`, `lengua`, `lenguaje`, `castellano` → `spanish`; `social studies`,
  `socials`, `sociales`, `ciencias sociales`, `estudios sociales` → `socials`;
  `ict`, `information & communication technology`, `information and
  communication technology`, `computación`, `informática`, `tic` → `ict`. Todo
  lo demás → `null`: `Art`, `Music`, `Physical Education`, `Religion and
  Values`, `COML - Communication and Languages` y `AVERAGES` devuelven `null`.
- `validarExtraccion(texto, cruda)`:
  1. Pasa `cruda` por el esquema; si falla, `ExtraccionInvalidaError("forma")`.
  2. **Toda `materia` devuelta debe aparecer literalmente en el texto del
     PDF.** Normaliza los espacios de los dos lados (runs de espacios/saltos →
     un espacio, `trim`) y comprueba `texto.includes(materia)` **sensible a
     mayúsculas**. Si una sola falta, `ExtraccionInvalidaError("materia_inventada")`
     con el nombre de la materia en el `message`.
  3. Devuelve `BoletinExtraido` con `code = mapearMateria(materia)`,
     `banda = bandaDeNota(nota)`, y `trimestre` como `1 | 2 | 3 | null`.
- `promptDeExtraccion`: `system` explica que responde SOLO con un objeto JSON
  con esa forma exacta, copiando los nombres de materia **carácter a carácter
  como aparecen en el texto**, sin inventar materias ni notas, `trimestre` como
  el número del trimestre cuyas notas están presentes (o `null`), y que
  `AVERAGES`, la asistencia y los comentarios no son materias; `user` es el
  texto del PDF entre delimitadores claros. Sin cifras medidas ni nada más.

Pruebas mínimas en `boletin.test.ts`:

- Con el fixture de LEO y una salida cruda que reproduce sus once materias con
  sus notas (Religion and Values 88, Social Studies 83, Science 90, Art 77,
  Music 96, Physical Education 88, Math 73, Information & Communication
  Technology 91, English 64, Spanish 78, COML - Communication and Languages 71;
  gestión 2026, trimestre 1): pasa, devuelve 11 notas, exactamente 6 con `code`
  no nulo (`english`, `ict`, `math`, `science`, `socials`, `spanish`), English
  con banda `satisfactory`, ICT `outstanding`, Math `good`.
- La misma salida con una materia `Geography` añadida: `materia_inventada`.
- La misma con `nota: 105` en cualquier fila: `forma`.
- `mapearMateria` con los sinónimos de arriba y con los cuatro que deben dar
  `null`.
- `bandaDeNota` en todos los bordes listados.
- `promptDeExtraccion(texto).user` contiene el texto del PDF.

## 4 · Qué NO cuenta como resuelto

- Llamar a `fetch` o a cualquier red. Aquí no hay E/S.
- Modificar `tipos.ts` o el fixture.
- Una comprobación de materia que sea `toLowerCase().includes`: la regla es
  literal a propósito, es lo que queda de la regla del corpus.
- Aceptar notas no enteras o fuera de 0..100.
- Decir «debería pasar». Ejecuta el verificador y pega su salida literal.
