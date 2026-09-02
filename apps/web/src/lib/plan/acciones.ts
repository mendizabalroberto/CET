"use server";

/**
 * Las cuatro acciones del tutor sobre el plan de estudio (§7–§8).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * La forma es la de `lib/tutor/actions.ts`: rol en el servidor, Zod sobre el
 * FormData, pertenencia explicita contra `guardian_students` y escritura con
 * la sesion donde la RLS alcanza. Storage, actualizaciones y `plan_tareas`
 * escalan a `service_role` solo despues de comprobar que el hijo es suyo.
 *
 * Ningun `console.*` recibe el texto del PDF, el prompt ni la respuesta del
 * modelo: son datos de un menor.
 */

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { repartir } from "@cet/engine";
import { PdfSinTextoError, pdfToSpans } from "@cet/content/pdf";

import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { rutasDeHijo } from "@/lib/tutor/rutas";

import { hitoMasCercano, leerNotasCorregidas, leerPesos } from "./acciones.puras";
import { ExtraccionInvalidaError, promptDeExtraccion, validarExtraccion } from "./boletin";
import {
  armarEntradaReparto,
  armarInventarioEstratega,
  boletinesDeHijo,
  calendarioDelPlan,
  inventarioDeContenido,
  leccionesCompletadas,
  masteryDeAlumno,
  minutosObservados,
  type BoletinResumen,
  type NotaGuardada,
} from "./consultas";
import { DeepSeekError, llamarDeepSeek, type RespuestaDeepSeek } from "./deepseek";
import {
  PropuestaInvalidaError,
  promptDeEstratega,
  validarPropuesta,
  type EntradaEstratega,
} from "./estratega";
import { hoyEnZona } from "./fecha";
import type { BoletinExtraido, Propuesta } from "./tipos";

export interface PlanState {
  readonly ok: boolean;
  readonly errorKey?: string;
  readonly successKey?: string;
  readonly values?: Record<string, string | number>;
}

function fail(errorKey: string, values?: Record<string, string | number>): PlanState {
  return values === undefined ? { ok: false, errorKey } : { ok: false, errorKey, values };
}

