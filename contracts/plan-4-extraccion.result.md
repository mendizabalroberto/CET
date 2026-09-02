# Resultado - plan-4-extraccion
- Contrato: `contracts/plan-4-extraccion.md`
- Modelo: deepseek-chat
- Desenlace: **verde**
- Rondas consumidas: 1 de 4
- Rama: `deepseek/plan-4-extraccion`
- Duracion: 45.8 s
## Diff

~~~diff
diff --git a/apps/web/src/lib/plan/boletin.test.ts b/apps/web/src/lib/plan/boletin.test.ts
new file mode 100644
index 0000000..9e945fc
--- /dev/null
+++ b/apps/web/src/lib/plan/boletin.test.ts
@@ -0,0 +1,190 @@
+/**
+ * © 2026 Roberto Mendizabal. Todos los derechos reservados.
+ */
+import { readFileSync } from "node:fs";
+
+import { describe, expect, it } from "vitest";
+
+import {
+  bandaDeNota,
+  ExtraccionInvalidaError,
+  extraccionCrudaSchema,
+  mapearMateria,
+  promptDeExtraccion,
+  validarExtraccion,
+} from "./boletin";
+
+const TEXTO_LEO = readFileSync(
+  new URL("./__fixtures__/leo-boletin.txt", import.meta.url),
+  "utf8",
+);
+
+const CRUDA_LEO = {
+  gestion: 2026,
+  trimestre: 1,
+  notas: [
+    { materia: "Religion and Values", nota: 88 },
+    { materia: "Social Studies", nota: 83 },
+    { materia: "Science", nota: 90 },
+    { materia: "Art", nota: 77 },
+    { materia: "Music", nota: 96 },
+    { materia: "Physical Education", nota: 88 },
+    { materia: "Math", nota: 73 },
+    { materia: "Information & Communication Technology", nota: 91 },
+    { materia: "English", nota: 64 },
+    { materia: "Spanish", nota: 78 },
+    { materia: "COML - Communication and Languages", nota: 71 },
+  ],
+};
+
+describe("extraccionCrudaSchema", () => {
+  it("acepta la forma correcta", () => {
+    expect(extraccionCrudaSchema.safeParse(CRUDA_LEO).success).toBe(true);
+  });
+
+  it("rechaza notas fuera de 0..100 o no enteras", () => {
+    expect(
+      extraccionCrudaSchema.safeParse({
+        ...CRUDA_LEO,
+        notas: [{ materia: "Math", nota: 105 }],
+      }).success,
+    ).toBe(false);
+    expect(
+      extraccionCrudaSchema.safeParse({
+        ...CRUDA_LEO,
+        notas: [{ materia: "Math", nota: -1 }],
+      }).success,
+    ).toBe(false);
+    expect(
+      extraccionCrudaSchema.safeParse({
+        ...CRUDA_LEO,
+        notas: [{ materia: "Math", nota: 73.5 }],
+      }).success,
+    ).toBe(false);
+  });
+
+  it("rechaza gestion y trimestre fuera de rango", () => {
+    expect(extraccionCrudaSchema.safeParse({ ...CRUDA_LEO, gestion: 2019 }).success).toBe(false);
+    expect(extraccionCrudaSchema.safeParse({ ...CRUDA_LEO, gestion: 2101 }).success).toBe(false);
+    expect(extraccionCrudaSchema.safeParse({ ...CRUDA_LEO, trimestre: 0 }).success).toBe(false);
+    expect(extraccionCrudaSchema.safeParse({ ...CRUDA_LEO, trimestre: 4 }).success).toBe(false);
+  });
+});
+
+describe("bandaDeNota", () => {
+  it("cubre todos los bordes de la escala impresa", () => {
+    expect(bandaDeNota(100)).toBe("outstanding");
+    expect(bandaDeNota(91)).toBe("outstanding");
+    expect(bandaDeNota(90)).toBe("well_done");
+    expect(bandaDeNota(81)).toBe("well_done");
+    expect(bandaDeNota(80)).toBe("good");
+    expect(bandaDeNota(71)).toBe("good");
+    expect(bandaDeNota(70)).toBe("satisfactory");
+    expect(bandaDeNota(64)).toBe("satisfactory");
+    expect(bandaDeNota(60)).toBe("needs_improvement");
+    expect(bandaDeNota(51)).toBe("needs_improvement");
+    expect(bandaDeNota(50)).toBe("failing");
+    expect(bandaDeNota(0)).toBe("failing");
+  });
+});
+
+describe("mapearMateria", () => {
+  it("mapea los sinónimos de las seis materias con contenido", () => {
+    expect(mapearMateria("English")).toBe("english");
+    expect(mapearMateria("INGLÉS")).toBe("english");
+    expect(mapearMateria("ingles")).toBe("english");
+    expect(mapearMateria("Math")).toBe("math");
+    expect(mapearMateria("Maths")).toBe("math");
+    expect(mapearMateria("Mathematics")).toBe("math");
+    expect(mapearMateria("Matemáticas")).toBe("math");
+    expect(mapearMateria("Matematica(s)")).toBe("math");
+    expect(mapearMateria("Science")).toBe("science");
+    expect(mapearMateria("Sciences")).toBe("science");
+    expect(mapearMateria("Ciencias")).toBe("science");
+    expect(mapearMateria("Ciencias Naturales")).toBe("science");
+    expect(mapearMateria("Spanish")).toBe("spanish");
+    expect(mapearMateria("Español")).toBe("spanish");
+    expect(mapearMateria("Lengua")).toBe("spanish");
+    expect(mapearMateria("Lenguaje")).toBe("spanish");
+    expect(mapearMateria("Castellano")).toBe("spanish");
+    expect(mapearMateria("Social Studies")).toBe("socials");
+    expect(mapearMateria("Socials")).toBe("socials");
+    expect(mapearMateria("Sociales")).toBe("socials");
+    expect(mapearMateria("Ciencias Sociales")).toBe("socials");
+    expect(mapearMateria("Estudios Sociales")).toBe("socials");
+    expect(mapearMateria("ICT")).toBe("ict");
+    expect(mapearMateria("Information & Communication Technology")).toBe("ict");
+    expect(mapearMateria("Information and Communication Technology")).toBe("ict");
+    expect(mapearMateria("Computación")).toBe("ict");
+    expect(mapearMateria("Informática")).toBe("ict");
+    expect(mapearMateria("TIC")).toBe("ict");
+  });
+
+  it("devuelve null para materias fuera del plan", () => {
+    expect(mapearMateria("Art")).toBeNull();
+    expect(mapearMateria("Music")).toBeNull();
+    expect(mapearMateria("Physical Education")).toBeNull();
+    expect(mapearMateria("Religion and Values")).toBeNull();
+    expect(mapearMateria("COML - Communication and Languages")).toBeNull();
+    expect(mapearMateria("AVERAGES")).toBeNull();
+  });
+});
+
+describe("validarExtraccion", () => {
+  it("valida el boletín real de LEO", () => {
+    const resultado = validarExtraccion(TEXTO_LEO, CRUDA_LEO);
+    expect(resultado.notas).toHaveLength(11);
+    const conCodigo = resultado.notas.filter((n) => n.code !== null);
+    expect(conCodigo).toHaveLength(6);
+    expect(conCodigo.map((n) => n.code).sort()).toEqual([
+      "english",
+      "ict",
+      "math",
+      "science",
+      "socials",
+      "spanish",
+    ]);
+    const english = resultado.notas.find((n) => n.materia === "English");
+    expect(english?.banda).toBe("satisfactory");
+    const ict = resultado.notas.find((n) => n.materia === "Information & Communication Technology");
+    expect(ict?.banda).toBe("outstanding");
+    const math = resultado.notas.find((n) => n.materia === "Math");
+    expect(math?.banda).toBe("good");
+  });
+
+  it("rechaza una materia inventada", () => {
+    const conGeografia = {
+      ...CRUDA_LEO,
+      notas: [...CRUDA_LEO.notas, { materia: "Geography", nota: 80 }],
+    };
+    expect(() => validarExtraccion(TEXTO_LEO, conGeografia)).toThrow(ExtraccionInvalidaError);
+    try {
+      validarExtraccion(TEXTO_LEO, conGeografia);
+    } catch (e) {
+      expect(e).toBeInstanceOf(ExtraccionInvalidaError);
+      expect((e as ExtraccionInvalidaError).motivo).toBe("materia_inventada");
+      expect((e as ExtraccionInvalidaError).message).toContain("Geography");
+    }
+  });
+
+  it("rechaza una nota fuera de rango por forma", () => {
+    const conNotaMala = {
+      ...CRUDA_LEO,
+      notas: CRUDA_LEO.notas.map((n, i) => (i === 0 ? { ...n, nota: 105 } : n)),
+    };
+    try {
+      validarExtraccion(TEXTO_LEO, conNotaMala);
+      expect.unreachable("debería haber lanzado");
+    } catch (e) {
+      expect(e).toBeInstanceOf(ExtraccionInvalidaError);
+      expect((e as ExtraccionInvalidaError).motivo).toBe("forma");
+    }
+  });
+});
+
+describe("promptDeExtraccion", () => {
+  it("incluye el texto del PDF en el mensaje de usuario", () => {
+    const prompt = promptDeExtraccion(TEXTO_LEO);
+    expect(prompt.user).toContain(TEXTO_LEO);
+  });
+});
diff --git a/apps/web/src/lib/plan/boletin.ts b/apps/web/src/lib/plan/boletin.ts
new file mode 100644
index 0000000..374ff00
--- /dev/null
+++ b/apps/web/src/lib/plan/boletin.ts
@@ -0,0 +1,145 @@
+/**
+ * Extracción y validación de boletines de notas.
+ * © 2026 Roberto Mendizabal. Todos los derechos reservados.
+ *
+ * La parte pura: recibe el texto del PDF y el JSON crudo del modelo, y devuelve
+ * el boletín ya validado y mapeado a las materias que la app cubre. La llamada
+ * HTTP vive en `deepseek.ts`; aquí no hay red.
+ */
+import { z } from "zod";
+
+import type { Banda, BoletinExtraido, CodigoMateria } from "./tipos";
+
+/** Forma exacta que debe devolver el modelo. */
+export const extraccionCrudaSchema: z.ZodType<{
+  gestion: number;
+  trimestre: number | null;
+  notas: { materia: string; nota: number }[];
+}> = z.object({
+  gestion: z.number().int().min(2020).max(2100),
+  trimestre: z.number().int().min(1).max(3).nullable(),
+  notas: z
+    .array(
+      z.object({
+        materia: z.string().trim().min(1),
+        nota: z.number().int().min(0).max(100),
+      }),
+    )
+    .min(1),
+});
+
+/** La escala impresa en el boletín. */
+export function bandaDeNota(nota: number): Banda {
+  if (nota >= 91) return "outstanding";
+  if (nota >= 81) return "well_done";
+  if (nota >= 71) return "good";
+  if (nota >= 61) return "satisfactory";
+  if (nota >= 51) return "needs_improvement";
+  return "failing";
+}
+
+/** Normaliza una cadena: minúsculas, sin acentos, espacios colapsados. */
+function normalizar(s: string): string {
+  return s
+    .toLowerCase()
+    .normalize("NFD")
+    .replace(/[\u0300-\u036f]/g, "")
+    .replace(/\s+/g, " ")
+    .trim();
+}
+
+const SINONIMOS: Readonly<Record<CodigoMateria, readonly string[]>> = {
+  english: ["english", "ingles"],
+  math: ["math", "maths", "mathematics", "matematicas", "matematica"],
+  science: ["science", "sciences", "ciencias", "ciencias naturales"],
+  spanish: ["spanish", "espanol", "lengua", "lenguaje", "castellano"],
+  socials: ["social studies", "socials", "sociales", "ciencias sociales", "estudios sociales"],
+  ict: [
+    "ict",
+    "information & communication technology",
+    "information and communication technology",
+    "computacion",
+    "informatica",
+    "tic",
+  ],
+};
+
+/** Mapea el nombre de una materia a su código, o null si la app no la cubre. */
+export function mapearMateria(materia: string): CodigoMateria | null {
+  const n = normalizar(materia);
+  for (const [code, sinonimos] of Object.entries(SINONIMOS) as [
+    CodigoMateria,
+    readonly string[],
+  ][]) {
+    if (sinonimos.some((s) => n === s || n === `${s}(s)`)) return code;
+  }
+  return null;
+}
+
+/** Error de validación de la extracción. */
+export class ExtraccionInvalidaError extends Error {
+  readonly motivo: "forma" | "materia_inventada";
+
+  constructor(motivo: "forma" | "materia_inventada", message?: string) {
+    super(message ?? `Extracción inválida: ${motivo}`);
+    this.name = "ExtraccionInvalidaError";
+    this.motivo = motivo;
+  }
+}
+
+/** Colapsa runs de espacios/saltos a un solo espacio y recorta. */
+function normalizarEspacios(s: string): string {
+  return s.replace(/\s+/g, " ").trim();
+}
+
+/**
+ * Valida la salida cruda del modelo contra el texto del PDF.
+ *
+ * Dos puertas duras: la forma (esquema) y que toda materia exista literalmente
+ * en el texto. Solo después se mapea a las materias de la app.
+ */
+export function validarExtraccion(textoDelPdf: string, salidaCruda: unknown): BoletinExtraido {
+  const parsed = extraccionCrudaSchema.safeParse(salidaCruda);
+  if (!parsed.success) {
+    throw new ExtraccionInvalidaError("forma");
+  }
+
+  const textoNormalizado = normalizarEspacios(textoDelPdf);
+  for (const { materia } of parsed.data.notas) {
+    if (!textoNormalizado.includes(materia)) {
+      throw new ExtraccionInvalidaError("materia_inventada", `Materia no encontrada en el texto: ${materia}`);
+    }
+  }
+
+  const trimestre = parsed.data.trimestre as 1 | 2 | 3 | null;
+  return {
+    gestion: parsed.data.gestion,
+    trimestre,
+    notas: parsed.data.notas.map(({ materia, nota }) => ({
+      materia,
+      code: mapearMateria(materia),
+      nota,
+      banda: bandaDeNota(nota),
+    })),
+  };
+}
+
+/** Instrucciones para el modelo que extrae las notas del boletín. */
+export function promptDeExtraccion(textoDelPdf: string): {
+  readonly system: string;
+  readonly user: string;
+} {
+  return {
+    system:
+      "Eres un extractor de boletines de notas. Responde SOLO con un objeto JSON " +
+      "con esta forma exacta: " +
+      '{"gestion": number, "trimestre": number | null, "notas": [{"materia": string, "nota": number}]}. ' +
+      "gestion es el año lectivo (entero entre 2020 y 2100). trimestre es el número " +
+      "del trimestre cuyas notas están presentes (1, 2 o 3), o null si no se distingue. " +
+      "notas es un arreglo con al menos una fila; cada nota es un entero entre 0 y 100. " +
+      "Copia los nombres de materia CARÁCTER A CARÁCTER tal como aparecen en el texto, " +
+      "sin traducir, sin abreviar y sin inventar materias ni notas. " +
+      "AVERAGES, la asistencia y los comentarios del tutor NO son materias: no los incluyas.",
+    user: `Extrae las notas del siguiente boletín:\n---\n${textoDelPdf}\n---`,
+  };
+}

~~~

## Salida final de `pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec vitest run src/lib/plan/boletin`

~~~

> @cet/web@0.1.0 typecheck D:\.cet-worktrees\plan-4-extraccion\apps\web
> tsc --noEmit


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/plan-4-extraccion/apps/web[39m

 [32m✓[39m src/lib/plan/boletin.test.ts [2m([22m[2m10 tests[22m[2m)[22m[90m 5[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m10 passed[39m[22m[90m (10)[39m
[2m   Start at [22m 12:38:17
[2m   Duration [22m 565ms[2m (transform 41ms, setup 167ms, collect 38ms, tests 5ms, environment 0ms, prepare 114ms)[22m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.