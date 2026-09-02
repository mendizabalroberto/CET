"use server";

/**
 * Los exámenes del alumno: lo que su tutor escribe o sube (0095).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Tres acciones con la forma de `acciones.ts` (rol en el servidor, Zod sobre
 * el FormData, pertenencia contra `guardian_students`) y una consulta. Las
 * filas se escriben y se leen CON LA SESIÓN DEL TUTOR: la RLS de 0095 es la
 * que decide, y `service_role` solo entra para resolver códigos de materia
 * del catálogo global.
 *
 * Ningún `console.*` recibe el texto del PDF ni la respuesta del modelo.
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { PdfSinTextoError, pdfToSpans } from "@cet/content/pdf";

import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { rutasDeHijo } from "@/lib/tutor/rutas";

import type { PlanState } from "./acciones";
import { DeepSeekError, llamarDeepSeek, type RespuestaDeepSeek } from "./deepseek";
import {
  ExtraccionDeExamenesInvalidaError,
  promptDeExtraccionDeExamenes,
  validarExamenes,
} from "./examenes-extraccion";
import { hoyEnZona } from "./fecha";
import { MATERIAS_CON_CONTENIDO, type CodigoMateria } from "./tipos";

export interface ExamenResumen {
  readonly id: string;
  /** `YYYY-MM-DD`. */
  readonly fecha: string;
  readonly subjectId: string | null;
  /** Código de la materia con contenido, o `null` (examen general o materia que la app no cubre). */
  readonly code: CodigoMateria | null;
  readonly titulo: string;
  readonly origen: "tutor" | "documento";
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

type Fila = Record<string, unknown>;

function esFila(value: unknown): value is Fila {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function texto(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function fail(errorKey: string): PlanState {
  return { ok: false, errorKey };
}

function done(successKey: string, values?: Record<string, string | number>): PlanState {
  return values === undefined ? { ok: true, successKey } : { ok: true, successKey, values };
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
    console.error("[cet] examenes esHijoSuyo", error.code, error.message);
    return false;
  }
  return data !== null;
}

function esCodigoMateria(v: unknown): v is CodigoMateria {
  return typeof v === "string" && (MATERIAS_CON_CONTENIDO as readonly string[]).includes(v);
}

/** `subjects.id` ↔ `code` del catálogo global, en las dos direcciones. */
async function catalogoDeMaterias(): Promise<{
  idPorCode: ReadonlyMap<CodigoMateria, string>;
  codePorId: ReadonlyMap<string, CodigoMateria>;
}> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient("Resolver códigos de materia del catálogo global para los exámenes");
  const { data, error } = await admin
    .from("subjects")
    .select("id, code")
    .is("school_id", null)
    .in("code", [...MATERIAS_CON_CONTENIDO]);
  const idPorCode = new Map<CodigoMateria, string>();
  const codePorId = new Map<string, CodigoMateria>();
  if (error !== null) {
    console.error("[cet] examenes subjects.select", error.code, error.message);
    return { idPorCode, codePorId };
  }
  for (const bruta of data ?? []) {
    if (!esFila(bruta)) continue;
    const id = texto(bruta["id"]);
    const code = bruta["code"];
    if (id !== null && esCodigoMateria(code)) {
      idPorCode.set(code, id);
      codePorId.set(id, code);
    }
  }
  return { idPorCode, codePorId };
}

/** Los exámenes del hijo, de hoy en adelante, por fecha. Con la sesión del tutor (RLS). */
export async function examenesDeAlumno(studentId: string): Promise<ExamenResumen[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("examenes_del_alumno")
    .select("id, fecha, subject_id, titulo, origen")
    .eq("student_id", studentId)
    .gte("fecha", hoyEnZona())
    .order("fecha", { ascending: true });
  if (error !== null || data === null) return [];

  const { codePorId } = await catalogoDeMaterias();
  const resultado: ExamenResumen[] = [];
  for (const bruta of data) {
    if (!esFila(bruta)) continue;
    const id = texto(bruta["id"]);
    const fecha = texto(bruta["fecha"]);
    const titulo = texto(bruta["titulo"]);
    const origen = bruta["origen"];
    const subjectId = texto(bruta["subject_id"]);
    if (id === null || fecha === null || titulo === null) continue;
    if (origen !== "tutor" && origen !== "documento") continue;
    resultado.push({
      id,
      fecha: fecha.slice(0, 10),
      subjectId,
      code: subjectId === null ? null : (codePorId.get(subjectId) ?? null),
      titulo,
      origen,
    });
  }
  return resultado;
}

const schemaDeAnadir = z.object({
  studentId: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  materia: z.union([z.literal("general"), z.enum(MATERIAS_CON_CONTENIDO)]),
  titulo: z.string().trim().max(120),
});

