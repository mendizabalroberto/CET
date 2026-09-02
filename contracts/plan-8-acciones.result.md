# Resultado - plan-8-acciones
- Contrato: `contracts/plan-8-acciones.md`
- Modelo: deepseek-reasoner
- Desenlace: **verde**
- Rondas consumidas: 3 de 5
- Rama: `deepseek/plan-8-acciones`
- Duracion: 732.7 s
## Diff

~~~diff
diff --git a/apps/web/src/lib/plan/acciones.puras.ts b/apps/web/src/lib/plan/acciones.puras.ts
new file mode 100644
index 0000000..1a46d61
--- /dev/null
+++ b/apps/web/src/lib/plan/acciones.puras.ts
@@ -0,0 +1,90 @@
+/**
+ * Parte pura de las acciones del plan de estudio.
+ * © 2026 Roberto Mendizabal. Todos los derechos reservados.
+ *
+ * Sin base ni red: las Server Actions de `acciones.ts` las usan y
+ * `acciones.test.ts` las prueba. Viven en un fichero aparte porque
+ * `acciones.ts` es un fichero "use server" y en el solo caben acciones async.
+ */
+import type { EventoCalendario } from "@cet/engine";
+
+import { bandaDeNota } from "./boletin";
+import type { NotaGuardada } from "./consultas";
+import { sumarDias } from "./fecha";
+import { MATERIAS_CON_CONTENIDO, type CodigoMateria } from "./tipos";
+
+const CODIGOS_DE_MATERIA = new Set<string>(MATERIAS_CON_CONTENIDO);
+
+/**
+ * El hito de la ventana: la proxima fecha de `examenes_finales` o de
+ * `hito_cambridge` posterior a `hoy`. Si no hay, la ventana se estira a
+ * `hoy + 70 días`.
+ */
+export function hitoMasCercano(
+  calendario: readonly EventoCalendario[],
+  hoy: string,
+): { hasta: string; hito: string } {
+  const candidatos = calendario
+    .filter(
+      (evento) =>
+        evento.desde > hoy &&
+        (evento.tipo === "examenes_finales" || evento.tipo === "hito_cambridge"),
+    )
+    .sort((a, b) => a.desde.localeCompare(b.desde));
+
+  const elegido = candidatos[0];
+  if (elegido === undefined) return { hasta: sumarDias(hoy, 70), hito: "" };
+  return { hasta: elegido.desde, hito: elegido.tipo };
+}
+
+/**
+ * Rehace las notas del boletin con las correcciones del tutor. Cada fila
+ * llega en el FormData como `nota:<indice>`; si alguna no es un entero
+ * 0..100 devuelve null y la accion no toca la base.
+ */
+export function leerNotasCorregidas(
+  fd: FormData,
+  notasActuales: readonly NotaGuardada[],
+): NotaGuardada[] | null {
+  const corregidas: NotaGuardada[] = [];
+  for (let indice = 0; indice < notasActuales.length; indice += 1) {
+    const actual = notasActuales[indice];
+    if (actual === undefined) return null;
+    const valor = fd.get(`nota:${indice}`);
+    const nota = typeof valor === "string" ? Number(valor) : Number.NaN;
+    if (!Number.isInteger(nota) || nota < 0 || nota > 100) return null;
+    corregidas.push({
+      materia: actual.materia,
+      code: actual.code,
+      subject_id: actual.subject_id,
+      nota,
+      banda: bandaDeNota(nota),
+    });
+  }
+  return corregidas;
+}
+
+/**
+ * Valida el JSON de pesos que manda la UI en `fijarPlan`: solo materias con
+ * contenido publicado, pesos positivos y suma 1 ± 0,01.
+ */
+export function leerPesos(texto: string): Partial<Record<CodigoMateria, number>> | null {
+  let crudo: unknown;
+  try {
+    crudo = JSON.parse(texto) as unknown;
+  } catch {
+    return null;
+  }
+  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) return null;
+
+  const pesos: Partial<Record<CodigoMateria, number>> = {};
+  let suma = 0;
+  for (const [clave, valor] of Object.entries(crudo as Record<string, unknown>)) {
+    if (!CODIGOS_DE_MATERIA.has(clave)) return null;
+    if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) return null;
+    pesos[clave as CodigoMateria] = valor;
+    suma += valor;
+  }
+  if (Math.abs(suma - 1) > 0.01) return null;
+  return pesos;
+}
diff --git a/apps/web/src/lib/plan/acciones.test.ts b/apps/web/src/lib/plan/acciones.test.ts
new file mode 100644
index 0000000..af66e29
--- /dev/null
+++ b/apps/web/src/lib/plan/acciones.test.ts
@@ -0,0 +1,108 @@
+import { describe, expect, it } from "vitest";
+
+import type { EventoCalendario } from "@cet/engine";
+import type { NotaGuardada } from "./consultas";
+import { hitoMasCercano, leerNotasCorregidas, leerPesos } from "./acciones.puras";
+
+describe("hitoMasCercano", () => {
+  it("elige las finales como hito cuando son el siguiente evento del calendario", () => {
+    const calendario: EventoCalendario[] = [
+      { desde: "2026-07-06", hasta: "2026-07-17", tipo: "vacaciones" },
+      { desde: "2026-10-09", hasta: "2026-10-09", tipo: "feriado" },
+      { desde: "2026-11-13", hasta: "2026-11-20", tipo: "examenes_finales" },
+    ];
+
+    expect(hitoMasCercano(calendario, "2026-09-02")).toEqual({
+      hasta: "2026-11-13",
+      hito: "examenes_finales",
+    });
+  });
+
+  it("tambien toma un hito de Cambridge como limite de la ventana", () => {
+    const calendario: EventoCalendario[] = [
+      { desde: "2026-06-01", hasta: "2026-06-30", tipo: "vacaciones" },
+      { desde: "2026-10-02", hasta: "2026-10-02", tipo: "hito_cambridge" },
+      { desde: "2026-11-13", hasta: "2026-11-20", tipo: "examenes_finales" },
+    ];
+
+    expect(hitoMasCercano(calendario, "2026-09-02")).toEqual({
+      hasta: "2026-10-02",
+      hito: "hito_cambridge",
+    });
+  });
+
+  it("sin hito a la vista, estira la ventana a hoy + 70 dias", () => {
+    expect(hitoMasCercano([], "2026-09-02")).toEqual({
+      hasta: "2026-11-11",
+      hito: "",
+    });
+  });
+});
+
+describe("leerNotasCorregidas", () => {
+  const actuales: NotaGuardada[] = [
+    {
+      materia: "English",
+      code: "english",
+      subject_id: "subject-1",
+      nota: 88,
+      banda: "well_done",
+    },
+    {
+      materia: "Math",
+      code: "math",
+      subject_id: null,
+      nota: 60,
+      banda: "needs_improvement",
+    },
+  ];
+
+  it("recalcula la banda con la nota corregida y conserva materia y subject", () => {
+    const fd = new FormData();
+    fd.set("nota:0", "95");
+    fd.set("nota:1", "75");
+
+    expect(leerNotasCorregidas(fd, actuales)).toEqual([
+      {
+        materia: "English",
+        code: "english",
+        subject_id: "subject-1",
+        nota: 95,
+        banda: "outstanding",
+      },
+      {
+        materia: "Math",
+        code: "math",
+        subject_id: null,
+        nota: 75,
+        banda: "good",
+      },
+    ]);
+  });
+
+  it("devuelve null si alguna nota no es un entero entre 0 y 100", () => {
+    const fd = new FormData();
+    fd.set("nota:0", "95");
+    fd.set("nota:1", "101");
+
+    expect(leerNotasCorregidas(fd, actuales)).toBeNull();
+  });
+});
+
+describe("leerPesos", () => {
+  it("acepta un reparto valido que suma 1", () => {
+    expect(leerPesos('{"math": 0.4, "science": 0.3, "spanish": 0.3}')).toEqual({
+      math: 0.4,
+      science: 0.3,
+      spanish: 0.3,
+    });
+  });
+
+  it("rechaza claves que no son materias", () => {
+    expect(leerPesos('{"art": 1}')).toBeNull();
+  });
+
+  it("rechaza una suma distinta de 1", () => {
+    expect(leerPesos('{"math": 0.6, "science": 0.6}')).toBeNull();
+  });
+});
diff --git a/apps/web/src/lib/plan/acciones.ts b/apps/web/src/lib/plan/acciones.ts
new file mode 100644
index 0000000..16282f0
--- /dev/null
+++ b/apps/web/src/lib/plan/acciones.ts
@@ -0,0 +1,561 @@
+"use server";
+
+/**
+ * Las cuatro acciones del tutor sobre el plan de estudio (§7–§8).
+ * © 2026 Roberto Mendizabal. Todos los derechos reservados.
+ *
+ * La forma es la de `lib/tutor/actions.ts`: rol en el servidor, Zod sobre el
+ * FormData, pertenencia explicita contra `guardian_students` y escritura con
+ * la sesion donde la RLS alcanza. Storage, actualizaciones y `plan_tareas`
+ * escalan a `service_role` solo despues de comprobar que el hijo es suyo.
+ *
+ * Ningun `console.*` recibe el texto del PDF, el prompt ni la respuesta del
+ * modelo: son datos de un menor.
+ */
+
+import { revalidatePath } from "next/cache";
+import { createHash } from "node:crypto";
+import type { SupabaseClient } from "@supabase/supabase-js";
+import { z } from "zod";
+
+import { repartir } from "@cet/engine";
+import { PdfSinTextoError, pdfToSpans } from "@cet/content/pdf";
+
+import { requireRole } from "@/lib/auth/session";
+import { createClient } from "@/lib/supabase/server";
+import { rutasDeHijo } from "@/lib/tutor/rutas";
+
+import { hitoMasCercano, leerNotasCorregidas, leerPesos } from "./acciones.puras";
+import { ExtraccionInvalidaError, promptDeExtraccion, validarExtraccion } from "./boletin";
+import {
+  armarEntradaReparto,
+  armarInventarioEstratega,
+  boletinesDeHijo,
+  calendarioDelPlan,
+  inventarioDeContenido,
+  leccionesCompletadas,
+  masteryDeAlumno,
+  minutosObservados,
+  type BoletinResumen,
+  type NotaGuardada,
+} from "./consultas";
+import { DeepSeekError, llamarDeepSeek, type RespuestaDeepSeek } from "./deepseek";
+import {
+  PropuestaInvalidaError,
+  promptDeEstratega,
+  validarPropuesta,
+  type EntradaEstratega,
+} from "./estratega";
+import { hoyEnZona } from "./fecha";
+import type { BoletinExtraido, Propuesta } from "./tipos";
+
+export interface PlanState {
+  readonly ok: boolean;
+  readonly errorKey?: string;
+  readonly successKey?: string;
+  readonly values?: Record<string, string | number>;
+}
+
+function fail(errorKey: string, values?: Record<string, string | number>): PlanState {
+  return values === undefined ? { ok: false, errorKey } : { ok: false, errorKey, values };
+}
+
+function done(successKey: string, values?: Record<string, string | number>): PlanState {
+  return values === undefined ? { ok: true, successKey } : { ok: true, successKey, values };
+}
+
+const MAX_PDF_BYTES = 10 * 1024 * 1024;
+const TAMANO_LOTE_TAREAS = 200;
+
+type Fila = Record<string, unknown>;
+
+function esFila(value: unknown): value is Fila {
+  return typeof value === "object" && value !== null && !Array.isArray(value);
+}
+
+function columnaTexto(fila: Fila | null, columna: string): string | null {
+  const v = fila?.[columna];
+  return typeof v === "string" ? v : null;
+}
+
+function esArchivoPdf(valor: FormDataEntryValue | null): valor is File {
+  if (typeof valor !== "object" || valor === null) return false;
+  const archivo = valor as { type?: unknown; size?: unknown; arrayBuffer?: unknown };
+  return (
+    archivo.type === "application/pdf" &&
+    typeof archivo.size === "number" &&
+    archivo.size > 0 &&
+    archivo.size <= MAX_PDF_BYTES &&
+    typeof archivo.arrayBuffer === "function"
+  );
+}
+
+function esErrorDeStorageDuplicado(error: { message?: unknown; statusCode?: unknown }): boolean {
+  const mensaje = typeof error.message === "string" ? error.message.toLowerCase() : "";
+  return (
+    mensaje.includes("already exists") ||
+    mensaje.includes("duplicate") ||
+    error.statusCode === 409 ||
+    error.statusCode === "409"
+  );
+}
+
+async function esHijoSuyo(
+  supabase: SupabaseClient,
+  guardianId: string,
+  studentId: string,
+): Promise<boolean> {
+  const { data, error } = await supabase
+    .from("guardian_students")
+    .select("student_id")
+    .eq("guardian_id", guardianId)
+    .eq("student_id", studentId)
+    .is("revoked_at", null)
+    .maybeSingle();
+
+  if (error !== null) {
+    console.error("[cet] esHijoSuyo", error.code, error.message);
+    return false;
+  }
+  return data !== null;
+}
+
+async function boletinDeHijo(studentId: string, boletinId: string): Promise<BoletinResumen | null> {
+  const boletines = await boletinesDeHijo(studentId);
+  return boletines.find((boletin) => boletin.id === boletinId) ?? null;
+}
+
+function leerUuid(fd: FormData, campo: string): string | null {
+  const valor = fd.get(campo);
+  const parse = z.string().uuid().safeParse(valor);
+  return parse.success ? parse.data : null;
+}
+
+const schemaDeFijarPlan = z.object({
+  studentId: z.string().uuid(),
+  boletinId: z.string().uuid(),
+  minutosPorDia: z.number().int().min(10).max(180),
+  pesos: z.string().min(1),
+  recomendaciones: z.string().min(1),
+  modelo: z.string().min(1),
+  tokensIn: z.number().int().min(0),
+  tokensOut: z.number().int().min(0),
+  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
+  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
+});
+
+const schemaDeRecomendaciones = z.array(z.string().trim().min(1).max(400)).max(6);
+
+export async function subirBoletin(_prev: PlanState, fd: FormData): Promise<PlanState> {
+  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });
+
+  const studentId = leerUuid(fd, "studentId");
+  if (studentId === null) return fail("notFound");
+
+  const archivo = fd.get("archivo");
+  if (!esArchivoPdf(archivo)) return fail("planPdfInvalido");
+
+  const supabase = await createClient();
+  if (!(await esHijoSuyo(supabase, tutor.id, studentId))) return fail("notFound");
+
+  const buffer = Buffer.from(await archivo.arrayBuffer());
+  const checksum = createHash("sha256").update(buffer).digest("hex");
+
+  const { createAdminClient } = await import("@/lib/supabase/admin");
+  const admin = createAdminClient(
+    "Subir el boletin a Storage y resolver codigos de materia del catalogo global",
+  );
+  const ruta = `${studentId}/${checksum}.pdf`;
+  const { error: subidaError } = await admin.storage.from("boletines").upload(ruta, buffer, {
+    contentType: "application/pdf",
+    upsert: false,
+  });
+  if (subidaError !== null && !esErrorDeStorageDuplicado(subidaError)) {
+    console.error("[cet] subirBoletin storage.upload", subidaError.message);
+    return fail("generic");
+  }
+
+  let texto: string;
+  try {
+    const { spans } = await pdfToSpans(buffer);
+    texto = spans.map((span) => span.text).join("\n");
+  } catch (causa) {
+    if (causa instanceof PdfSinTextoError) return fail("planPdfSinTexto");
+    console.error(
+      "[cet] subirBoletin pdfToSpans",
+      causa instanceof Error ? causa.message : String(causa),
+    );
+    return fail("generic");
+  }
+
+  let respuesta: RespuestaDeepSeek;
+  try {
+    respuesta = await llamarDeepSeek(promptDeExtraccion(texto));
+  } catch (causa) {
+    if (causa instanceof DeepSeekError) {
+      console.error("[cet] subirBoletin deepseek", causa.motivo, causa.message);
+      return fail("planModeloCaido");
+    }
+    console.error(
+      "[cet] subirBoletin deepseek",
+      causa instanceof Error ? causa.message : String(causa),
+    );
+    return fail("generic");
+  }
+
+  let extraido: BoletinExtraido;
+  try {
+    extraido = validarExtraccion(texto, respuesta.json);
+  } catch (causa) {
+    if (causa instanceof ExtraccionInvalidaError) return fail("planExtraccionInvalida");
+    console.error(
+      "[cet] subirBoletin validarExtraccion",
+      causa instanceof Error ? causa.message : String(causa),
+    );
+    return fail("generic");
+  }
+
+  const codigos = [
+    ...new Set(extraido.notas.flatMap((nota) => (nota.code === null ? [] : [nota.code]))),
+  ];
+
+  const subjectIdPorCode = new Map<string, string>();
+  if (codigos.length > 0) {
+    const { data: materias, error: materiasError } = await admin
+      .from("subjects")
+      .select("id, code")
+      .is("school_id", null)
+      .in("code", codigos);
+    if (materiasError !== null || materias === null) {
+      console.error(
+        "[cet] subirBoletin subjects.select",
+        materiasError?.code,
+        materiasError?.message,
+      );
+      return fail("generic");
+    }
+    for (const bruta of materias) {
+      if (!esFila(bruta)) continue;
+      const id = columnaTexto(bruta, "id");
+      const code = columnaTexto(bruta, "code");
+      if (id !== null && code !== null) subjectIdPorCode.set(code, id);
+    }
+    if (codigos.some((code) => !subjectIdPorCode.has(code))) return fail("generic");
+  }
+
+  const notas: NotaGuardada[] = extraido.notas.map((nota) => ({
+    materia: nota.materia,
+    code: nota.code,
+    subject_id: nota.code === null ? null : (subjectIdPorCode.get(nota.code) ?? null),
+    nota: nota.nota,
+    banda: nota.banda,
+  }));
+
+  const { data: perfil, error: perfilError } = await supabase
+    .from("profiles")
+    .select("school_id")
+    .eq("id", studentId)
+    .maybeSingle();
+  if (perfilError !== null) {
+    console.error("[cet] subirBoletin profiles.select", perfilError.code, perfilError.message);
+    return fail("generic");
+  }
+  const schoolId = columnaTexto(perfil as Fila | null, "school_id");
+
+  const { data: insertado, error: insertError } = await supabase
+    .from("boletines")
+    .insert({
+      student_id: studentId,
+      school_id: schoolId,
+      checksum,
+      gestion: extraido.gestion,
+      trimestre: extraido.trimestre,
+      notas,
+      estado: "extraido",
+      modelo: respuesta.modelo,
+      tokens_in: respuesta.tokensIn,
+      tokens_out: respuesta.tokensOut,
+    })
+    .select("id")
+    .single();
+
+  if (insertError !== null) {
+    if (insertError.code === "23505") return fail("planBoletinRepetido");
+    console.error("[cet] subirBoletin boletines.insert", insertError.code, insertError.message);
+    return fail("generic");
+  }
+  const boletinId = columnaTexto(insertado as Fila | null, "id");
+  if (boletinId === null) return fail("generic");
+
+  revalidatePath(rutasDeHijo(studentId).plan);
+  return done("planBoletinExtraido", { boletinId });
+}
+
+export async function confirmarBoletin(_prev: PlanState, fd: FormData): Promise<PlanState> {
+  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });
+
+  const studentId = leerUuid(fd, "studentId");
+  const boletinId = leerUuid(fd, "boletinId");
+  if (studentId === null || boletinId === null) return fail("notFound");
+
+  const supabase = await createClient();
+  if (!(await esHijoSuyo(supabase, tutor.id, studentId))) return fail("notFound");
+
+  const boletin = await boletinDeHijo(studentId, boletinId);
+  if (boletin === null) return fail("notFound");
+
+  const notasCorregidas = leerNotasCorregidas(fd, boletin.notas);
+  if (notasCorregidas === null) return fail("planNotaInvalida");
+
+  const { createAdminClient } = await import("@/lib/supabase/admin");
+  const admin = createAdminClient(
+    "Confirmar boletin: el tutor no puede actualizar boletines con su sesion",
+  );
+  const { error: updateError } = await admin
+    .from("boletines")
+    .update({
+      notas: notasCorregidas,
+      estado: "confirmado",
+      confirmado_at: new Date().toISOString(),
+    })
+    .eq("id", boletinId)
+    .eq("student_id", studentId);
+
+  if (updateError !== null) {
+    console.error("[cet] confirmarBoletin boletines.update", updateError.code, updateError.message);
+    return fail("generic");
+  }
+
+  revalidatePath(rutasDeHijo(studentId).plan);
+  return done("planBoletinConfirmado");
+}
+
+export async function proponerPlan(_prev: PlanState, fd: FormData): Promise<PlanState> {
+  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });
+
+  const studentId = leerUuid(fd, "studentId");
+  const boletinId = leerUuid(fd, "boletinId");
+  if (studentId === null || boletinId === null) return fail("notFound");
+
+  const supabase = await createClient();
+  if (!(await esHijoSuyo(supabase, tutor.id, studentId))) return fail("notFound");
+
+  const boletin = await boletinDeHijo(studentId, boletinId);
+  if (boletin === null) return fail("notFound");
+  if (boletin.estado !== "confirmado") return fail("planSinConfirmar");
+  if (!boletin.notas.some((nota) => nota.code !== null)) return fail("planSinContenido");
+
+  const [perfilRes, inventario, completadas, minutos] = await Promise.all([
+    supabase.from("profiles").select("full_name").eq("id", studentId).maybeSingle(),
+    inventarioDeContenido(),
+    leccionesCompletadas(studentId),
+    minutosObservados(studentId),
+  ]);
+  if (perfilRes.error !== null) {
+    console.error("[cet] proponerPlan profiles.select", perfilRes.error.code, perfilRes.error.message);
+    return fail("generic");
+  }
+  const fullName = columnaTexto(perfilRes.data as Fila | null, "full_name") ?? "";
+  const nombreDePila = fullName.trim().split(/\s+/)[0] ?? "";
+
+  const hoy = hoyEnZona();
+  const calendario = await calendarioDelPlan(Number(hoy.slice(0, 4)));
+  const ventana = hitoMasCercano(calendario, hoy);
+
+  const entrada: EntradaEstratega = {
+    nombreDePila,
+    notas: boletin.notas.map((nota) => ({
+      materia: nota.materia,
+      code: nota.code,
+      nota: nota.nota,
+      banda: nota.banda,
+    })),
+    inventario: armarInventarioEstratega(inventario, completadas),
+    ventana: {
+      desde: hoy,
+      hasta: ventana.hasta,
+      hito: ventana.hito,
+    },
+    minutosPorDiaObservados: minutos,
+  };
+
+  let respuesta: RespuestaDeepSeek;
+  try {
+    respuesta = await llamarDeepSeek(promptDeEstratega(entrada));
+  } catch (causa) {
+    if (causa instanceof DeepSeekError) {
+      console.error("[cet] proponerPlan deepseek", causa.motivo, causa.message);
+      return fail("planModeloCaido");
+    }
+    console.error(
+      "[cet] proponerPlan deepseek",
+      causa instanceof Error ? causa.message : String(causa),
+    );
+    return fail("generic");
+  }
+
+  let propuesta: Propuesta;
+  try {
+    propuesta = validarPropuesta(respuesta.json);
+  } catch (causa) {
+    if (causa instanceof PropuestaInvalidaError) return fail("planModeloCaido");
+    console.error(
+      "[cet] proponerPlan validarPropuesta",
+      causa instanceof Error ? causa.message : String(causa),
+    );
+    return fail("generic");
+  }
+
+  return done("planPropuesto", {
+    minutosPorDia: propuesta.minutosPorDia,
+    pesos: JSON.stringify(propuesta.reparto),
+    recomendaciones: JSON.stringify(propuesta.recomendaciones),
+    modelo: respuesta.modelo,
+    tokensIn: respuesta.tokensIn,
+    tokensOut: respuesta.tokensOut,
+    desde: hoy,
+    hasta: ventana.hasta,
+    hito: ventana.hito,
+  });
+}
+
+export async function fijarPlan(_prev: PlanState, fd: FormData): Promise<PlanState> {
+  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });
+
+  const parsed = schemaDeFijarPlan.safeParse({
+    studentId: fd.get("studentId"),
+    boletinId: fd.get("boletinId"),
+    minutosPorDia: Number(fd.get("minutosPorDia") ?? ""),
+    pesos: fd.get("pesos"),
+    recomendaciones: fd.get("recomendaciones"),
+    modelo: fd.get("modelo"),
+    tokensIn: Number(fd.get("tokensIn") ?? ""),
+    tokensOut: Number(fd.get("tokensOut") ?? ""),
+    desde: fd.get("desde"),
+    hasta: fd.get("hasta"),
+  });
+  if (!parsed.success) {
+    const campo = parsed.error.issues[0]?.path[0];
+    if (campo === "studentId" || campo === "boletinId") return fail("notFound");
+    return fail("generic");
+  }
+  const datos = parsed.data;
+
+  const supabase = await createClient();
+  if (!(await esHijoSuyo(supabase, tutor.id, datos.studentId))) return fail("notFound");
+
+  const boletin = await boletinDeHijo(datos.studentId, datos.boletinId);
+  if (boletin === null) return fail("notFound");
+  if (boletin.estado !== "confirmado") return fail("planSinConfirmar");
+
+  const pesos = leerPesos(datos.pesos);
+  if (pesos === null) return fail("generic");
+
+  let recomendaciones: string[];
+  try {
+    const crudo = JSON.parse(datos.recomendaciones) as unknown;
+    const parse = schemaDeRecomendaciones.safeParse(crudo);
+    if (!parse.success) return fail("generic");
+    recomendaciones = parse.data;
+  } catch {
+    return fail("generic");
+  }
+
+  if (datos.desde > datos.hasta) return fail("generic");
+
+  const [inventario, completadas, mastery, calendario] = await Promise.all([
+    inventarioDeContenido(),
+    leccionesCompletadas(datos.studentId),
+    masteryDeAlumno(datos.studentId),
+    calendarioDelPlan(Number(datos.desde.slice(0, 4))),
+  ]);
+
+  const entradaReparto = armarEntradaReparto({
+    desde: datos.desde,
+    hasta: datos.hasta,
+    minutosPorDia: datos.minutosPorDia,
+    pesos,
+    inventario,
+    completadas,
+    mastery,
+    calendario,
+  });
+  const reparto = repartir(entradaReparto);
+  if (reparto.tareas.length === 0) return fail("planSinContenido");
+
+  const { createAdminClient } = await import("@/lib/supabase/admin");
+  const admin = createAdminClient(
+    "Fijar plan: desactivar el anterior y crear plan y tareas; la RLS del tutor no cubre esas escrituras",
+  );
+
+  const { error: desactivarError } = await admin
+    .from("planes_de_estudio")
+    .update({ activo: false })
+    .eq("student_id", datos.studentId)
+    .eq("activo", true);
+  if (desactivarError !== null) {
+    console.error(
+      "[cet] fijarPlan planes_de_estudio.update",
+      desactivarError.code,
+      desactivarError.message,
+    );
+    return fail("generic");
+  }
+
+  const { data: planFila, error: planError } = await admin
+    .from("planes_de_estudio")
+    .insert({
+      student_id: datos.studentId,
+      boletin_id: datos.boletinId,
+      desde: datos.desde,
+      hasta: datos.hasta,
+      minutos_por_dia: datos.minutosPorDia,
+      reparto: { pesos, techos: reparto.techos },
+      recomendaciones,
+      creado_por: tutor.id,
+      modelo: datos.modelo,
+      tokens_in: datos.tokensIn,
+      tokens_out: datos.tokensOut,
+      activo: true,
+    })
+    .select("id")
+    .single();
+
+  if (planError !== null) {
+    console.error("[cet] fijarPlan planes_de_estudio.insert", planError.code, planError.message);
+    return fail("generic");
+  }
+  const planId = columnaTexto(planFila as Fila | null, "id");
+  if (planId === null) return fail("generic");
+
+  for (let inicio = 0; inicio < reparto.tareas.length; inicio += TAMANO_LOTE_TAREAS) {
+    const lote = reparto.tareas.slice(inicio, inicio + TAMANO_LOTE_TAREAS).map((tarea) => ({
+      plan_id: planId,
+      student_id: datos.studentId,
+      fecha: tarea.fecha,
+      ord: tarea.ord,
+      subject_id: tarea.subjectId,
+      tipo: tarea.tipo,
+      lesson_id: tarea.lessonId,
+      skill_id: tarea.skillId,
+      minutos: tarea.minutos,
+    }));
+
+    const { error: tareasError } = await admin.from("plan_tareas").insert(lote);
+    if (tareasError !== null) {
+      console.error("[cet] fijarPlan plan_tareas.insert", tareasError.code, tareasError.message);
+      const { error: rollbackError } = await admin.from("planes_de_estudio").delete().eq("id", planId);
+      if (rollbackError !== null) {
+        console.error("[cet] fijarPlan rollback", rollbackError.code, rollbackError.message);
+      }
+      return fail("generic");
+    }
+  }
+
+  revalidatePath(rutasDeHijo(datos.studentId).plan);
+  return done("planCreado", {
+    planId,
+    tareas: reparto.tareas.length,
+    techos: JSON.stringify(reparto.techos),
+  });
+}

~~~

## Salida final de `pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint src/lib/plan && pnpm --filter @cet/web exec vitest run src/lib/plan/acciones`

~~~

> @cet/web@0.1.0 typecheck D:\.cet-worktrees\plan-8-acciones\apps\web
> tsc --noEmit


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/plan-8-acciones/apps/web[39m

 [32m✓[39m src/lib/plan/acciones.test.ts [2m([22m[2m8 tests[22m[2m)[22m[90m 7[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m8 passed[39m[22m[90m (8)[39m
[2m   Start at [22m 13:39:43
[2m   Duration [22m 385ms[2m (transform 33ms, setup 144ms, collect 39ms, tests 7ms, environment 0ms, prepare 61ms)[22m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.