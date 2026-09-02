"use server";

/**
 * Las acciones del tutor sobre el plan de estudio (§7–§8, plan automático §3).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * La forma es la de `lib/tutor/actions.ts`: rol en el servidor, Zod sobre el
 * FormData, pertenencia explicita contra `guardian_students` y escritura con
 * la sesion donde la RLS alcanza. Storage, actualizaciones y `plan_tareas`
 * escalan a `service_role` solo despues de comprobar que el hijo es suyo.
 *
 * `generarPlan`, `regenerarPlan` y `editarPlan` son la interfaz publica: cada
 * una encadena los pasos (subir/extraer, confirmar notas, proponer con IA,
 * fijar) a traves de helpers internos no exportados. `cancelarPlan` y
 * `descartarBoletin` no cambian.
 *
 * Ningun `console.*` recibe el texto del PDF, el prompt ni la respuesta del
 * modelo: son datos de un menor.
 */

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { repartir } from "@cet/engine";
import type { TechoDeMateria } from "@cet/engine";
import { PdfSinTextoError, pdfToSpans } from "@cet/content/pdf";

import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { rutasDeHijo } from "@/lib/tutor/rutas";

import {
  hitoMasCercano,
  leerIdsDeCancelacion,
  leerIdsDeDescarte,
  leerNotasCorregidas,
  leerPesosEditados,
} from "./acciones.puras";
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
import type { BoletinExtraido, CodigoMateria } from "./tipos";

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

/** Añade `boletinId` a un `PlanState` de error, para que la interfaz ofrezca «Volver a intentar». */
function conBoletinId(estado: PlanState, boletinId: string): PlanState {
  if (estado.ok) return estado;
  return { ...estado, values: { ...(estado.values ?? {}), boletinId } };
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

/**
 * El comentario libre del tutor al pedir el plan («¡más matemáticas!»).
 * Recortado a 300 caracteres —es una frase, no un ensayo— y `null` si viene
 * vacío. Solo va al prompt del estratega; no se guarda en ninguna tabla.
 */
const MAX_COMENTARIO = 300;
function leerComentario(fd: FormData): string | null {
  const valor = fd.get("comentario");
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/\s+/g, " ").trim().slice(0, MAX_COMENTARIO);
  return limpio === "" ? null : limpio;
}

function leerUuid(fd: FormData, campo: string): string | null {
  const valor = fd.get(campo);
  const parse = z.string().uuid().safeParse(valor);
  return parse.success ? parse.data : null;
}

const schemaDeRecomendaciones = z.array(z.string().trim().min(1).max(400)).max(6);