export async function anadirExamen(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });
  const parsed = schemaDeAnadir.safeParse({
    studentId: fd.get("studentId"),
    fecha: fd.get("fecha"),
    materia: fd.get("materia") ?? "general",
    titulo: fd.get("titulo") ?? "",
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.path[0] === "studentId" ? "notFound" : "examenInvalido");
  }
  const datos = parsed.data;
  if (datos.fecha < hoyEnZona()) return fail("examenPasado");

  const supabase = await createClient();
  if (!(await esHijoSuyo(supabase, tutor.id, datos.studentId))) return fail("notFound");

  let subjectId: string | null = null;
  if (datos.materia !== "general") {
    const { idPorCode } = await catalogoDeMaterias();
    subjectId = idPorCode.get(datos.materia) ?? null;
    if (subjectId === null) return fail("generic");
  }

  const titulo = datos.titulo === "" ? (datos.materia === "general" ? "Examen" : datos.materia) : datos.titulo;
  const { error } = await supabase.from("examenes_del_alumno").insert({
    student_id: datos.studentId,
    subject_id: subjectId,
    fecha: datos.fecha,
    titulo,
    origen: "tutor",
    creado_por: tutor.id,
  });
  if (error !== null) {
    if (error.code === "23505") return fail("examenRepetido");
    console.error("[cet] anadirExamen insert", error.code, error.message);
    return fail("generic");
  }

  revalidatePath(rutasDeHijo(datos.studentId).plan);
  return done("examenAnadido");
}

const schemaDeBorrar = z.object({
  studentId: z.string().uuid(),
  examenId: z.string().uuid(),
});

export async function borrarExamen(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });
  const parsed = schemaDeBorrar.safeParse({
    studentId: fd.get("studentId"),
    examenId: fd.get("examenId"),
  });
  if (!parsed.success) return fail("notFound");
  const datos = parsed.data;

  const supabase = await createClient();
  if (!(await esHijoSuyo(supabase, tutor.id, datos.studentId))) return fail("notFound");

  const { error } = await supabase
    .from("examenes_del_alumno")
    .delete()
    .eq("id", datos.examenId)
    .eq("student_id", datos.studentId);
  if (error !== null) {
    console.error("[cet] borrarExamen delete", error.code, error.message);
    return fail("generic");
  }

  revalidatePath(rutasDeHijo(datos.studentId).plan);
  return done("examenBorrado");
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

/**
 * Sube el calendario de exámenes del colegio (PDF), lo lee con el modelo y
 * guarda una fila por examen. Las que ya existan (mismo día, materia y
 * título) se saltan: subir el mismo documento dos veces no duplica.
 */
export async function subirCalendarioDeExamenes(
  _prev: PlanState,
  fd: FormData,
): Promise<PlanState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  const studentId = z.string().uuid().safeParse(fd.get("studentId"));
  if (!studentId.success) return fail("notFound");

  const archivo = fd.get("archivo");
  if (!esArchivoPdf(archivo)) return fail("planPdfInvalido");

  const supabase = await createClient();
  if (!(await esHijoSuyo(supabase, tutor.id, studentId.data))) return fail("notFound");

  let textoDelPdf: string;
  try {
    const { spans } = await pdfToSpans(Buffer.from(await archivo.arrayBuffer()));
    textoDelPdf = spans.map((span) => span.text).join("\n");
  } catch (causa) {
    if (causa instanceof PdfSinTextoError) return fail("planPdfSinTexto");
    console.error("[cet] subirCalendarioDeExamenes pdfToSpans", causa instanceof Error ? causa.message : String(causa));
    return fail("generic");
  }

  const hoy = hoyEnZona();
  let respuesta: RespuestaDeepSeek;
  try {
    respuesta = await llamarDeepSeek(promptDeExtraccionDeExamenes(textoDelPdf, Number(hoy.slice(0, 4))));
  } catch (causa) {
    if (causa instanceof DeepSeekError) {
      console.error("[cet] subirCalendarioDeExamenes deepseek", causa.motivo, causa.message);
      return fail("planModeloCaido");
    }
    console.error("[cet] subirCalendarioDeExamenes deepseek", causa instanceof Error ? causa.message : String(causa));
    return fail("generic");
  }

  let examenes;
  try {
    examenes = validarExamenes(textoDelPdf, respuesta.json);
  } catch (causa) {
    if (causa instanceof ExtraccionDeExamenesInvalidaError) return fail("examenesNoLeidos");
    console.error("[cet] subirCalendarioDeExamenes validarExamenes", causa instanceof Error ? causa.message : String(causa));
    return fail("generic");
  }

  const { idPorCode } = await catalogoDeMaterias();
  const filas = examenes
    .filter((examen) => examen.fecha >= hoy)
    .map((examen) => ({
      student_id: studentId.data,
      subject_id: examen.code === null ? null : (idPorCode.get(examen.code) ?? null),
      fecha: examen.fecha,
      titulo: examen.materia,
      origen: "documento" as const,
      creado_por: tutor.id,
    }));
  if (filas.length === 0) return fail("examenesTodosPasados");

  // Una a una: un duplicado (23505) no tumba las demás.
  let anadidos = 0;
  for (const fila of filas) {
    const { error } = await supabase.from("examenes_del_alumno").insert(fila);
    if (error === null) anadidos += 1;
    else if (error.code !== "23505") {
      console.error("[cet] subirCalendarioDeExamenes insert", error.code, error.message);
      return fail("generic");
    }
  }

  revalidatePath(rutasDeHijo(studentId.data).plan);
  return done("examenesLeidos", { count: anadidos, total: filas.length });
}
