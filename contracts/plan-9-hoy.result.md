# Resultado - plan-9-hoy
- Contrato: `contracts/plan-9-hoy.md`
- Modelo: deepseek-reasoner
- Desenlace: **verde**
- Rondas consumidas: 3 de 4
- Rama: `deepseek/plan-9-hoy`
- Duracion: 493.7 s
## Diff

~~~diff
diff --git a/apps/web/src/app/(student)/learn/hoy/consulta.ts b/apps/web/src/app/(student)/learn/hoy/consulta.ts
new file mode 100644
index 0000000..fd41a1d
--- /dev/null
+++ b/apps/web/src/app/(student)/learn/hoy/consulta.ts
@@ -0,0 +1,70 @@
+import type { I18nText } from "@cet/shared";
+
+import { getSessionProfile } from "@/lib/auth/session";
+import { hoyEnZona } from "@/lib/plan/fecha";
+import { createClient } from "@/lib/supabase/server";
+
+/**
+ * Lectura de las tareas de hoy del plan de estudio.
+ * © 2026 Roberto Mendizabal. Todos los derechos reservados.
+ *
+ * El alumno no puede leer `planes_de_estudio`; para saber si tiene plan se
+ * mira si existe alguna `plan_tareas` suya, de cualquier fecha. Las dos
+ * consultas son independientes y se lanzan en paralelo. Ningún fallo de base
+ * de datos puede propagarse: la función devuelve `{ estado: "error" }`.
+ */
+
+export interface FilaTarea {
+  readonly id: string;
+  readonly fecha: string;
+  readonly ord: number;
+  readonly tipo: "leccion" | "practica";
+  readonly minutos: number | null;
+  readonly lesson_id: string | null;
+  readonly subjects: ReadonlyArray<{ readonly code: string; readonly name: I18nText }> | null;
+  readonly lessons: ReadonlyArray<{ readonly title: I18nText }> | null;
+  readonly skills: ReadonlyArray<{ readonly code: string; readonly name: I18nText }> | null;
+}
+
+export type TareasDeHoyResultado =
+  | { readonly estado: "ok"; readonly hayPlan: boolean; readonly filas: FilaTarea[] }
+  | { readonly estado: "error" };
+
+export async function tareasDeHoy(): Promise<TareasDeHoyResultado> {
+  try {
+    const perfil = await getSessionProfile();
+    if (perfil === null || perfil.role !== "student") {
+      return { estado: "error" };
+    }
+
+    const supabase = await createClient();
+    const hoy = hoyEnZona();
+
+    const [tareas, plan] = await Promise.all([
+      supabase
+        .from("plan_tareas")
+        .select(
+          "id, fecha, ord, tipo, minutos, lesson_id, subjects(code, name), lessons(title), skills(code, name)",
+        )
+        .eq("student_id", perfil.id)
+        .eq("fecha", hoy)
+        .order("ord", { ascending: true }),
+      supabase
+        .from("plan_tareas")
+        .select("id", { count: "exact", head: true })
+        .eq("student_id", perfil.id),
+    ]);
+
+    if (tareas.error !== null || plan.error !== null) {
+      return { estado: "error" };
+    }
+
+    return {
+      estado: "ok",
+      hayPlan: (plan.count ?? 0) > 0,
+      filas: (tareas.data ?? []) as FilaTarea[],
+    };
+  } catch {
+    return { estado: "error" };
+  }
+}
diff --git a/apps/web/src/app/(student)/learn/hoy/page.tsx b/apps/web/src/app/(student)/learn/hoy/page.tsx
new file mode 100644
index 0000000..8cc8ac2
--- /dev/null
+++ b/apps/web/src/app/(student)/learn/hoy/page.tsx
@@ -0,0 +1,99 @@
+import { EmptyState, ErrorState, SubjectIcon } from "@cet/ui";
+import Link from "next/link";
+
+import { getLearnDictionary, learnI18n } from "@/components/learn/dictionary";
+import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
+import { requireStudent } from "@/lib/auth/session";
+import { resolveLocale } from "@/lib/i18n/server";
+import { ROUTES } from "@/lib/routes";
+
+import { tareasDeHoy } from "./consulta";
+import { presentarTareas } from "./presentar";
+
+/**
+ * /learn/hoy — lo que le toca al alumno hoy según su plan de estudio.
+ * © 2026 Roberto Mendizabal. Todos los derechos reservados.
+ *
+ * Server Component puro, como /learn: ni un byte de JavaScript propio. El niño
+ * ve sus tareas de hoy y nada más: sin brecha, sin tendencia, sin atraso.
+ *
+ * Tres estados, y ninguno es una lista vacía: sin plan, día libre, o error.
+ */
+
+export default async function HoyPage() {
+  const student = await requireStudent();
+  const locale = await resolveLocale(student.locale);
+  const hoy = getLearnDictionary(locale).today;
+
+  const resultado = await tareasDeHoy();
+  const tareas = resultado.estado === "ok" ? presentarTareas(resultado.filas, locale) : [];
+
+  return (
+    <UiLocaleProvider locale={locale}>
+      <div className="flex flex-col gap-8">
+        <header>
+          <h1 className="text-2xl font-bold text-ink">{hoy.title}</h1>
+          <p className="mt-2 max-w-prose text-muted">{hoy.subtitle}</p>
+        </header>
+
+        {resultado.estado === "error" ? (
+          <ErrorState
+            title={learnI18n((d) => d.today.errorTitle)}
+            body={learnI18n((d) => d.today.errorBody)}
+          />
+        ) : !resultado.hayPlan ? (
+          <EmptyState
+            title={learnI18n((d) => d.today.noPlanTitle)}
+            body={learnI18n((d) => d.today.noPlanBody)}
+          />
+        ) : tareas.length === 0 ? (
+          <EmptyState
+            title={learnI18n((d) => d.today.freeDayTitle)}
+            body={learnI18n((d) => d.today.freeDayBody)}
+          />
+        ) : (
+          <section>
+            <ol className="flex flex-col gap-3">
+              {tareas.map((tarea, indice) => {
+                const total = tareas.length;
+                const minutosLabel =
+                  tarea.minutos === null
+                    ? null
+                    : hoy.minutes.replace("{count}", String(tarea.minutos));
+                const taskOfLabel = hoy.taskOf
+                  .replace("{n}", String(indice + 1))
+                  .replace("{total}", String(total));
+
+                return (
+                  <li key={tarea.id}>
+                    <Link
+                      href={tarea.href}
+                      className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 no-underline focus-visible:outline-2 focus-visible:outline-offset-2"
+                    >
+                      <SubjectIcon code={tarea.subjectCode} />
+                      <span className="min-w-0 flex-1">
+                        <span className="block font-semibold text-ink">{tarea.titulo}</span>
+                        <span className="mt-0.5 flex flex-wrap gap-x-1 text-sm text-muted">
+                          <span>{tarea.tipo === "leccion" ? hoy.lesson : hoy.practice}</span>
+                          {minutosLabel !== null ? <span>{minutosLabel}</span> : null}
+                          <span>{taskOfLabel}</span>
+                        </span>
+                      </span>
+                    </Link>
+                  </li>
+                );
+              })}
+            </ol>
+          </section>
+        )}
+
+        <Link
+          href={ROUTES.studentHome}
+          className="inline-flex w-fit items-center rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-card focus-visible:outline-2 focus-visible:outline-offset-2"
+        >
+          {hoy.backToLessons}
+        </Link>
+      </div>
+    </UiLocaleProvider>
+  );
+}
diff --git a/apps/web/src/app/(student)/learn/hoy/presentar.test.ts b/apps/web/src/app/(student)/learn/hoy/presentar.test.ts
new file mode 100644
index 0000000..3cdf184
--- /dev/null
+++ b/apps/web/src/app/(student)/learn/hoy/presentar.test.ts
@@ -0,0 +1,57 @@
+import { describe, expect, it } from "vitest";
+
+import { presentarTareas } from "./presentar";
+
+const filaLeccion = {
+  id: "tarea-leccion",
+  fecha: "2026-09-03",
+  ord: 2,
+  tipo: "leccion",
+  minutos: 25,
+  lesson_id: "lesson-101",
+  subjects: [{ code: "math", name: { en: "Math", es: "Matemáticas" } }],
+  lessons: [{ title: { en: "Adding and subtracting", es: "Sumas y restas" } }],
+  skills: [],
+};
+
+const filaPractica = {
+  id: "tarea-practica",
+  fecha: "2026-09-03",
+  ord: 1,
+  tipo: "practica",
+  minutos: 15,
+  skills: [{ code: "simplify", name: { en: "Simplifying", es: "Simplificar" } }],
+  subjects: [{ code: "math", name: { en: "Math", es: "Matemáticas" } }],
+  lessons: [],
+};
+
+describe("presentarTareas", () => {
+  it("presenta una lección y una práctica con sus destinos y títulos en español", () => {
+    const tarjetas = presentarTareas([filaLeccion, filaPractica], "es");
+
+    expect(tarjetas).toHaveLength(2);
+
+    const leccion = tarjetas.find((tarea) => tarea.tipo === "leccion");
+    const practica = tarjetas.find((tarea) => tarea.tipo === "practica");
+
+    expect(leccion?.href).toBe("/learn/lesson-101");
+    expect(leccion?.titulo).toBe("Sumas y restas");
+    expect(practica?.href).toBe("/practice/simplify");
+    expect(practica?.titulo).toBe("Simplificar");
+  });
+
+  it("descarta una fila sin subjects", () => {
+    const tarjetas = presentarTareas(
+      [{ ...filaLeccion, id: "tarea-sin-subject", subjects: [] }],
+      "es",
+    );
+
+    expect(tarjetas).toHaveLength(0);
+  });
+
+  it("respeta el orden de ord", () => {
+    const tarjetas = presentarTareas([filaLeccion, filaPractica], "es");
+
+    expect(tarjetas.map((tarea) => tarea.ord)).toEqual([1, 2]);
+  });
+});
diff --git a/apps/web/src/app/(student)/learn/hoy/presentar.ts b/apps/web/src/app/(student)/learn/hoy/presentar.ts
new file mode 100644
index 0000000..af7b901
--- /dev/null
+++ b/apps/web/src/app/(student)/learn/hoy/presentar.ts
@@ -0,0 +1,103 @@
+import { resolveI18n, type I18nText, type Locale } from "@cet/shared";
+
+/**
+ * De filas de `plan_tareas` a tarjetas de hoy.
+ * © 2026 Roberto Mendizabal. Todos los derechos reservados.
+ *
+ * Función pura: recibe filas desconocidas, valida y descarta las que no se
+ * pueden presentar, resuelve los nombres al idioma y construye el destino.
+ * El orden de `ord` se respeta: la salida queda ordenada como el plan.
+ */
+
+export interface TareaDeHoy {
+  readonly id: string;
+  readonly ord: number;
+  readonly subjectCode: string;
+  readonly href: string;
+  readonly tipo: "leccion" | "practica";
+  readonly minutos: number | null;
+  readonly titulo: string;
+}
+
+function esRegistro(valor: unknown): valor is Record<string, unknown> {
+  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
+}
+
+function esTexto(valor: unknown): valor is string {
+  return typeof valor === "string" && valor.length > 0;
+}
+
+function esI18n(valor: unknown): valor is I18nText {
+  if (!esRegistro(valor)) return false;
+  return esTexto(valor.en) && esTexto(valor.es);
+}
+
+function relacionUnica(valor: unknown): Record<string, unknown> | null {
+  if (Array.isArray(valor)) {
+    if (valor.length !== 1) return null;
+    const [unica] = valor;
+    return esRegistro(unica) ? unica : null;
+  }
+  return esRegistro(valor) ? valor : null;
+}
+
+function aTarea(fila: unknown, locale: Locale): TareaDeHoy | null {
+  if (!esRegistro(fila)) return null;
+
+  const { id, ord, tipo, minutos, subjects, lessons, skills } = fila;
+  if (!esTexto(id)) return null;
+  if (typeof ord !== "number" || !Number.isFinite(ord)) return null;
+  if (tipo !== "leccion" && tipo !== "practica") return null;
+
+  const materia = relacionUnica(subjects);
+  if (materia === null) return null;
+  const { code: subjectCode } = materia;
+  if (!esTexto(subjectCode)) return null;
+
+  let duracion: number | null = null;
+  if (minutos !== null && minutos !== undefined) {
+    if (typeof minutos !== "number" || !Number.isFinite(minutos)) return null;
+    duracion = minutos;
+  }
+
+  if (tipo === "leccion") {
+    const { lesson_id } = fila;
+    const leccion = relacionUnica(lessons);
+    if (!esTexto(lesson_id) || leccion === null) return null;
+    const { title } = leccion;
+    if (!esI18n(title)) return null;
+    return {
+      id,
+      ord,
+      tipo,
+      minutos: duracion,
+      subjectCode,
+      href: `/learn/${lesson_id}`,
+      titulo: resolveI18n(title, locale),
+    };
+  }
+
+  const habilidad = relacionUnica(skills);
+  if (habilidad === null) return null;
+  const { code: skillCode, name: skillName } = habilidad;
+  if (!esTexto(skillCode) || !esI18n(skillName)) return null;
+  return {
+    id,
+    ord,
+    tipo,
+    minutos: duracion,
+    subjectCode,
+    href: `/practice/${skillCode}`,
+    titulo: resolveI18n(skillName, locale),
+  };
+}
+
+export function presentarTareas(filas: readonly unknown[], locale: Locale): TareaDeHoy[] {
+  const tareas: TareaDeHoy[] = [];
+  for (const fila of filas) {
+    const tarea = aTarea(fila, locale);
+    if (tarea !== null) tareas.push(tarea);
+  }
+  tareas.sort((a, b) => a.ord - b.ord);
+  return tareas;
+}

~~~

## Salida final de `pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint "src/app/(student)/learn/hoy" && pnpm --filter @cet/web exec vitest run "src/app/(student)/learn/hoy`

~~~

> @cet/web@0.1.0 typecheck D:\.cet-worktrees\plan-9-hoy\apps\web
> tsc --noEmit


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/plan-9-hoy/apps/web[39m

 [32m✓[39m src/app/(student)/learn/hoy/presentar.test.ts [2m([22m[2m3 tests[22m[2m)[22m[90m 2[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m3 passed[39m[22m[90m (3)[39m
[2m   Start at [22m 13:08:50
[2m   Duration [22m 456ms[2m (transform 50ms, setup 141ms, collect 64ms, tests 2ms, environment 0ms, prepare 65ms)[22m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.