/** ¿Trae el FormData al menos una corrección de nota (`nota:<i>`)? */
function tieneNotasCorregidas(fd: FormData): boolean {
  for (const clave of fd.keys()) {
    if (clave.startsWith("nota:")) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helpers internos (no exportados): cada uno hace un paso del flujo y
// devuelve sus datos o un `PlanState` de error.
// ---------------------------------------------------------------------------

type ResultadoExtraccion = { readonly ok: true; readonly boletinId: string } | { readonly ok: false; readonly estado: PlanState };

/**
 * Sube el PDF, lo extrae con DeepSeek y guarda el boletín `extraido`. Si el
 * mismo PDF (mismo checksum) ya existía para el hijo, no falla: localiza el
 * boletín existente y sigue con él, como si fuera `regenerarPlan`.
 */
async function extraerBoletin(
  tutorId: string,
  supabase: SupabaseClient,
  studentId: string,
  archivo: File,
): Promise<ResultadoExtraccion> {
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient(
    "Subir el boletín a Storage y resolver códigos de materia del catálogo global",
  );
  const ruta = `${studentId}/${checksum}.pdf`;
  const { error: subidaError } = await admin.storage.from("boletines").upload(ruta, buffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (subidaError !== null && !esErrorDeStorageDuplicado(subidaError)) {
    console.error("[cet] extraerBoletin storage.upload", subidaError.message);
    return { ok: false, estado: fail("generic") };
  }

  let texto: string;
  try {
    const { spans } = await pdfToSpans(buffer);
    texto = spans.map((span) => span.text).join("\n");
  } catch (causa) {
    if (causa instanceof PdfSinTextoError) return { ok: false, estado: fail("planPdfSinTexto") };
    console.error(
      "[cet] extraerBoletin pdfToSpans",
      causa instanceof Error ? causa.message : String(causa),
    );
    return { ok: false, estado: fail("generic") };
  }

  let respuesta: RespuestaDeepSeek;
  try {
    respuesta = await llamarDeepSeek(promptDeExtraccion(texto));
  } catch (causa) {
    if (causa instanceof DeepSeekError) {
      console.error("[cet] extraerBoletin deepseek", causa.motivo, causa.message);
      return { ok: false, estado: fail("planModeloCaido") };
    }
    console.error(
      "[cet] extraerBoletin deepseek",
      causa instanceof Error ? causa.message : String(causa),
    );
    return { ok: false, estado: fail("generic") };
  }

  let extraido: BoletinExtraido;
  try {
    extraido = validarExtraccion(texto, respuesta.json);
  } catch (causa) {
    if (causa instanceof ExtraccionInvalidaError) {
      return { ok: false, estado: fail("planExtraccionInvalida") };
    }
    console.error(
      "[cet] extraerBoletin validarExtraccion",
      causa instanceof Error ? causa.message : String(causa),
    );
    return { ok: false, estado: fail("generic") };
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
        "[cet] extraerBoletin subjects.select",
        materiasError?.code,
        materiasError?.message,
      );
      return { ok: false, estado: fail("generic") };
    }
    for (const bruta of materias) {
      if (!esFila(bruta)) continue;
      const id = columnaTexto(bruta, "id");
      const code = columnaTexto(bruta, "code");
      if (id !== null && code !== null) subjectIdPorCode.set(code, id);
    }
    if (codigos.some((code) => !subjectIdPorCode.has(code))) {
      return { ok: false, estado: fail("generic") };
    }
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
    console.error("[cet] extraerBoletin profiles.select", perfilError.code, perfilError.message);
    return { ok: false, estado: fail("generic") };
  }
  const schoolId = columnaTexto(perfil as Fila | null, "school_id");

  const { data: insertado, error: insertError } = await supabase
    .from("boletines")
    .insert({
      student_id: studentId,
      school_id: schoolId,
      // La politica de insert exige subido_por = auth.uid(); sin esta linea el
      // insert cae por not null antes de llegar a la RLS.
      subido_por: tutorId,
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
    if (insertError.code === "23505") {
      // Mismo checksum para este hijo: ya existe. En vez de fallar, seguimos
      // con el boletín existente (como si fuera `regenerarPlan`).
      const { data: existente, error: existenteError } = await admin
        .from("boletines")
        .select("id")
        .eq("student_id", studentId)
        .eq("checksum", checksum)
        .maybeSingle();
      const idExistente = columnaTexto(existente as Fila | null, "id");
      if (existenteError !== null || idExistente === null) {
        console.error(
          "[cet] extraerBoletin boletines.select (duplicado)",
          existenteError?.code,
          existenteError?.message,
        );
        return { ok: false, estado: fail("planBoletinRepetido") };
      }
      return { ok: true, boletinId: idExistente };
    }
    console.error("[cet] extraerBoletin boletines.insert", insertError.code, insertError.message);
    return { ok: false, estado: fail("generic") };
  }
  const boletinId = columnaTexto(insertado as Fila | null, "id");
  if (boletinId === null) return { ok: false, estado: fail("generic") };

  return { ok: true, boletinId };
}

type ResultadoConfirmacion =
  | { readonly ok: true; readonly boletin: BoletinResumen }
  | { readonly ok: false; readonly estado: PlanState };

/**
 * Confirma las notas del boletín: si `notasNuevas` viene, las guarda (y
 * re-banda, ya lo hace `leerNotasCorregidas`); si el boletín seguía
 * `extraido`, lo pasa a `confirmado`. Si no hay nada que cambiar, no toca la
 * base.
 */
async function confirmarNotas(
  studentId: string,
  boletin: BoletinResumen,
  notasNuevas: readonly NotaGuardada[] | null,
): Promise<ResultadoConfirmacion> {
  const necesitaConfirmar = boletin.estado === "extraido";
  if (notasNuevas === null && !necesitaConfirmar) return { ok: true, boletin };

  const confirmadoAt = new Date().toISOString();
  const cambios: Record<string, unknown> = {};
  if (notasNuevas !== null) cambios["notas"] = notasNuevas;
  if (necesitaConfirmar) {
    cambios["estado"] = "confirmado";
    cambios["confirmado_at"] = confirmadoAt;
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient(
    "Confirmar boletín: el tutor no puede actualizar boletines con su sesión",
  );
  const { error: updateError } = await admin
    .from("boletines")
    .update(cambios)
    .eq("id", boletin.id)
    .eq("student_id", studentId);

  if (updateError !== null) {
    console.error("[cet] confirmarNotas boletines.update", updateError.code, updateError.message);
    return { ok: false, estado: fail("generic") };
  }

  return {
    ok: true,
    boletin: {
      ...boletin,
      notas: notasNuevas ?? boletin.notas,
      estado: "confirmado",
      confirmadoAt: necesitaConfirmar ? confirmadoAt : boletin.confirmadoAt,
    },
  };
}

interface PropuestaLista {
  readonly minutosPorDia: number;
  readonly pesos: Partial<Record<CodigoMateria, number>>;
  readonly recomendaciones: readonly string[];
  readonly modelo: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly desde: string;
  readonly hasta: string;
}

type ResultadoPropuesta =
  | { readonly ok: true; readonly propuesta: PropuestaLista }
  | { readonly ok: false; readonly estado: PlanState };

/** Pide al estratega (DeepSeek) el reparto para un boletín ya confirmado. */
async function proponer(
  supabase: SupabaseClient,
  studentId: string,
  boletin: BoletinResumen,
  indicacionDelTutor: string | null,
): Promise<ResultadoPropuesta> {
  if (boletin.estado !== "confirmado") return { ok: false, estado: fail("planSinConfirmar") };
  if (!boletin.notas.some((nota) => nota.code !== null)) {
    return { ok: false, estado: fail("planSinContenido") };
  }

  const [perfilRes, yearLevelRes, inventario, completadas, minutos] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", studentId).maybeSingle(),
    supabase.from("students").select("year_level").eq("profile_id", studentId).maybeSingle(),
    inventarioDeContenido(),
    leccionesCompletadas(studentId),
    minutosObservados(studentId),
  ]);
  if (perfilRes.error !== null) {
    console.error("[cet] proponer profiles.select", perfilRes.error.code, perfilRes.error.message);
    return { ok: false, estado: fail("generic") };
  }
  const fullName = columnaTexto(perfilRes.data as Fila | null, "full_name") ?? "";
  const nombreDePila = fullName.trim().split(/\s+/)[0] ?? "";
  // El curso decide qué hito Cambridge cierra la ventana del plan (0092): un
  // fallo al leerlo no debe tumbar la propuesta, solo hace que ningún hito se
  // filtre por curso.
  const yearLevelBruto =
    yearLevelRes.error === null ? (yearLevelRes.data as Fila | null)?.["year_level"] : null;
  const yearLevel = typeof yearLevelBruto === "number" ? yearLevelBruto : null;

  const hoy = hoyEnZona();
  const calendario = await calendarioDelPlan(Number(hoy.slice(0, 4)), yearLevel);
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
    indicacionDelTutor,
  };

  let respuesta: RespuestaDeepSeek;
  try {
    respuesta = await llamarDeepSeek(promptDeEstratega(entrada));
  } catch (causa) {
    if (causa instanceof DeepSeekError) {
      console.error("[cet] proponer deepseek", causa.motivo, causa.message);
      return { ok: false, estado: fail("planModeloCaido") };
    }
    console.error("[cet] proponer deepseek", causa instanceof Error ? causa.message : String(causa));
    return { ok: false, estado: fail("generic") };
  }

  try {
    const propuesta = validarPropuesta(respuesta.json);
    return {
      ok: true,
      propuesta: {
        minutosPorDia: propuesta.minutosPorDia,
        pesos: propuesta.reparto,
        recomendaciones: propuesta.recomendaciones,
        modelo: respuesta.modelo,
        tokensIn: respuesta.tokensIn,
        tokensOut: respuesta.tokensOut,
        desde: hoy,
        hasta: ventana.hasta,
      },
    };
  } catch (causa) {
    if (causa instanceof PropuestaInvalidaError) return { ok: false, estado: fail("planModeloCaido") };
    console.error(
      "[cet] proponer validarPropuesta",
      causa instanceof Error ? causa.message : String(causa),
    );
    return { ok: false, estado: fail("generic") };
  }
}

