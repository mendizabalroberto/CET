---
id: plan-5-estratega
model: chat
territory: [apps/web/src/lib/plan/estratega*]
forbidden: [apps/web/src/lib/plan/tipos.ts, apps/web/src/lib/tutor/schemas.ts]
context: [apps/web/src/lib/plan/tipos.ts, apps/web/src/lib/tutor/schemas.ts]
verify: pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec vitest run src/lib/plan/estratega
rounds: 4
deadline: 4 rondas o 30 min
---

## 1 · El problema

Con el boletín confirmado, una llamada al modelo propone **cuántos minutos al
día** y **qué peso a cada materia**, más hasta seis recomendaciones para el
tutor. El modelo puede devolver pesos que no suman 1, materias que no existen o
más de seis frases. Te toca **la parte pura, sin red**:
`apps/web/src/lib/plan/estratega.ts` y `estratega.test.ts`. La llamada HTTP la
escribe otro agente en `deepseek.ts`; el reparto en días lo hace el motor. Aquí
solo: el prompt, el esquema y la normalización.

## 2 · La evidencia que ya tenemos

- `apps/web/src/lib/plan/tipos.ts` (te lo doy, **no lo modifiques**) define
  `MATERIAS_CON_CONTENIDO`, `CodigoMateria`, `Banda`, `NotaExtraida` y
  `Propuesta`. Importa de `./tipos`.
- `apps/web/src/lib/tutor/schemas.ts` (te lo doy) es la forma de la casa para
  Zod. `zod` ya es dependencia. `exactOptionalPropertyTypes` y
  `noUncheckedIndexedAccess` están activos.
- Lo que entra al estratega, ya estructurado (§8.1 del diseño): las notas con
  su banda y las materias que no se planifican, el inventario real de cada uno
  de los seis cursos, la ventana y su hito, y los minutos/día observados o
  `null`.

## 3 · El criterio de aceptación

`pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec vitest run src/lib/plan/estratega` sale en 0.

`estratega.ts` exporta exactamente esto:

```ts
export interface InventarioDeMateria {
  readonly code: CodigoMateria;
  readonly leccionesPublicadas: number;
  readonly leccionesCompletadas: number;
  readonly minutosEstimados: number;          // suma de estimated_minutes de las publicadas
  readonly preguntasPublicadas: number;
}
export interface EntradaEstratega {
  readonly nombreDePila: string;
  readonly notas: readonly NotaExtraida[];   // todas, también las de code null
  readonly inventario: readonly InventarioDeMateria[];
  readonly ventana: { readonly desde: string; readonly hasta: string; readonly hito: string };
  readonly minutosPorDiaObservados: number | null;
}
export const propuestaCrudaSchema: z.ZodType<{ minutos_por_dia: number; reparto: Record<string, number>; recomendaciones: string[] }>;
export class PropuestaInvalidaError extends Error {}
export function normalizarReparto(reparto: Record<string, number>): Partial<Record<CodigoMateria, number>>;
export function validarPropuesta(salidaCruda: unknown): Propuesta;
export function promptDeEstratega(entrada: EntradaEstratega): { readonly system: string; readonly user: string };
```

- `propuestaCrudaSchema`: `minutos_por_dia` entero 10..180; `reparto` objeto
  de cadena → número ≥ 0 (finito); `recomendaciones` lista de cadenas
  recortadas no vacías de como máximo 400 caracteres, **como máximo 6** (más de
  seis tumba la propuesta: la tabla tiene ese `check`).
- `normalizarReparto`:
  1. Descarta las claves que no estén en `MATERIAS_CON_CONTENIDO` (`art`,
     `music`, `pe`, `coml`, lo que sea) y las que valgan 0.
  2. Si no queda ninguna clave, `PropuestaInvalidaError`.
  3. Renormaliza para que la suma sea exactamente 1 (divide cada peso por la
     suma). Si la suma original ya estaba en 1 ± 0,01 se renormaliza igual: la
     salida siempre suma 1 con tolerancia 1e-9.
  4. Devuelve un objeto nuevo con las claves en el orden de
     `MATERIAS_CON_CONTENIDO`.
- `validarPropuesta`: esquema → `PropuestaInvalidaError` si falla; después
  `normalizarReparto`; devuelve `{ minutosPorDia, reparto, recomendaciones }`.
- `promptDeEstratega`: `system` fija el papel (planificador de estudio para un
  niño de 10–11 años, habla a un adulto), la forma exacta del JSON de salida
  (`minutos_por_dia`, `reparto` con pesos que suman 1 usando SOLO las claves
  `english, ict, math, science, socials, spanish`, `recomendaciones` de 0 a 6
  frases), y tres límites: no inventar materias, no citar cifras medidas de
  estudio en las recomendaciones, y tener en cuenta que una materia con poco
  contenido publicado no puede absorber mucho tiempo aunque la nota sea baja.
  `user` serializa la entrada (`JSON.stringify` con sangría) precedida de una
  línea por bloque: las notas con banda y cuáles no se planifican, el
  inventario, la ventana y el hito, y los minutos observados o «sin
  historial».

Pruebas mínimas en `estratega.test.ts`:

- Un reparto `{english: 0.35, math: 0.25, spanish: 0.2, science: 0.1, socials: 0.1}`
  sale igual (suma 1) y con las claves en orden de `MATERIAS_CON_CONTENIDO`.
- `{english: 2, math: 2}` → `{english: 0.5, math: 0.5}`.
- `{english: 0.5, art: 0.5}` → `{english: 1}`; `{art: 1}` → lanza.
- `{english: 0.7, math: 0.3, science: 0}` no contiene `science`.
- `validarPropuesta` con 7 recomendaciones lanza; con `minutos_por_dia: 200`
  lanza; con `minutos_por_dia: 45` y el reparto del primer caso devuelve
  `minutosPorDia === 45`.
- `promptDeEstratega(...).user` contiene el nombre de pila, el hito y la
  palabra que marque «no se planifica» junto a una materia con `code: null`.
- `promptDeEstratega(...).system` contiene las seis claves permitidas.

## 4 · Qué NO cuenta como resuelto

- Llamar a `fetch` o a cualquier red.
- Modificar `tipos.ts`.
- Dejar pasar una clave ajena a las seis materias, o un reparto que no sume 1.
- Un prompt que pida al modelo cifras de minutos estudiados o brecha: eso es
  aritmética del repartidor, no del modelo.
- Decir «debería pasar». Ejecuta el verificador y pega su salida literal.
