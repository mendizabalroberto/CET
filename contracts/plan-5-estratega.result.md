# Resultado - plan-5-estratega
- Contrato: `contracts/plan-5-estratega.md`
- Modelo: deepseek-reasoner
- Desenlace: **verde**
- Rondas consumidas: 2 de 4
- Rama: `deepseek/plan-5-estratega`
- Duracion: 289.7 s
## Diff

~~~diff
diff --git a/apps/web/src/lib/plan/estratega.test.ts b/apps/web/src/lib/plan/estratega.test.ts
new file mode 100644
index 0000000..1135bdc
--- /dev/null
+++ b/apps/web/src/lib/plan/estratega.test.ts
@@ -0,0 +1,90 @@
+import { describe, expect, it } from "vitest";
+import {
+  normalizarReparto,
+  promptDeEstratega,
+  PropuestaInvalidaError,
+  validarPropuesta,
+  type EntradaEstratega,
+} from "./estratega";
+import { MATERIAS_CON_CONTENIDO } from "./tipos";
+
+const reparto = { english: 0.35, math: 0.25, spanish: 0.2, science: 0.1, socials: 0.1 };
+
+describe("normalizarReparto", () => {
+  it("conserva un reparto que ya suma 1 y usa el orden canónico", () => {
+    const r = normalizarReparto(reparto);
+    expect(Object.keys(r)).toEqual(["english", "math", "science", "socials", "spanish"]);
+    expect(Object.values(r).reduce((a, b) => a + (b ?? 0), 0)).toBeCloseTo(1, 9);
+    expect(r.english ?? 0).toBeCloseTo(0.35, 9);
+  });
+
+  it("renormaliza pesos que no suman 1", () => {
+    expect(normalizarReparto({ english: 2, math: 2 })).toEqual({ english: 0.5, math: 0.5 });
+  });
+
+  it("descarta claves ajenas y pesos 0", () => {
+    expect(normalizarReparto({ english: 0.5, art: 0.5 })).toEqual({ english: 1 });
+    expect(() => normalizarReparto({ art: 1 })).toThrow(PropuestaInvalidaError);
+    const r = normalizarReparto({ english: 0.7, math: 0.3, science: 0 });
+    expect(r.science).toBeUndefined();
+  });
+});
+
+describe("validarPropuesta", () => {
+  const base = {
+    minutos_por_dia: 45,
+    reparto,
+    recomendaciones: ["Revisa la tabla del 7 en voz alta."],
+  };
+
+  it("valida un caso bueno", () => {
+    expect(validarPropuesta(base).minutosPorDia).toBe(45);
+  });
+
+  it("rechaza más de seis recomendaciones y horas imposibles", () => {
+    expect(() =>
+      validarPropuesta({
+        ...base,
+        recomendaciones: Array.from({ length: 7 }, () => "Frase."),
+      })
+    ).toThrow(PropuestaInvalidaError);
+    expect(() => validarPropuesta({ ...base, minutos_por_dia: 200 })).toThrow(
+      PropuestaInvalidaError
+    );
+  });
+});
+
+describe("promptDeEstratega", () => {
+  const entrada: EntradaEstratega = {
+    nombreDePila: "Lucía",
+    notas: [
+      { materia: "Arte", code: null, nota: 8.2, banda: "well_done" },
+      { materia: "Inglés", code: "english", nota: 6.4, banda: "satisfactory" },
+    ],
+    inventario: [
+      {
+        code: "english",
+        leccionesPublicadas: 10,
+        leccionesCompletadas: 3,
+        minutosEstimados: 450,
+        preguntasPublicadas: 12,
+      },
+    ],
+    ventana: {
+      desde: "2026-09-07",
+      hasta: "2026-12-18",
+      hito: "preparar el examen de diciembre",
+    },
+    minutosPorDiaObservados: null,
+  };
+
+  it("incluye los datos que ya conocemos y el aviso de no planificadas", () => {
+    const { user, system } = promptDeEstratega(entrada);
+    expect(user).toContain("Lucía");
+    expect(user).toContain("preparar el examen de diciembre");
+    expect(user).toContain("no se planifica");
+    for (const materia of MATERIAS_CON_CONTENIDO) {
+      expect(system).toContain(materia);
+    }
+  });
+});
diff --git a/apps/web/src/lib/plan/estratega.ts b/apps/web/src/lib/plan/estratega.ts
new file mode 100644
index 0000000..7d611b1
--- /dev/null
+++ b/apps/web/src/lib/plan/estratega.ts
@@ -0,0 +1,126 @@
+import { z } from "zod";
+import {
+  MATERIAS_CON_CONTENIDO,
+  type CodigoMateria,
+  type NotaExtraida,
+  type Propuesta,
+} from "./tipos";
+
+export interface InventarioDeMateria {
+  readonly code: CodigoMateria;
+  readonly leccionesPublicadas: number;
+  readonly leccionesCompletadas: number;
+  readonly minutosEstimados: number;
+  readonly preguntasPublicadas: number;
+}
+
+export interface EntradaEstratega {
+  readonly nombreDePila: string;
+  readonly notas: readonly NotaExtraida[];
+  readonly inventario: readonly InventarioDeMateria[];
+  readonly ventana: {
+    readonly desde: string;
+    readonly hasta: string;
+    readonly hito: string;
+  };
+  readonly minutosPorDiaObservados: number | null;
+}
+
+const pesoNoNegativo = z
+  .number()
+  .refine((v) => Number.isFinite(v) && v >= 0, { message: "peso_invalido" });
+
+export const propuestaCrudaSchema: z.ZodType<{
+  minutos_por_dia: number;
+  reparto: Record<string, number>;
+  recomendaciones: string[];
+}> = z.object({
+  minutos_por_dia: z.number().int().min(10).max(180),
+  reparto: z.record(z.string(), pesoNoNegativo),
+  recomendaciones: z.array(z.string().trim().min(1).max(400)).max(6),
+});
+
+export class PropuestaInvalidaError extends Error {
+  constructor() {
+    super("propuesta_invalida");
+  }
+}
+
+export function normalizarReparto(
+  reparto: Record<string, number>
+): Partial<Record<CodigoMateria, number>> {
+  const pesos: Partial<Record<CodigoMateria, number>> = {};
+  let suma = 0;
+  for (const code of MATERIAS_CON_CONTENIDO) {
+    const peso = reparto[code];
+    if (typeof peso !== "number" || !Number.isFinite(peso) || peso <= 0) {
+      continue;
+    }
+    pesos[code] = peso;
+    suma += peso;
+  }
+  if (suma === 0) {
+    throw new PropuestaInvalidaError();
+  }
+  for (const code of MATERIAS_CON_CONTENIDO) {
+    const peso = pesos[code];
+    if (peso !== undefined) {
+      pesos[code] = peso / suma;
+    }
+  }
+  return pesos;
+}
+
+export function validarPropuesta(salidaCruda: unknown): Propuesta {
+  const resultado = propuestaCrudaSchema.safeParse(salidaCruda);
+  if (!resultado.success) {
+    throw new PropuestaInvalidaError();
+  }
+  return {
+    minutosPorDia: resultado.data.minutos_por_dia,
+    reparto: normalizarReparto(resultado.data.reparto),
+    recomendaciones: resultado.data.recomendaciones,
+  };
+}
+
+const CLAVES_PERMITIDAS = MATERIAS_CON_CONTENIDO.join(", ");
+
+export function promptDeEstratega(entrada: EntradaEstratega): {
+  readonly system: string;
+  readonly user: string;
+} {
+  const datosNotas = entrada.notas.map(({ materia, code, nota, banda }) => ({
+    materia,
+    code: code ?? "no se planifica",
+    nota,
+    banda,
+  }));
+  const historial =
+    entrada.minutosPorDiaObservados === null
+      ? "sin historial"
+      : entrada.minutosPorDiaObservados;
+
+  const system = [
+    "Eres un planificador de estudio para un niño de 10–11 años; escribes a un adulto.",
+    "Responde solo con un JSON válido con esta forma exacta:",
+    '{ "minutos_por_dia": 45, "reparto": { "english": 0.4, "math": 0.3, "spanish": 0.3 }, "recomendaciones": ["frase"] }',
+    `En "reparto" usa SOLO las claves ${CLAVES_PERMITIDAS}.`,
+    "Los pesos de esas claves suman 1.",
+    "No inventes materias. No cites cifras medidas de estudio en las recomendaciones; la aritmética la hace el repartidor.",
+    "Una materia con poco contenido publicado no puede absorber mucho tiempo aunque su nota sea baja.",
+    "recomendaciones: de 0 a 6 frases breves para un adulto.",
+  ].join("\n");
+
+  const user = [
+    `Alumno: ${entrada.nombreDePila}`,
+    "Boletín (code null = no se planifica):",
+    JSON.stringify(datosNotas, null, 2),
+    "Inventario de contenido publicado:",
+    JSON.stringify(entrada.inventario, null, 2),
+    "Ventana y hito:",
+    JSON.stringify(entrada.ventana, null, 2),
+    `Minutos por día observados: ${historial}`,
+  ].join("\n");
+
+  return { system, user };
+}

~~~

## Salida final de `pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec vitest run src/lib/plan/estratega`

~~~

> @cet/web@0.1.0 typecheck D:\.cet-worktrees\plan-5-estratega\apps\web
> tsc --noEmit


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/plan-5-estratega/apps/web[39m

 [32m✓[39m src/lib/plan/estratega.test.ts [2m([22m[2m6 tests[22m[2m)[22m[90m 3[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m   Start at [22m 12:50:11
[2m   Duration [22m 439ms[2m (transform 30ms, setup 152ms, collect 33ms, tests 3ms, environment 0ms, prepare 59ms)[22m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.