interface OpcionesFijar {
  readonly minutosPorDia: number;
  readonly pesos: Partial<Record<CodigoMateria, number>>;
  readonly recomendaciones: readonly string[];
  readonly modelo: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly desde: string;
  readonly hasta: string;
}

interface PlanFijado {
  readonly planId: string;
  readonly tareas: number;
  readonly techos: readonly TechoDeMateria[];
}

type ResultadoFijado =
  | { readonly ok: true; readonly plan: PlanFijado }
  | { readonly ok: false; readonly estado: PlanState };

/**
 * Desactiva el plan activo del hijo (si lo hay), calcula el reparto con el
 * motor y crea el plan y sus tareas. Mismo rollback que antes si falla a
 * mitad de la inserción de tareas.
 */
async function fijar(
  tutorId: string,
  studentId: string,
  boletinId: string,
  opciones: OpcionesFijar,
): Promise<ResultadoFijado> {
  const boletin = await boletinDeHijo(studentId, boletinId);
  if (boletin === null) return { ok: false, estado: fail("notFound") };
  if (boletin.estado !== "confirmado") return { ok: false, estado: fail("planSinConfirmar") };
  if (opciones.desde > opciones.hasta) return { ok: false, estado: fail("generic") };

  const [inventario, completadas, mastery, calendario] = await Promise.all([
    inventarioDeContenido(),
    leccionesCompletadas(studentId),
    masteryDeAlumno(studentId),
    calendarioDelPlan(Number(opciones.desde.slice(0, 4))),
  ]);

  const entradaReparto = armarEntradaReparto({
    desde: opciones.desde,
    hasta: opciones.hasta,
    minutosPorDia: opciones.minutosPorDia,
    pesos: opciones.pesos,
    inventario,
    completadas,
    mastery,
    calendario,
  });
  const reparto = repartir(entradaReparto);
  if (reparto.tareas.length === 0) return { ok: false, estado: fail("planSinContenido") };

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient(
    "Fijar plan: desactivar el anterior y crear plan y tareas; la RLS del tutor no cubre esas escrituras",
  );

  const { data: activosPrevios, error: activosError } = await admin
    .from("planes_de_estudio")
    .select("id")
    .eq("student_id", studentId)
    .eq("activo", true);
  if (activosError !== null) {
    console.error(
      "[cet] fijar planes_de_estudio.select",
      activosError.code,
      activosError.message,
    );
    return { ok: false, estado: fail("generic") };
  }
  const idsPreviosActivos = (activosPrevios ?? [])
    .filter(esFila)
    .map((fila) => columnaTexto(fila, "id"))
    .filter((id): id is string => id !== null);

  const { error: desactivarError } = await admin
    .from("planes_de_estudio")
    .update({ activo: false })
    .eq("student_id", studentId)
    .eq("activo", true);
  if (desactivarError !== null) {
    console.error(
      "[cet] fijar planes_de_estudio.update",
      desactivarError.code,
      desactivarError.message,
    );
    return { ok: false, estado: fail("generic") };
  }

  const { data: planFila, error: planError } = await admin
    .from("planes_de_estudio")
    .insert({
      student_id: studentId,
      boletin_id: boletinId,
      desde: opciones.desde,
      hasta: opciones.hasta,
      minutos_por_dia: opciones.minutosPorDia,
      reparto: { pesos: opciones.pesos, techos: reparto.techos },
      recomendaciones: opciones.recomendaciones,
      creado_por: tutorId,
      modelo: opciones.modelo,
      tokens_in: opciones.tokensIn,
      tokens_out: opciones.tokensOut,
      activo: true,
    })
    .select("id")
    .single();

  if (planError !== null) {
    console.error("[cet] fijar planes_de_estudio.insert", planError.code, planError.message);
    return { ok: false, estado: fail("generic") };
  }
  const planId = columnaTexto(planFila as Fila | null, "id");
  if (planId === null) return { ok: false, estado: fail("generic") };

  for (let inicio = 0; inicio < reparto.tareas.length; inicio += TAMANO_LOTE_TAREAS) {
    const lote = reparto.tareas.slice(inicio, inicio + TAMANO_LOTE_TAREAS).map((tarea) => ({
      plan_id: planId,
      student_id: studentId,
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
      console.error("[cet] fijar plan_tareas.insert", tareasError.code, tareasError.message);
      const { error: rollbackError } = await admin
        .from("planes_de_estudio")
        .delete()
        .eq("id", planId);
      if (rollbackError !== null) {
        console.error("[cet] fijar rollback", rollbackError.code, rollbackError.message);
      }
      if (idsPreviosActivos.length > 0) {
        const { error: reactivarError } = await admin
          .from("planes_de_estudio")
          .update({ activo: true })
          .in("id", idsPreviosActivos);
        if (reactivarError !== null) {
          console.error(
            "[cet] fijar rollback reactivar",
            reactivarError.code,
            reactivarError.message,
          );
        }
      }
      return { ok: false, estado: fail("generic") };
    }
  }

  return {
    ok: true,
    plan: { planId, tareas: reparto.tareas.length, techos: reparto.techos },
  };
}

// ---------------------------------------------------------------------------
// Acciones exportadas
// ---------------------------------------------------------------------------

/**
 * Sube un boletín y, en una sola pasada, extrae → confirma → propone (IA) →
 * fija el plan. Si el PDF ya se había subido para este hijo, sigue con el
 * boletín existente en vez de fallar.
 */
export async function generarPlan(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  const studentId = leerUuid(fd, "studentId");
  if (studentId === null) return fail("notFound");

  const archivo = fd.get("archivo");
  if (!esArchivoPdf(archivo)) return fail("planPdfInvalido");

  const supabase = await createClient();
  if (!(await esHijoSuyo(supabase, tutor.id, studentId))) return fail("notFound");

  const extraccion = await extraerBoletin(tutor.id, supabase, studentId, archivo);
  if (!extraccion.ok) return extraccion.estado;
  const { boletinId } = extraccion;

  const boletin = await boletinDeHijo(studentId, boletinId);
  if (boletin === null) return conBoletinId(fail("generic"), boletinId);

  const confirmacion = await confirmarNotas(studentId, boletin, null);
  if (!confirmacion.ok) return conBoletinId(confirmacion.estado, boletinId);

  const propuesta = await proponer(supabase, studentId, confirmacion.boletin, leerComentario(fd));
  if (!propuesta.ok) return conBoletinId(propuesta.estado, boletinId);

  const fijado = await fijar(tutor.id, studentId, boletinId, propuesta.propuesta);
  if (!fijado.ok) return conBoletinId(fijado.estado, boletinId);

  revalidatePath(rutasDeHijo(studentId).plan);
  return done("planGenerado", {
    boletinId,
    planId: fijado.plan.planId,
    tareas: fijado.plan.tareas,
    techos: JSON.stringify(fijado.plan.techos),
  });
}

/**
 * Regenera el plan de un boletín ya subido: corrige notas si vienen en el
 * FormData, confirma si hacía falta, propone (IA) y fija — sustituye al plan
 * activo.
 */
export async function regenerarPlan(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  const studentId = leerUuid(fd, "studentId");
  const boletinId = leerUuid(fd, "boletinId");
  if (studentId === null || boletinId === null) return fail("notFound");

  const supabase = await createClient();
  if (!(await esHijoSuyo(supabase, tutor.id, studentId))) return fail("notFound");

  const boletin = await boletinDeHijo(studentId, boletinId);
  if (boletin === null) return fail("notFound");

  let notasNuevas: NotaGuardada[] | null = null;
  if (tieneNotasCorregidas(fd)) {
    notasNuevas = leerNotasCorregidas(fd, boletin.notas);
    if (notasNuevas === null) return conBoletinId(fail("planNotaInvalida"), boletinId);
  }

  const confirmacion = await confirmarNotas(studentId, boletin, notasNuevas);
  if (!confirmacion.ok) return conBoletinId(confirmacion.estado, boletinId);

  const propuesta = await proponer(supabase, studentId, confirmacion.boletin, leerComentario(fd));
  if (!propuesta.ok) return conBoletinId(propuesta.estado, boletinId);

  const fijado = await fijar(tutor.id, studentId, boletinId, propuesta.propuesta);
  if (!fijado.ok) return conBoletinId(fijado.estado, boletinId);

  revalidatePath(rutasDeHijo(studentId).plan);
  return done("planGenerado", {
    boletinId,
    planId: fijado.plan.planId,
    tareas: fijado.plan.tareas,
    techos: JSON.stringify(fijado.plan.techos),
  });
}

const schemaDeEditarPlan = z.object({
  studentId: z.string().uuid(),
  planId: z.string().uuid(),
  minutosPorDia: z.number().int().min(10).max(180),
  pesos: z.string().min(1),
});

/**
 * Cambia minutos/día y el reparto por materia del plan activo, y lo re-fija
 * con el mismo boletín, ventana, recomendaciones y modelo.
 */
export async function editarPlan(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  const parsed = schemaDeEditarPlan.safeParse({
    studentId: fd.get("studentId"),
    planId: fd.get("planId"),
    minutosPorDia: Number(fd.get("minutosPorDia") ?? ""),
    pesos: fd.get("pesos"),
  });
  if (!parsed.success) {
    const campo = parsed.error.issues[0]?.path[0];
    if (campo === "studentId" || campo === "planId") return fail("notFound");
    return fail("generic");
  }
  const datos = parsed.data;

  const supabase = await createClient();
  if (!(await esHijoSuyo(supabase, tutor.id, datos.studentId))) return fail("notFound");

  const pesos = leerPesosEditados(datos.pesos);
  if (pesos === null) return fail("generic");

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient(
    "Editar plan: leer el plan activo para re-fijarlo con el mismo boletín",
  );
  const { data: planFila, error: planError } = await admin
    .from("planes_de_estudio")
    .select("boletin_id, desde, hasta, recomendaciones, modelo, tokens_in, tokens_out")
    .eq("id", datos.planId)
    .eq("student_id", datos.studentId)
    .eq("activo", true)
    .maybeSingle();
  if (planError !== null) {
    console.error(
      "[cet] editarPlan planes_de_estudio.select",
      planError.code,
      planError.message,
    );
    return fail("generic");
  }
  const fila = planFila as Fila | null;
  const boletinId = columnaTexto(fila, "boletin_id");
  const desde = columnaTexto(fila, "desde");
  const hasta = columnaTexto(fila, "hasta");
  const modelo = columnaTexto(fila, "modelo");
  const tokensInBruto = fila?.["tokens_in"];
  const tokensOutBruto = fila?.["tokens_out"];
  const recomendacionesParse = schemaDeRecomendaciones.safeParse(fila?.["recomendaciones"]);
  if (
    boletinId === null ||
    desde === null ||
    hasta === null ||
    modelo === null ||
    typeof tokensInBruto !== "number" ||
    typeof tokensOutBruto !== "number" ||
    !recomendacionesParse.success
  ) {
    return fail("notFound");
  }

  const hoy = hoyEnZona();
  const desdeEfectivo = desde < hoy ? hoy : desde;

  const fijado = await fijar(tutor.id, datos.studentId, boletinId, {
    minutosPorDia: datos.minutosPorDia,
    pesos,
    recomendaciones: recomendacionesParse.data,
    modelo,
    tokensIn: tokensInBruto,
    tokensOut: tokensOutBruto,
    desde: desdeEfectivo,
    hasta,
  });
  if (!fijado.ok) return fijado.estado;

  revalidatePath(rutasDeHijo(datos.studentId).plan);
  return done("planEditado", {
    planId: fijado.plan.planId,
    tareas: fijado.plan.tareas,
    techos: JSON.stringify(fijado.plan.techos),
  });
}

export async function cancelarPlan(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  const ids = leerIdsDeCancelacion(fd);
  if (ids === null) return fail("notFound");

  const supabase = await createClient();
  if (!(await esHijoSuyo(supabase, tutor.id, ids.studentId))) return fail("notFound");

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient(
    "Cancelar plan: la RLS del tutor no cubre la escritura en planes_de_estudio",
  );
  const { data: actualizado, error: cancelError } = await admin
    .from("planes_de_estudio")
    .update({ activo: false })
    .eq("id", ids.planId)
    .eq("student_id", ids.studentId)
    .eq("activo", true)
    .select("id");

  if (cancelError !== null) {
    console.error("[cet] cancelarPlan planes_de_estudio.update", cancelError.code, cancelError.message);
    return fail("generic");
  }
  if (actualizado === null || actualizado.length === 0) return fail("planNoActivo");

  revalidatePath(rutasDeHijo(ids.studentId).plan);
  return done("planCancelado");
}

export async function descartarBoletin(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  const ids = leerIdsDeDescarte(fd);
  if (ids === null) return fail("notFound");

  const supabase = await createClient();
  if (!(await esHijoSuyo(supabase, tutor.id, ids.studentId))) return fail("notFound");

  const boletin = await boletinDeHijo(ids.studentId, ids.boletinId);
  if (boletin === null) return fail("notFound");
  if (boletin.estado !== "extraido") return fail("planBoletinConfirmadoNoSeDescarta");

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient(
    "Descartar boletín: la RLS del tutor no cubre la escritura en boletines",
  );
  const { error: borrarError } = await admin
    .from("boletines")
    .delete()
    .eq("id", ids.boletinId)
    .eq("student_id", ids.studentId);

  if (borrarError !== null) {
    console.error("[cet] descartarBoletin boletines.delete", borrarError.code, borrarError.message);
    return fail("generic");
  }

  revalidatePath(rutasDeHijo(ids.studentId).plan);
  return done("boletinDescartado");
}