function done(successKey: string, values?: Record<string, string | number>): PlanState {
  return values === undefined ? { ok: true, successKey } : { ok: true, successKey, values };
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const TAMANO_LOTE_TAREAS = 200;

type Fila = Record<string, unknown>;

function esFila(value: unknown): value is Fila {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function columnaTexto(fila: Fila | null, columna: string): string | null {
  const v = fila?.[columna];
  return typeof v === "string" ? v : null;
}

function esArchivoPdf(valor: FormDataEntryValue | null): valor is File {
  if (typeof valor !== "object" || valor === null) return false;
  const archivo = valor as { type?: unknown; size?: unknown; arrayBuffer?: unknown };
  return (
    archivo.type === "application/pdf" &&
    typeof archivo.size === "number" &&
    archivo.size > 0 &&
    archivo.size <= MAX_PDF_BYTES &&
    typeof archivo.arrayBuffer === "function"
  );
}

function esErrorDeStorageDuplicado(error: { message?: unknown; statusCode?: unknown }): boolean {
  const mensaje = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return (
    mensaje.includes("already exists") ||
    mensaje.includes("duplicate") ||
    error.statusCode === 409 ||
    error.statusCode === "409"
  );
}

async function esHijoSuyo(
  supabase: SupabaseClient,
  guardianId: string,
  studentId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("guardian_students")
    .select("student_id")
    .eq("guardian_id", guardianId)
    .eq("student_id", studentId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error !== null) {
    console.error("[cet] esHijoSuyo", error.code, error.message);
    return false;
  }
  return data !== null;
}

async function boletinDeHijo(studentId: string, boletinId: string): Promise<BoletinResumen | null> {
  const boletines = await boletinesDeHijo(studentId);
  return boletines.find((boletin) => boletin.id === boletinId) ?? null;
}

function leerUuid(fd: FormData, campo: string): string | null {
  const valor = fd.get(campo);
  const parse = z.string().uuid().safeParse(valor);
  return parse.success ? parse.data : null;
}

const schemaDeFijarPlan = z.object({
  studentId: z.string().uuid(),
  boletinId: z.string().uuid(),
  minutosPorDia: z.number().int().min(10).max(180),
  pesos: z.string().min(1),
  recomendaciones: z.string().min(1),
  modelo: z.string().min(1),
  tokensIn: z.number().int().min(0),
  tokensOut: z.number().int().min(0),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const schemaDeRecomendaciones = z.array(z.string().trim().min(1).max(400)).max(6);

export async function subirBoletin(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  const studentId = leerUuid(fd, "studentId");
  if (studentId === null) return fail("notFound");

  const archivo = fd.get("archivo");
  if (!esArchivoPdf(archivo)) return fail("planPdfInvalido");

  const supabase = await createClient();
  if (!(await esHijoSuyo(supabase, tutor.id, studentId))) return fail("notFound");

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient(
    "Subir el boletin a Storage y resolver codigos de materia del catalogo global",
  );
  const ruta = `${studentId}/${checksum}.pdf`;
  const { error: subidaError } = await admin.storage.from("boletines").upload(ruta, buffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (subidaError !== null && !esErrorDeStorageDuplicado(subidaError)) {
    console.error("[cet] subirBoletin storage.upload", subidaError.message);
    return fail("generic");
  }

  let texto: string;
  try {
    const { spans } = await pdfToSpans(buffer);
    texto = spans.map((span) => span.text).join("\n");
  } catch (causa) {
    if (causa instanceof PdfSinTextoError) return fail("planPdfSinTexto");
    console.error(
      "[cet] subirBoletin pdfToSpans",
      causa instanceof Error ? causa.message : String(causa),
    );
    return fail("generic");
  }

  let respuesta: RespuestaDeepSeek;
  try {
    respuesta = await llamarDeepSeek(promptDeExtraccion(texto));
  } catch (causa) {
    if (causa instanceof DeepSeekError) {
      console.error("[cet] subirBoletin deepseek", causa.motivo, causa.message);
      return fail("planModeloCaido");
    }
    console.error(
      "[cet] subirBoletin deepseek",
      causa instanceof Error ? causa.message : String(causa),
    );
    return fail("generic");
  }

  let extraido: BoletinExtraido;
  try {
    extraido = validarExtraccion(texto, respuesta.json);
  } catch (causa) {
    if (causa instanceof ExtraccionInvalidaError) return fail("planExtraccionInvalida");
    console.error(
      "[cet] subirBoletin validarExtraccion",
      causa instanceof Error ? causa.message : String(causa),
    );
    return fail("generic");
  }

  const codigos = [
    ...new Set(extraido.notas.flatMap((nota) => (nota.code === null ? [] : [nota.code]))),
  ];

  const subjectIdPorCode = new Map<string, string>();
  if (codigos.length > 0) {
    const { data: materias, error: materiasError } = await admin
      .from("subjects")
      .select("id, code")
      .is("school_id", null)
      .in("code", codigos);
    if (materiasError !== null || materias === null) {
      console.error(
        "[cet] subirBoletin subjects.select",
        materiasError?.code,
        materiasError?.message,
      );
      return fail("generic");
    }
    for (const bruta of materias) {
      if (!esFila(bruta)) continue;
      const id = columnaTexto(bruta, "id");
      const code = columnaTexto(bruta, "code");
      if (id !== null && code !== null) subjectIdPorCode.set(code, id);
    }
    if (codigos.some((code) => !subjectIdPorCode.has(code))) return fail("generic");
  }

  const notas: NotaGuardada[] = extraido.notas.map((nota) => ({
    materia: nota.materia,
    code: nota.code,
    subject_id: nota.code === null ? null : (subjectIdPorCode.get(nota.code) ?? null),
    nota: nota.nota,
    banda: nota.banda,
  }));

  const { data: perfil, error: perfilError } = await supabase
    .from("profiles")
    .select("school_id")
    .eq("id", studentId)
    .maybeSingle();
  if (perfilError !== null) {
    console.error("[cet] subirBoletin profiles.select", perfilError.code, perfilError.message);
    return fail("generic");
  }
  const schoolId = columnaTexto(perfil as Fila | null, "school_id");

  const { data: insertado, error: insertError } = await supabase
    .from("boletines")
    .insert({
      student_id: studentId,
      school_id: schoolId,
      // La politica de insert exige subido_por = auth.uid(); sin esta linea el
      // insert cae por not null antes de llegar a la RLS.
      subido_por: tutor.id,
      storage_path: ruta,
      checksum,
      gestion: extraido.gestion,
      trimestre: extraido.trimestre,
      notas,
      estado: "extraido",
      modelo: respuesta.modelo,
      tokens_in: respuesta.tokensIn,
      tokens_out: respuesta.tokensOut,
    })
    .select("id")
    .single();

  if (insertError !== null) {
    if (insertError.code === "23505") return fail("planBoletinRepetido");
    console.error("[cet] subirBoletin boletines.insert", insertError.code, insertError.message);
    return fail("generic");
  }
  const boletinId = columnaTexto(insertado as Fila | null, "id");
  if (boletinId === null) return fail("generic");

  revalidatePath(rutasDeHijo(studentId).plan);
  return done("planBoletinExtraido", { boletinId });
}

export async function confirmarBoletin(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  const studentId = leerUuid(fd, "studentId");
  const boletinId = leerUuid(fd, "boletinId");
  if (studentId === null || boletinId === null) return fail("notFound");

  const supabase = await createClient();
  if (!(await esHijoSuyo(supabase, tutor.id, studentId))) return fail("notFound");

  const boletin = await boletinDeHijo(studentId, boletinId);
  if (boletin === null) return fail("notFound");

  const notasCorregidas = leerNotasCorregidas(fd, boletin.notas);
  if (notasCorregidas === null) return fail("planNotaInvalida");

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient(
    "Confirmar boletin: el tutor no puede actualizar boletines con su sesion",
  );
  const { error: updateError } = await admin
    .from("boletines")
    .update({
      notas: notasCorregidas,
      estado: "confirmado",
      confirmado_at: new Date().toISOString(),
    })
    .eq("id", boletinId)
    .eq("student_id", studentId);

  if (updateError !== null) {
    console.error("[cet] confirmarBoletin boletines.update", updateError.code, updateError.message);
    return fail("generic");
  }

  revalidatePath(rutasDeHijo(studentId).plan);
  return done("planBoletinConfirmado");
}

export async function proponerPlan(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  const studentId = leerUuid(fd, "studentId");
  const boletinId = leerUuid(fd, "boletinId");
  if (studentId === null || boletinId === null) return fail("notFound");

  const supabase = await createClient();
  if (!(await esHijoSuyo(supabase, tutor.id, studentId))) return fail("notFound");

  const boletin = await boletinDeHijo(studentId, boletinId);
  if (boletin === null) return fail("notFound");
  if (boletin.estado !== "confirmado") return fail("planSinConfirmar");
  if (!boletin.notas.some((nota) => nota.code !== null)) return fail("planSinContenido");

  const [perfilRes, inventario, completadas, minutos] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", studentId).maybeSingle(),
    inventarioDeContenido(),
    leccionesCompletadas(studentId),
    minutosObservados(studentId),
  ]);
  if (perfilRes.error !== null) {
    console.error(
      "[cet] proponerPlan profiles.select",
      perfilRes.error.code,
      perfilRes.error.message,
    );
    return fail("generic");
  }
  const fullName = columnaTexto(perfilRes.data as Fila | null, "full_name") ?? "";
  const nombreDePila = fullName.trim().split(/\s+/)[0] ?? "";

  const hoy = hoyEnZona();
  const calendario = await calendarioDelPlan(Number(hoy.slice(0, 4)));
  const ventana = hitoMasCercano(calendario, hoy);

  const entrada: EntradaEstratega = {
    nombreDePila,
    notas: boletin.notas.map((nota) => ({
      materia: nota.materia,
      code: nota.code,
      nota: nota.nota,
      banda: nota.banda,
    })),
    inventario: armarInventarioEstratega(inventario, completadas),
    ventana: {
      desde: hoy,
      hasta: ventana.hasta,
      hito: ventana.hito,
    },
    minutosPorDiaObservados: minutos,
  };

  let respuesta: RespuestaDeepSeek;
  try {
    respuesta = await llamarDeepSeek(promptDeEstratega(entrada));
  } catch (causa) {
    if (causa instanceof DeepSeekError) {
      console.error("[cet] proponerPlan deepseek", causa.motivo, causa.message);
      return fail("planModeloCaido");
    }
    console.error(
      "[cet] proponerPlan deepseek",
      causa instanceof Error ? causa.message : String(causa),
    );
    return fail("generic");
  }

  let propuesta: Propuesta;
  try {
    propuesta = validarPropuesta(respuesta.json);
  } catch (causa) {
    if (causa instanceof PropuestaInvalidaError) return fail("planModeloCaido");
    console.error(
      "[cet] proponerPlan validarPropuesta",
      causa instanceof Error ? causa.message : String(causa),
    );
    return fail("generic");
  }

  return done("planPropuesto", {
    minutosPorDia: propuesta.minutosPorDia,
    pesos: JSON.stringify(propuesta.reparto),
    recomendaciones: JSON.stringify(propuesta.recomendaciones),
    modelo: respuesta.modelo,
    tokensIn: respuesta.tokensIn,
    tokensOut: respuesta.tokensOut,
    desde: hoy,
    hasta: ventana.hasta,
    hito: ventana.hito,
  });
}

export async function fijarPlan(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  const parsed = schemaDeFijarPlan.safeParse({
    studentId: fd.get("studentId"),
    boletinId: fd.get("boletinId"),
    minutosPorDia: Number(fd.get("minutosPorDia") ?? ""),
    pesos: fd.get("pesos"),
    recomendaciones: fd.get("recomendaciones"),
    modelo: fd.get("modelo"),
    tokensIn: Number(fd.get("tokensIn") ?? ""),
    tokensOut: Number(fd.get("tokensOut") ?? ""),
    desde: fd.get("desde"),
    hasta: fd.get("hasta"),
  });
  if (!parsed.success) {
    const campo = parsed.error.issues[0]?.path[0];
    if (campo === "studentId" || campo === "boletinId") return fail("notFound");
    return fail("generic");
  }
  const datos = parsed.data;

  const supabase = await createClient();
  if (!(await esHijoSuyo(supabase, tutor.id, datos.studentId))) return fail("notFound");

  const boletin = await boletinDeHijo(datos.studentId, datos.boletinId);
  if (boletin === null) return fail("notFound");
  if (boletin.estado !== "confirmado") return fail("planSinConfirmar");

  const pesos = leerPesos(datos.pesos);
  if (pesos === null) return fail("generic");

  let recomendaciones: string[];
  try {
    const crudo = JSON.parse(datos.recomendaciones) as unknown;
    const parse = schemaDeRecomendaciones.safeParse(crudo);
    if (!parse.success) return fail("generic");
    recomendaciones = parse.data;
  } catch {
    return fail("generic");
  }

  if (datos.desde > datos.hasta) return fail("generic");

  const [inventario, completadas, mastery, calendario] = await Promise.all([
    inventarioDeContenido(),
    leccionesCompletadas(datos.studentId),
    masteryDeAlumno(datos.studentId),
    calendarioDelPlan(Number(datos.desde.slice(0, 4))),
  ]);

  const entradaReparto = armarEntradaReparto({
    desde: datos.desde,
    hasta: datos.hasta,
    minutosPorDia: datos.minutosPorDia,
    pesos,
    inventario,
    completadas,
    mastery,
    calendario,
  });
  const reparto = repartir(entradaReparto);
  if (reparto.tareas.length === 0) return fail("planSinContenido");

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient(
    "Fijar plan: desactivar el anterior y crear plan y tareas; la RLS del tutor no cubre esas escrituras",
  );

  const { error: desactivarError } = await admin
    .from("planes_de_estudio")
    .update({ activo: false })
    .eq("student_id", datos.studentId)
    .eq("activo", true);
  if (desactivarError !== null) {
    console.error(
      "[cet] fijarPlan planes_de_estudio.update",
      desactivarError.code,
      desactivarError.message,
    );
    return fail("generic");
  }

  const { data: planFila, error: planError } = await admin
    .from("planes_de_estudio")
    .insert({
      student_id: datos.studentId,
      boletin_id: datos.boletinId,
      desde: datos.desde,
      hasta: datos.hasta,
      minutos_por_dia: datos.minutosPorDia,
      reparto: { pesos, techos: reparto.techos },
      recomendaciones,
      creado_por: tutor.id,
      modelo: datos.modelo,
      tokens_in: datos.tokensIn,
      tokens_out: datos.tokensOut,
      activo: true,
    })
    .select("id")
    .single();

  if (planError !== null) {
    console.error("[cet] fijarPlan planes_de_estudio.insert", planError.code, planError.message);
    return fail("generic");
  }
  const planId = columnaTexto(planFila as Fila | null, "id");
  if (planId === null) return fail("generic");

  for (let inicio = 0; inicio < reparto.tareas.length; inicio += TAMANO_LOTE_TAREAS) {
    const lote = reparto.tareas.slice(inicio, inicio + TAMANO_LOTE_TAREAS).map((tarea) => ({
      plan_id: planId,
      student_id: datos.studentId,
      fecha: tarea.fecha,
      ord: tarea.ord,
      subject_id: tarea.subjectId,
      tipo: tarea.tipo,
      lesson_id: tarea.lessonId,
      skill_id: tarea.skillId,
      minutos: tarea.minutos,
    }));

    const { error: tareasError } = await admin.from("plan_tareas").insert(lote);
    if (tareasError !== null) {
      console.error("[cet] fijarPlan plan_tareas.insert", tareasError.code, tareasError.message);
      const { error: rollbackError } = await admin
        .from("planes_de_estudio")
        .delete()
        .eq("id", planId);
      if (rollbackError !== null) {
        console.error("[cet] fijarPlan rollback", rollbackError.code, rollbackError.message);
      }
      return fail("generic");
    }
  }

  revalidatePath(rutasDeHijo(datos.studentId).plan);
  return done("planCreado", {
    planId,
    tareas: reparto.tareas.length,
    techos: JSON.stringify(reparto.techos),
  });
}
