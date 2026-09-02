# Resultado - plan-11-pantalla
- Contrato: `contracts/plan-11-pantalla.md`
- Modelo: deepseek-reasoner
- Desenlace: **verde**
- Rondas consumidas: 2 de 5
- Rama: `deepseek/plan-11-pantalla`
- Duracion: 613.3 s
## Diff

~~~diff
diff --git a/apps/web/src/app/(tutor)/tutor/hijos/[id]/plan/page.tsx b/apps/web/src/app/(tutor)/tutor/hijos/[id]/plan/page.tsx
new file mode 100644
index 0000000..caad7c3
--- /dev/null
+++ b/apps/web/src/app/(tutor)/tutor/hijos/[id]/plan/page.tsx
@@ -0,0 +1,50 @@
+/**
+ * /tutor/hijos/[id]/plan — la pestaña «Su plan» del área de un hijo.
+ * © 2026 Roberto Mendizabal. Todos los derechos reservados.
+ *
+ * `alcanceDeHijo()` devuelve null si el id no es de un hijo del tutor, y esta
+ * página responde 404 antes de leer nada. Las lecturas viven aquí, en el
+ * servidor; `PlanDeEstudio` solo escribe a través de las cuatro acciones.
+ */
+import type { Metadata } from "next";
+import { notFound } from "next/navigation";
+
+import { PlanDeEstudio } from "@/components/tutor/PlanDeEstudio";
+import { getServerDictionary } from "@/lib/i18n/server";
+import { boletinesDeHijo, planActivoDeHijo } from "@/lib/plan/consultas";
+import { alcanceDeHijo } from "@/lib/tutor/queries";
+
+interface PageProps {
+  readonly params: Promise<{ id: string }>;
+}
+
+/** «Leo Mendizabal García» -> «Leo». */
+function nombreDePila(nombre: string): string {
+  return nombre.trim().split(/\s+/)[0] ?? nombre;
+}
+
+export async function generateMetadata(): Promise<Metadata> {
+  const { t } = await getServerDictionary();
+  return { title: t.tutor.child.plan.cardTitle };
+}
+
+export default async function PlanDeHijoPage({ params }: PageProps) {
+  const { id } = await params;
+
+  const hijo = await alcanceDeHijo(id);
+  if (hijo === null) notFound();
+
+  const [boletines, plan] = await Promise.all([
+    boletinesDeHijo(hijo.id),
+    planActivoDeHijo(hijo.id),
+  ]);
+
+  return (
+    <PlanDeEstudio
+      studentId={hijo.id}
+      boletin={boletines[0] ?? null}
+      plan={plan}
+      nombre={nombreDePila(hijo.nombre)}
+    />
+  );
+}
diff --git a/apps/web/src/components/tutor/PlanDeEstudio.test.tsx b/apps/web/src/components/tutor/PlanDeEstudio.test.tsx
new file mode 100644
index 0000000..82e0f99
--- /dev/null
+++ b/apps/web/src/components/tutor/PlanDeEstudio.test.tsx
@@ -0,0 +1,105 @@
+// @vitest-environment jsdom
+import type { ComponentProps } from "react";
+import { cleanup, render, screen } from "@testing-library/react";
+import type { BoletinResumen, PlanResumen } from "@/lib/plan/consultas";
+import { afterEach, describe, expect, it, vi } from "vitest";
+
+import { PlanDeEstudio } from "./PlanDeEstudio";
+
+vi.mock("@/lib/plan/acciones", () => ({
+  confirmarBoletin: vi.fn(),
+  fijarPlan: vi.fn(),
+  proponerPlan: vi.fn(),
+  subirBoletin: vi.fn(),
+}));
+
+vi.mock("@/lib/i18n/provider", async () => {
+  const { en } = await import("@/lib/i18n/dictionaries/en");
+  return {
+    useI18n: () => {
+      const fmt = (plantilla: string, valores: Record<string, string | number>): string =>
+        plantilla.replace(/\{(\w+)\}/g, (_, clave: string) => String(valores[clave] ?? ""));
+      return { t: en, fmt, locale: "en" };
+    },
+  };
+});
+
+const boletinExtraido: BoletinResumen = {
+  id: "b-extraido",
+  gestion: 2026,
+  trimestre: 1,
+  estado: "extraido",
+  notas: [
+    { materia: "Mathematics", code: "math", subject_id: "s-math", nota: 85, banda: "well_done" },
+    { materia: "Art", code: null, subject_id: null, nota: 90, banda: "outstanding" },
+  ],
+  createdAt: "2026-09-01T00:00:00.000Z",
+  confirmadoAt: null,
+};
+
+const boletinConfirmado: BoletinResumen = {
+  ...boletinExtraido,
+  id: "b-confirmado",
+  estado: "confirmado",
+  confirmadoAt: "2026-09-02T00:00:00.000Z",
+};
+
+const planConTecho: PlanResumen = {
+  id: "p-activo",
+  boletinId: boletinConfirmado.id,
+  desde: "2026-09-03",
+  hasta: "2026-10-01",
+  minutosPorDia: 45,
+  reparto: {
+    pesos: { math: 0.5 },
+    techos: [
+      {
+        subjectId: "s-math",
+        code: "math",
+        minutosPedidos: 900,
+        minutosDisponibles: 450,
+      },
+    ],
+  },
+  recomendaciones: ["Keep a steady pace."],
+  createdAt: "2026-09-03T00:00:00.000Z",
+  tareas: 20,
+  partes: [],
+};
+
+function renderizar(props: Partial<ComponentProps<typeof PlanDeEstudio>> = {}) {
+  return render(
+    <PlanDeEstudio studentId="student-1" boletin={null} plan={null} nombre="Leo" {...props} />,
+  );
+}
+
+afterEach(cleanup);
+
+describe("PlanDeEstudio", () => {
+  it("sin boletín muestra el aviso y el formulario de subida", () => {
+    renderizar();
+    expect(screen.getByText(/Start by uploading the report card/)).toBeTruthy();
+    expect(screen.getByRole("button", { name: /Read the report card/ })).toBeTruthy();
+  });
+
+  it("con boletín extraído edita las notas y permite confirmarlas", () => {
+    renderizar({ boletin: boletinExtraido });
+    const input0 = screen.getByDisplayValue("85");
+    const input1 = screen.getByDisplayValue("90");
+    expect(input0.getAttribute("name")).toBe("nota:0");
+    expect(input1.getAttribute("name")).toBe("nota:1");
+    expect(screen.getAllByText(/Not planned/)).toHaveLength(1);
+    expect(screen.getByRole("button", { name: /Confirm the grades/ })).toBeTruthy();
+  });
+
+  it("con boletín confirmado no edita notas y ofrece proponer un plan", () => {
+    renderizar({ boletin: boletinConfirmado });
+    expect(screen.queryByRole("spinbutton")).toBeNull();
+    expect(screen.getByRole("button", { name: /Propose a plan/ })).toBeTruthy();
+  });
+
+  it("con plan activo muestra los techos de contenido", () => {
+    renderizar({ boletin: boletinConfirmado, plan: planConTecho });
+    expect(screen.getByText("Where the content runs out")).toBeTruthy();
+  });
+});
diff --git a/apps/web/src/components/tutor/PlanDeEstudio.tsx b/apps/web/src/components/tutor/PlanDeEstudio.tsx
new file mode 100644
index 0000000..1d1effc
--- /dev/null
+++ b/apps/web/src/components/tutor/PlanDeEstudio.tsx
@@ -0,0 +1,440 @@
+"use client";
+
+import { useActionState, useRef } from "react";
+
+import { useI18n } from "@/lib/i18n/provider";
+import {
+  confirmarBoletin,
+  fijarPlan,
+  proponerPlan,
+  subirBoletin,
+} from "@/lib/plan/acciones";
+import type { BoletinResumen, PlanResumen } from "@/lib/plan/consultas";
+
+type TechoVisible = {
+  readonly subjectId: string;
+  readonly code: string;
+  readonly minutosPedidos: number;
+  readonly minutosDisponibles: number;
+};
+
+type Valores = Record<string, string | number>;
+type AccionDeEscritura = "subir" | "confirmar" | "proponer" | "fijar";
+
+interface Props {
+  readonly studentId: string;
+  readonly boletin: BoletinResumen | null;
+  readonly plan: PlanResumen | null;
+  readonly nombre: string;
+}
+
+const ESTADO_INICIAL = { ok: false } as const;
+
+function textoDe(valores: Valores | undefined, clave: string): string | null {
+  const valor = valores?.[clave];
+  return typeof valor === "string" ? valor : null;
+}
+
+function numeroDe(valores: Valores | undefined, clave: string): number | null {
+  const valor = valores?.[clave];
+  return typeof valor === "number" ? valor : null;
+}
+
+function parsearPesos(valores: Valores | undefined): Record<string, number> {
+  const crudo = textoDe(valores, "pesos");
+  if (crudo === null) return {};
+  try {
+    const resultado = JSON.parse(crudo) as Partial<Record<string, number>> | null;
+    if (resultado === null) return {};
+    return Object.fromEntries(
+      Object.entries(resultado).filter(([, v]) => typeof v === "number"),
+    ) as Record<string, number>;
+  } catch {
+    return {};
+  }
+}
+
+function parsearRecomendaciones(valores: Valores | undefined): string[] {
+  const crudo = textoDe(valores, "recomendaciones");
+  if (crudo === null) return [];
+  try {
+    const resultado: unknown = JSON.parse(crudo);
+    return Array.isArray(resultado)
+      ? resultado.filter((x): x is string => typeof x === "string")
+      : [];
+  } catch {
+    return [];
+  }
+}
+
+function parsearTechos(valores: Valores | undefined): TechoVisible[] {
+  const crudo = textoDe(valores, "techos");
+  if (crudo === null) return [];
+  try {
+    const resultado: unknown = JSON.parse(crudo);
+    return Array.isArray(resultado) ? (resultado as TechoVisible[]) : [];
+  } catch {
+    return [];
+  }
+}
+
+function fechaLegible(iso: string, locale: string): string {
+  const fecha = new Date(iso);
+  if (Number.isNaN(fecha.getTime())) return iso;
+  return fecha.toLocaleDateString(locale === "es" ? "es-ES" : "en-GB");
+}
+
+export function PlanDeEstudio({ studentId, boletin, plan }: Props) {
+  const { t, fmt, locale } = useI18n();
+  const P = t.tutor.child.plan;
+
+  const [subida, accionSubir, subiendo] = useActionState(subirBoletin, ESTADO_INICIAL);
+  const [confirmacion, accionConfirmar, confirmando] = useActionState(
+    confirmarBoletin,
+    ESTADO_INICIAL,
+  );
+  const [propuesta, accionProponer, proponiendo] = useActionState(proponerPlan, ESTADO_INICIAL);
+  const [fijacion, accionFijar, fijando] = useActionState(fijarPlan, ESTADO_INICIAL);
+
+  const ultimaAccion = useRef<AccionDeEscritura | null>(null);
+  const marcar = (accion: AccionDeEscritura) => () => {
+    ultimaAccion.current = accion;
+  };
+
+  const errorKey =
+    ultimaAccion.current === "subir"
+      ? subida.errorKey
+      : ultimaAccion.current === "confirmar"
+        ? confirmacion.errorKey
+        : ultimaAccion.current === "proponer"
+          ? propuesta.errorKey
+          : ultimaAccion.current === "fijar"
+            ? fijacion.errorKey
+            : (subida.errorKey ?? confirmacion.errorKey ?? propuesta.errorKey ?? fijacion.errorKey);
+
+  const mensaje =
+    errorKey === undefined
+      ? null
+      : (t.tutor.errors[errorKey as keyof typeof t.tutor.errors] ?? t.tutor.errors.generic);
+
+  const valoresPropuesta = propuesta.ok ? propuesta.values : undefined;
+  const hayPropuesta = valoresPropuesta !== undefined;
+  const pesosPropuesta = parsearPesos(valoresPropuesta);
+  const recomendacionesPropuesta = parsearRecomendaciones(valoresPropuesta);
+  const minutosPropuesta = numeroDe(valoresPropuesta, "minutosPorDia") ?? 10;
+  const desdePropuesta = textoDe(valoresPropuesta, "desde") ?? "";
+  const hastaPropuesta = textoDe(valoresPropuesta, "hasta") ?? "";
+  const hitoPropuesta = textoDe(valoresPropuesta, "hito") ?? "";
+
+  const techosFijados = parsearTechos(fijacion.ok ? fijacion.values : undefined);
+  const tareasFijadas = numeroDe(fijacion.ok ? fijacion.values : undefined, "tareas");
+  const hayPlan = plan !== null || fijacion.ok;
+  const techosVisibles: readonly TechoVisible[] =
+    plan !== null ? plan.reparto.techos : techosFijados;
+
+  const nombrePorCode = new Map<string, string>();
+  const notas = boletin?.notas ?? [];
+  if (boletin !== null) {
+    for (const nota of boletin.notas) {
+      if (nota.code !== null) nombrePorCode.set(nota.code, nota.materia);
+    }
+  }
+
+  const fechaConfirmado =
+    boletin !== null && boletin.estado === "confirmado" && boletin.confirmadoAt !== null
+      ? new Date(boletin.confirmadoAt).toLocaleDateString(locale === "es" ? "es-ES" : "en-GB")
+      : null;
+
+  const tablaDeNotas = (
+    <div className="overflow-x-auto">
+      <table className="w-full border-collapse text-sm">
+        <thead>
+          <tr className="border-b border-line text-left text-muted">
+            <th scope="col" className="px-4 py-3 font-semibold">{P.colSubject}</th>
+            <th scope="col" className="px-4 py-3 text-right font-semibold">{P.colGrade}</th>
+            <th scope="col" className="px-4 py-3 text-right font-semibold">{P.colBand}</th>
+          </tr>
+        </thead>
+        <tbody>
+          {notas.map((nota, indice) => (
+            <tr key={`${nota.materia}-${indice}`} className="border-b border-line last:border-0">
+              <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
+                {nota.materia}
+                {nota.code === null ? (
+                  <p className="mt-1 text-[13px] text-muted">{P.notPlanned}</p>
+                ) : null}
+              </th>
+              <td className="px-4 py-3 text-right">
+                {boletin?.estado === "extraido" ? (
+                  <input
+                    type="number"
+                    min={0}
+                    max={100}
+                    name={`nota:${indice}`}
+                    defaultValue={nota.nota}
+                    className="w-20 rounded-lg border-2 border-line bg-bg px-2 py-1 text-right text-ink"
+                  />
+                ) : (
+                  <span className="font-semibold text-ink">{nota.nota}</span>
+                )}
+              </td>
+              <td className="px-4 py-3 font-medium text-ink">{P.bands[nota.banda]}</td>
+            </tr>
+          ))}
+        </tbody>
+      </table>
+    </div>
+  );
+
+  const formularioDeSubida = (
+    <form action={accionSubir} onSubmit={marcar("subir")} className="mt-4 space-y-3">
+      <label htmlFor="plan-archivo" className="block font-semibold text-ink">
+        {P.uploadLabel}
+      </label>
+      <input
+        id="plan-archivo"
+        type="file"
+        accept="application/pdf"
+        name="archivo"
+        className="block w-full text-sm text-ink"
+      />
+      <input type="hidden" name="studentId" value={studentId} />
+      <button
+        type="submit"
+        disabled={subiendo}
+        className="rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-60"
+      >
+        {subiendo ? P.uploading : P.uploadButton}
+      </button>
+      <p className="text-[15px] text-muted">{P.uploadHelp}</p>
+    </form>
+  );
+
+  return (
+    <div className="space-y-6">
+      <section className="rounded-2xl border-2 border-line bg-card p-5">
+        <h2 className="text-lg font-bold text-ink">{P.uploadTitle}</h2>
+        <p className="mt-2 text-muted">{P.intro}</p>
+        {boletin === null ? formularioDeSubida : null}
+      </section>
+
+      {boletin !== null ? (
+        <section className="rounded-2xl border-2 border-line bg-card p-5">
+          <h2 className="text-lg font-bold text-ink">{P.extractedTitle}</h2>
+          <p className="mt-2 text-muted">
+            {boletin.trimestre === null
+              ? fmt(P.termUnknown, { year: boletin.gestion })
+              : fmt(P.term, { n: boletin.trimestre, year: boletin.gestion })}
+          </p>
+          {boletin.estado === "extraido" ? (
+            <form action={accionConfirmar} onSubmit={marcar("confirmar")} className="mt-4 space-y-3">
+              <input type="hidden" name="studentId" value={studentId} />
+              <input type="hidden" name="boletinId" value={boletin.id} />
+              {tablaDeNotas}
+              <button
+                type="submit"
+                disabled={confirmando}
+                className="rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-60"
+              >
+                {confirmando ? P.confirming : P.confirmButton}
+              </button>
+              <p className="text-[15px] text-muted">{P.extractedHelp}</p>
+            </form>
+          ) : (
+            <div className="mt-4 space-y-3">
+              {tablaDeNotas}
+              {fechaConfirmado !== null ? (
+                <p className="text-[15px] text-muted">
+                  {fmt(P.confirmed, { date: fechaConfirmado })}
+                </p>
+              ) : null}
+            </div>
+          )}
+          {formularioDeSubida}
+        </section>
+      ) : null}
+
+      {boletin !== null && boletin.estado === "confirmado" ? (
+        <section className="rounded-2xl border-2 border-line bg-card p-5">
+          <h2 className="text-lg font-bold text-ink">{P.proposalTitle}</h2>
+          {!hayPropuesta ? (
+            <form action={accionProponer} onSubmit={marcar("proponer")} className="mt-4">
+              <input type="hidden" name="studentId" value={studentId} />
+              <input type="hidden" name="boletinId" value={boletin.id} />
+              <button
+                type="submit"
+                disabled={proponiendo}
+                className="rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-60"
+              >
+                {proponiendo ? P.proposing : P.proposeButton}
+              </button>
+            </form>
+          ) : (
+            <form action={accionFijar} onSubmit={marcar("fijar")} className="mt-4 space-y-4">
+              <input type="hidden" name="studentId" value={studentId} />
+              <input type="hidden" name="boletinId" value={boletin.id} />
+              <input type="hidden" name="pesos" value={textoDe(valoresPropuesta, "pesos") ?? ""} />
+              <input
+                type="hidden"
+                name="recomendaciones"
+                value={textoDe(valoresPropuesta, "recomendaciones") ?? ""}
+              />
+              <input type="hidden" name="modelo" value={textoDe(valoresPropuesta, "modelo") ?? ""} />
+              <input type="hidden" name="tokensIn" value={numeroDe(valoresPropuesta, "tokensIn") ?? 0} />
+              <input
+                type="hidden"
+                name="tokensOut"
+                value={numeroDe(valoresPropuesta, "tokensOut") ?? 0}
+              />
+              <input type="hidden" name="desde" value={desdePropuesta} />
+              <input type="hidden" name="hasta" value={hastaPropuesta} />
+              <p className="text-[15px] text-ink">
+                {fmt(P.windowLine, {
+                  from: fechaLegible(desdePropuesta, locale),
+                  to: fechaLegible(hastaPropuesta, locale),
+                  milestone: hitoPropuesta,
+                })}
+              </p>
+              <div>
+                <label htmlFor="plan-minutos" className="block font-semibold text-ink">
+                  {P.minutesLabel}
+                </label>
+                <input
+                  id="plan-minutos"
+                  type="number"
+                  name="minutosPorDia"
+                  min={10}
+                  max={180}
+                  defaultValue={minutosPropuesta}
+                  className="w-32 rounded-lg border-2 border-line bg-bg px-3 py-2 text-ink"
+                />
+                <p className="mt-1 text-[15px] text-muted">{P.minutesHelp}</p>
+              </div>
+              <div>
+                <h3 className="font-semibold text-ink">{P.weightsTitle}</h3>
+                <ul className="mt-1 list-inside list-disc text-[15px] text-ink">
+                  {Object.entries(pesosPropuesta).map(([code, peso]) => {
+                    const nombre = nombrePorCode.get(code) ?? code;
+                    return <li key={code}>{nombre} → {Math.round(peso * 100)}%</li>;
+                  })}
+                </ul>
+              </div>
+              {recomendacionesPropuesta.length > 0 ? (
+                <div>
+                  <h3 className="font-semibold text-ink">{P.recommendationsTitle}</h3>
+                  <p className="text-[15px] text-muted">{P.recommendationsNote}</p>
+                  <ul className="mt-1 list-inside list-disc text-[15px] text-ink">
+                    {recomendacionesPropuesta.map((recomendacion, indice) => (
+                      <li key={`${indice}-${recomendacion}`}>{recomendacion}</li>
+                    ))}
+                  </ul>
+                </div>
+              ) : null}
+              {plan !== null ? (
+                <p className="rounded-lg bg-bg px-4 py-3 text-[15px] text-ink">{P.replaceWarning}</p>
+              ) : null}
+              <button
+                type="submit"
+                disabled={fijando}
+                className="rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-60"
+              >
+                {fijando ? P.creating : P.createButton}
+              </button>
+            </form>
+          )}
+        </section>
+      ) : null}
+
+      {hayPlan ? (
+        <section className="rounded-2xl border-2 border-line bg-card p-5">
+          <h2 className="text-lg font-bold text-ink">{P.activeTitle}</h2>
+          {plan !== null ? (
+            <>
+              <p className="mt-2 text-[15px] text-ink">
+                {fmt(P.activeRange, {
+                  from: fechaLegible(plan.desde, locale),
+                  to: fechaLegible(plan.hasta, locale),
+                })}
+              </p>
+              <p className="mt-1 text-[15px] text-ink">
+                {fmt(P.activeMinutes, { count: plan.minutosPorDia })}
+              </p>
+              <p className="mt-1 text-[15px] text-ink">
+                {fmt(P.activeTasks, { count: plan.tareas })}
+              </p>
+            </>
+          ) : tareasFijadas !== null ? (
+            <p className="mt-2 text-[15px] text-ink">
+              {fmt(P.activeTasks, { count: tareasFijadas })}
+            </p>
+          ) : null}
+          {techosVisibles.length > 0 ? (
+            <div className="mt-4">
+              <h3 className="font-semibold text-ink">{P.ceilingsTitle}</h3>
+              <ul className="mt-1 space-y-1 text-[15px] text-ink">
+                {techosVisibles.map((techo) => (
+                  <li key={techo.subjectId}>
+                    {fmt(P.ceilingLine, {
+                      subject: techo.code,
+                      available: techo.minutosDisponibles,
+                      requested: techo.minutosPedidos,
+                    })}
+                  </li>
+                ))}
+              </ul>
+            </div>
+          ) : null}
+          {plan !== null && plan.recomendaciones.length > 0 ? (
+            <div className="mt-4">
+              <h3 className="font-semibold text-ink">{P.recommendationsTitle}</h3>
+              <ul className="mt-1 list-inside list-disc text-[15px] text-ink">
+                {plan.recomendaciones.map((recomendacion, indice) => (
+                  <li key={`${indice}-${recomendacion}`}>{recomendacion}</li>
+                ))}
+              </ul>
+            </div>
+          ) : null}
+          <div className="mt-4">
+            <h3 className="font-semibold text-ink">{P.reportsTitle}</h3>
+            {plan !== null && plan.partes.length > 0 ? (
+              <ul className="mt-1 space-y-1 text-[15px] text-ink">
+                {plan.partes.map((parte, indice) => (
+                  <li key={`${parte.fecha}-${indice}`}>
+                    {fmt(P.reportLine, {
+                      date: fechaLegible(parte.fecha, locale),
+                      planned: parte.minutosPrevistos,
+                      studied: parte.minutosMedidos,
+                      items: parte.itemsRespondidos,
+                      correct: parte.aciertos,
+                    })}
+                  </li>
+                ))}
+              </ul>
+            ) : (
+              <p className="mt-1 text-[15px] text-muted">{P.reportsEmpty}</p>
+            )}
+          </div>
+        </section>
+      ) : boletin === null ? (
+        <section className="rounded-2xl border-2 border-line bg-card p-5">
+          <h2 className="text-lg font-bold text-ink">{P.noPlanTitle}</h2>
+          <p className="mt-2 text-muted">{P.noReportCard}</p>
+        </section>
+      ) : (
+        <section className="rounded-2xl border-2 border-line bg-card p-5">
+          <h2 className="text-lg font-bold text-ink">{P.noPlanTitle}</h2>
+          <p className="mt-2 text-muted">{P.noPlanBody}</p>
+        </section>
+      )}
+
+      {mensaje !== null ? (
+        <p
+          role="alert"
+          className="rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-[15px] text-ink"
+        >
+          {mensaje}
+        </p>
+      ) : null}
+    </div>
+  );
+}

~~~

## Salida final de `pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint "src/app/(tutor)/tutor/hijos/[id]/plan" src/components/tutor && pnpm --filter @cet/web exec vitest run src/components/tutor/PlanDeEstudio`

~~~

> @cet/web@0.1.0 typecheck D:\.cet-worktrees\plan-11-pantalla\apps\web
> tsc --noEmit


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/plan-11-pantalla/apps/web[39m

 [32m✓[39m src/components/tutor/PlanDeEstudio.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[90m 63[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m4 passed[39m[22m[90m (4)[39m
[2m   Start at [22m 13:50:53
[2m   Duration [22m 844ms[2m (transform 55ms, setup 146ms, collect 50ms, tests 63ms, environment 301ms, prepare 68ms)[22m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.