# Resultado - rev-2-calendario-por-curso
- Contrato: `contracts/rev-2-calendario-por-curso.md`
- Modelo: deepseek-chat
- Desenlace: **verde**
- Rondas consumidas: 1 de 4
- Rama: `deepseek/rev-2-calendario-por-curso`
- Duracion: 31.9 s
## Diff

~~~diff
diff --git a/apps/web/src/lib/plan/consultas.test.ts b/apps/web/src/lib/plan/consultas.test.ts
index caab78a..8bc66e2 100644
--- a/apps/web/src/lib/plan/consultas.test.ts
+++ b/apps/web/src/lib/plan/consultas.test.ts
@@ -1,6 +1,8 @@
 import { describe, expect, it } from "vitest";
 
 import {
+  filtrarCalendarioPorCurso,
+  recortarVentana,
   armarEntradaReparto,
   armarInventarioEstratega,
   notaGuardadaSchema,
@@ -160,3 +162,101 @@ describe("armarEntradaReparto", () => {
     expect(entrada.materias).toEqual([]);
   });
 });
+
+describe("filtrarCalendarioPorCurso", () => {
+  it("deja pasar un feriado sin year_levels", () => {
+    const resultado = filtrarCalendarioPorCurso(
+      [{ desde: "2026-09-07", hasta: "2026-09-07", tipo: "feriado" }],
+      6,
+    );
+    expect(resultado).toEqual([
+      { desde: "2026-09-07", hasta: "2026-09-07", tipo: "feriado" },
+    ]);
+  });
+
+  it("descarta un hito de otro curso", () => {
+    const resultado = filtrarCalendarioPorCurso(
+      [
+        {
+          desde: "2026-09-07",
+          hasta: "2026-09-07",
+          tipo: "hito_cambridge",
+          year_levels: [4],
+        },
+      ],
+      6,
+    );
+    expect(resultado).toEqual([]);
+  });
+
+  it("conserva un hito del curso del alumno", () => {
+    const resultado = filtrarCalendarioPorCurso(
+      [
+        {
+          desde: "2026-09-07",
+          hasta: "2026-09-07",
+          tipo: "hito_cambridge",
+          year_levels: [6],
+        },
+      ],
+      6,
+    );
+    expect(resultado).toEqual([
+      { desde: "2026-09-07", hasta: "2026-09-07", tipo: "hito_cambridge" },
+    ]);
+  });
+
+  it("descarta un hito con year_levels cuando no se conoce el curso", () => {
+    const resultado = filtrarCalendarioPorCurso(
+      [
+        {
+          desde: "2026-09-07",
+          hasta: "2026-09-07",
+          tipo: "hito_cambridge",
+          year_levels: [6],
+        },
+      ],
+      null,
+    );
+    expect(resultado).toEqual([]);
+  });
+
+  it("conserva un hito con year_levels vacio", () => {
+    const resultado = filtrarCalendarioPorCurso(
+      [
+        {
+          desde: "2026-09-07",
+          hasta: "2026-09-07",
+          tipo: "hito_cambridge",
+          year_levels: [],
+        },
+      ],
+      6,
+    );
+    expect(resultado).toEqual([
+      { desde: "2026-09-07", hasta: "2026-09-07", tipo: "hito_cambridge" },
+    ]);
+  });
+});
+
+describe("recortarVentana", () => {
+  it("conserva solo los eventos dentro de la ventana", () => {
+    const resultado = recortarVentana(
+      [
+        { desde: "2026-09-01", hasta: "2026-09-01", tipo: "feriado" },
+        { desde: "2026-09-10", hasta: "2026-09-11", tipo: "hito_cambridge", year_levels: [6] },
+        { desde: "2026-10-01", hasta: "2026-10-01", tipo: "feriado" },
+      ],
+      "2026-09-05",
+      "2026-09-30",
+    );
+    expect(resultado).toEqual([
+      {
+        desde: "2026-09-10",
+        hasta: "2026-09-11",
+        tipo: "hito_cambridge",
+        yearLevels: [6],
+      },
+    ]);
+  });
+});
diff --git a/apps/web/src/lib/plan/consultas.ts b/apps/web/src/lib/plan/consultas.ts
index 93f41fe..ff70c3b 100644
--- a/apps/web/src/lib/plan/consultas.ts
+++ b/apps/web/src/lib/plan/consultas.ts
@@ -533,18 +533,12 @@ const eventoCalendarioSchema = z.object({
   ]),
 });
 
-export async function calendarioDelPlan(gestion: number): Promise<EventoCalendario[]> {
-  const { createClient } = await import("@/lib/supabase/server");
-  const supabase = await createClient();
-  const { data, error } = await supabase
-    .from("calendario_eventos")
-    .select("desde, hasta, tipo, year_levels")
-    .eq("gestion", gestion)
-    .order("desde", { ascending: true });
-
-  if (error !== null || data === null) return [];
+export function filtrarCalendarioPorCurso(
+  filas: readonly unknown[],
+  yearLevel: number | null,
+): EventoCalendario[] {
   const resultado: EventoCalendario[] = [];
-  for (const bruta of data) {
+  for (const bruta of filas) {
     if (!esFila(bruta)) continue;
     const parse = eventoCalendarioSchema.safeParse(bruta);
     if (!parse.success) continue;
@@ -556,7 +550,8 @@ export async function calendarioDelPlan(gestion: number): Promise<EventoCalendar
     if (
       parse.data.tipo === "hito_cambridge" &&
       Array.isArray(yearLevels) &&
-      yearLevels.length > 0
+      yearLevels.length > 0 &&
+      (yearLevel === null || !yearLevels.includes(yearLevel))
     ) {
       continue;
     }
@@ -565,6 +560,72 @@ export async function calendarioDelPlan(gestion: number): Promise<EventoCalendar
   return resultado;
 }
 
+export async function calendarioDelPlan(
+  gestion: number,
+  yearLevel: number | null = null,
+): Promise<EventoCalendario[]> {
+  const { createClient } = await import("@/lib/supabase/server");
+  const supabase = await createClient();
+  const { data, error } = await supabase
+    .from("calendario_eventos")
+    .select("desde, hasta, tipo, year_levels")
+    .eq("gestion", gestion)
+    .order("desde", { ascending: true });
+
+  if (error !== null || data === null) return [];
+  return filtrarCalendarioPorCurso(data, yearLevel);
+}
+
+export interface EventoProximo {
+  readonly desde: string;
+  readonly hasta: string;
+  readonly tipo: EventoCalendario["tipo"];
+  readonly yearLevels: number[];
+}
+
+export function recortarVentana(
+  filas: readonly unknown[],
+  desde: string,
+  hasta: string,
+): EventoProximo[] {
+  const resultado: EventoProximo[] = [];
+  for (const bruta of filas) {
+    if (!esFila(bruta)) continue;
+    const parse = eventoCalendarioSchema.safeParse(bruta);
+    if (!parse.success) continue;
+    if (parse.data.hasta < desde || parse.data.desde > hasta) continue;
+    const yearLevelsBruto = bruta["year_levels"];
+    const yearLevels = Array.isArray(yearLevelsBruto)
+      ? yearLevelsBruto.filter((x): x is number => typeof x === "number")
+      : [];
+    resultado.push({ ...parse.data, yearLevels });
+  }
+  return resultado;
+}
+
+export async function eventosProximos(
+  gestion: number,
+  desde: string,
+  dias: number = 60,
+): Promise<EventoProximo[]> {
+  const { createClient } = await import("@/lib/supabase/server");
+  const supabase = await createClient();
+  const hasta = sumarDias(desde, dias);
+  const { data, error } = await supabase
+    .from("calendario_eventos")
+    .select("desde, hasta, tipo, year_levels")
+    .eq("gestion", gestion)
+    .gte("hasta", desde)
+    .lte("desde", hasta)
+    .order("desde", { ascending: true });
+
+  if (error !== null || data === null) {
+    console.error("[cet] eventosProximos", error);
+    return [];
+  }
+  return recortarVentana(data, desde, hasta);
+}
+
 export async function minutosObservados(studentId: string): Promise<number | null> {
   const { createClient } = await import("@/lib/supabase/server");
   const supabase = await createClient();

~~~

## Salida final de `pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint src/lib/plan && pnpm --filter @cet/web exec vitest run src/lib/plan/consultas`

~~~

> @cet/web@0.1.0 typecheck D:\.cet-worktrees\rev-2-calendario-por-curso\apps\web
> tsc --noEmit


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/rev-2-calendario-por-curso/apps/web[39m

 [32m✓[39m src/lib/plan/consultas.test.ts [2m([22m[2m14 tests[22m[2m)[22m[90m 4[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m14 passed[39m[22m[90m (14)[39m
[2m   Start at [22m 16:44:28
[2m   Duration [22m 497ms[2m (transform 45ms, setup 174ms, collect 45ms, tests 4ms, environment 0ms, prepare 76ms)[22m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.