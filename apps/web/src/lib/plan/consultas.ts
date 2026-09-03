import { z } from "zod";
import type { EntradaReparto, EventoCalendario, MateriaDelPlan, TechoDeMateria } from "@cet/engine";
import { i18nText, resolveI18n } from "@cet/shared";
import type { InventarioDetalladoDeMateria } from "./estratega";
import { hoyEnZona, sumarDias, ZONA_HORARIA_DEL_PLAN } from "./fecha";
import { MATERIAS_CON_CONTENIDO, type Banda, type CodigoMateria, type PrioridadDeMateria } from "./tipos";

type Fila = Record<string, unknown>;

function esFila(value: unknown): value is Fila {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function texto(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numero(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function entero(value: unknown): number | null {
  const n = numero(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

/**
 * `jsonb` I18nText de la base a texto plano: `es` con fallback `en`, como el
 * resto de la app (AD-7). Cadena vacía si el valor no es un I18nText válido —
 * mejor un hueco visible que tumbar el inventario entero por un título roto.
 */
function tituloDesdeI18n(value: unknown): string {
  const parse = i18nText.safeParse(value);
  if (!parse.success) return "";
  return resolveI18n(parse.data, "es", "en");
}

function listaDeStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

const CODIGOS_DE_MATERIA = new Set<string>(MATERIAS_CON_CONTENIDO);

function esCodigoMateria(value: unknown): value is CodigoMateria {
  return typeof value === "string" && CODIGOS_DE_MATERIA.has(value);
}

const bandaSchema = z.enum([
  "outstanding",
  "well_done",
  "good",
  "satisfactory",
  "needs_improvement",
  "failing",
]);

export interface NotaGuardada {
  readonly materia: string;
  readonly code: CodigoMateria | null;
  readonly subject_id: string | null;
  readonly nota: number;
  readonly banda: Banda;
}

export const notaGuardadaSchema: z.ZodType<NotaGuardada> = z.object({
  materia: z.string(),
  code: z.enum(MATERIAS_CON_CONTENIDO).nullable(),
  subject_id: z.string().nullable(),
  nota: z.number().refine((v) => Number.isFinite(v) && v >= 0 && v <= 100, {
    message: "nota_fuera_de_rango",
  }),
  banda: bandaSchema,
});

export interface RepartoGuardado {
  readonly pesos: Partial<Record<CodigoMateria, number>>;
  readonly techos: readonly TechoDeMateria[];
  /** Qué leer y qué practicar primero (§7.2/§7.4). Ausente en planes previos a esa ronda. */
  readonly prioridades?: Partial<Record<CodigoMateria, PrioridadDeMateria>>;
}

const pesoGuardadoSchema = z
  .number()
  .refine((v) => Number.isFinite(v) && v > 0, { message: "peso_invalido" });

const pesosGuardadosSchema = z
  .object({
    english: pesoGuardadoSchema.optional(),
    ict: pesoGuardadoSchema.optional(),
    math: pesoGuardadoSchema.optional(),
    science: pesoGuardadoSchema.optional(),
    socials: pesoGuardadoSchema.optional(),
    spanish: pesoGuardadoSchema.optional(),
  })
  .strict();

const techoDeMateriaSchema = z.object({
  subjectId: z.string(),
  code: z.string(),
  minutosPedidos: z.number(),
  minutosDisponibles: z.number(),
});

const prioridadDeMateriaGuardadaSchema = z.object({
  lecciones: z.array(z.string()),
  skills: z.array(z.string()),
  porQue: z.string(),
});

const prioridadesGuardadasSchema = z
  .object({
    english: prioridadDeMateriaGuardadaSchema.optional(),
    ict: prioridadDeMateriaGuardadaSchema.optional(),
    math: prioridadDeMateriaGuardadaSchema.optional(),
    science: prioridadDeMateriaGuardadaSchema.optional(),
    socials: prioridadDeMateriaGuardadaSchema.optional(),
    spanish: prioridadDeMateriaGuardadaSchema.optional(),
  })
  .strict()
  .optional();

export const repartoGuardadoSchema: z.ZodType<RepartoGuardado> = z.object({
  pesos: pesosGuardadosSchema,
  techos: z.array(techoDeMateriaSchema),
  prioridades: prioridadesGuardadasSchema,
}) as unknown as z.ZodType<RepartoGuardado>;

export interface BoletinResumen {
  readonly id: string;
  readonly gestion: number;
  readonly trimestre: number | null;
  readonly estado: "extraido" | "confirmado";
  readonly notas: readonly NotaGuardada[];
  readonly createdAt: string;
  readonly confirmadoAt: string | null;
}

export interface ParteResumen {
  readonly fecha: string;
  readonly minutosPrevistos: number;
  readonly minutosMedidos: number;
  readonly itemsRespondidos: number;
  readonly aciertos: number;
  readonly enviadoAt: string | null;
}

/** Qué leer y qué practicar primero en una materia, ya con títulos (§7.4/§7.5). */
export interface PrioridadResumen {
  readonly code: CodigoMateria;
  readonly porQue: string;
  readonly lecciones: readonly { readonly lessonId: string; readonly titulo: string }[];
  readonly skills: readonly { readonly skillId: string; readonly nombre: string }[];
}

export interface PlanResumen {
  readonly id: string;
  readonly boletinId: string;
  readonly desde: string;
  readonly hasta: string;
  readonly minutosPorDia: number;
  readonly reparto: RepartoGuardado;
  readonly recomendaciones: readonly string[];
  readonly createdAt: string;
  readonly tareas: number;
  readonly partes: readonly ParteResumen[];
  /** Vacío si el plan no guardó prioridades (§7.4). */
  readonly prioridades: readonly PrioridadResumen[];
}

export interface MateriaInventario {
  readonly subjectId: string;
  readonly code: CodigoMateria;
  readonly lecciones: readonly {
    readonly lessonId: string;
    readonly titulo: string;
    readonly moduloTitulo: string;
    readonly moduloOrd: number;
    readonly ord: number;
    readonly minutos: number;
  }[];
  readonly skills: readonly {
    readonly skillId: string;
    readonly code: string;
    readonly nombre: string;
    readonly ord: number;
    readonly preguntas: number;
  }[];
}

const trimestreGuardadoSchema = z.number().int().min(1).max(3).nullable();
const notasGuardadasSchema = z.array(notaGuardadaSchema);

function ventanaDeInforme(dias: number): { desde: string; hasta: string } {
  const ahora = new Date();
  const medianocheDeHoy = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  const inicio = medianocheDeHoy - (dias - 1) * 24 * 60 * 60 * 1000;
  return { desde: new Date(inicio).toISOString(), hasta: ahora.toISOString() };
}

export async function boletinesDeHijo(studentId: string): Promise<BoletinResumen[]> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("boletines")
    .select("id, gestion, trimestre, estado, notas, created_at, confirmado_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error !== null || data === null) return [];

  const resultado: BoletinResumen[] = [];
  for (const bruta of data) {
    if (!esFila(bruta)) continue;
    const id = texto(bruta["id"]);
    const gestion = numero(bruta["gestion"]);
    const trimestreParse = trimestreGuardadoSchema.safeParse(bruta["trimestre"]);
    const estado = bruta["estado"];
    const createdAt = texto(bruta["created_at"]);
    const confirmadoBruto = bruta["confirmado_at"];
    const confirmadoAt = typeof confirmadoBruto === "string" ? confirmadoBruto : null;

    if (
      id === null ||
      gestion === null ||
      !Number.isInteger(gestion) ||
      gestion <= 0 ||
      !trimestreParse.success ||
      (estado !== "extraido" && estado !== "confirmado") ||
      createdAt === null ||
      (confirmadoBruto !== null && typeof confirmadoBruto !== "string")
    ) {
      continue;
    }

    const notasParse = notasGuardadasSchema.safeParse(bruta["notas"]);
    resultado.push({
      id,
      gestion,
      trimestre: trimestreParse.data,
      estado,
      notas: notasParse.success ? notasParse.data : [],
      createdAt,
      confirmadoAt,
    });
  }

  return resultado;
}

export async function planActivoDeHijo(studentId: string): Promise<PlanResumen | null> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: planFila, error: planError } = await supabase
    .from("planes_de_estudio")
    .select("id, boletin_id, desde, hasta, minutos_por_dia, reparto, recomendaciones, created_at")
    .eq("student_id", studentId)
    .eq("activo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planError !== null) return null;
  if (!esFila(planFila)) return null;

  const id = texto(planFila["id"]);
  const boletinId = texto(planFila["boletin_id"]);
  const desde = texto(planFila["desde"]);
  const hasta = texto(planFila["hasta"]);
  const minutosPorDia = numero(planFila["minutos_por_dia"]);
  const repartoResultado = repartoGuardadoSchema.safeParse(planFila["reparto"]);
  const createdAt = texto(planFila["created_at"]);

  if (
    id === null ||
    boletinId === null ||
    desde === null ||
    hasta === null ||
    minutosPorDia === null ||
    minutosPorDia <= 0 ||
    !repartoResultado.success ||
    createdAt === null
  ) {
    return null;
  }

  const recomendaciones = listaDeStrings(planFila["recomendaciones"]);
  const hoy = hoyEnZona();
  const haceCatorceDias = sumarDias(hoy, -13);

  const [{ count: conteoTareas }, { data: partesBrutas }] = await Promise.all([
    supabase.from("plan_tareas").select("id", { count: "exact", head: true }).eq("plan_id", id),
    supabase
      .from("plan_partes")
      .select("fecha, minutos_previstos, minutos_medidos, items_respondidos, aciertos, enviado_at")
      .eq("plan_id", id)
      .gte("fecha", haceCatorceDias)
      .lte("fecha", hoy)
      .order("fecha", { ascending: false }),
  ]);

  const partes: ParteResumen[] = [];
  for (const bruta of partesBrutas ?? []) {
    if (!esFila(bruta)) continue;
    const fecha = texto(bruta["fecha"]);
    const minutosPrevistos = numero(bruta["minutos_previstos"]);
    const minutosMedidos = numero(bruta["minutos_medidos"]);
    const itemsRespondidos = numero(bruta["items_respondidos"]);
    const aciertos = numero(bruta["aciertos"]);
    const enviadoBruto = bruta["enviado_at"];

    if (
      fecha === null ||
      minutosPrevistos === null ||
      minutosMedidos === null ||
      itemsRespondidos === null ||
      aciertos === null ||
      (enviadoBruto !== null && typeof enviadoBruto !== "string")
    ) {
      continue;
    }

    partes.push({
      fecha,
      minutosPrevistos,
      minutosMedidos,
      itemsRespondidos,
      aciertos,
      enviadoAt: typeof enviadoBruto === "string" ? enviadoBruto : null,
    });
  }

  const prioridadesGuardadas = repartoResultado.data.prioridades ?? {};
  const entradasPrioridades = Object.entries(prioridadesGuardadas) as [
    CodigoMateria,
    PrioridadDeMateria,
  ][];

  const lessonIds = [...new Set(entradasPrioridades.flatMap(([, p]) => p.lecciones))];
  const skillIds = [...new Set(entradasPrioridades.flatMap(([, p]) => p.skills))];

  const [leccionesRes, skillsRes] = await Promise.all([
    lessonIds.length > 0
      ? supabase.from("lessons").select("id, title").in("id", lessonIds)
      : Promise.resolve({ data: [], error: null }),
    skillIds.length > 0
      ? supabase.from("skills").select("id, name").in("id", skillIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const tituloPorLeccion = new Map<string, string>();
  for (const bruta of leccionesRes.data ?? []) {
    if (!esFila(bruta)) continue;
    const id = texto(bruta["id"]);
    if (id !== null) tituloPorLeccion.set(id, tituloDesdeI18n(bruta["title"]));
  }
  const nombrePorSkill = new Map<string, string>();
  for (const bruta of skillsRes.data ?? []) {
    if (!esFila(bruta)) continue;
    const id = texto(bruta["id"]);
    if (id !== null) nombrePorSkill.set(id, tituloDesdeI18n(bruta["name"]));
  }

  const prioridades: PrioridadResumen[] = entradasPrioridades.map(([code, prioridad]) => ({
    code,
    porQue: prioridad.porQue,
    lecciones: prioridad.lecciones
      .filter((lessonId) => tituloPorLeccion.has(lessonId))
      .map((lessonId) => ({ lessonId, titulo: tituloPorLeccion.get(lessonId) ?? "" })),
    skills: prioridad.skills
      .filter((skillId) => nombrePorSkill.has(skillId))
      .map((skillId) => ({ skillId, nombre: nombrePorSkill.get(skillId) ?? "" })),
  }));

  return {
    id,
    boletinId,
    desde,
    hasta,
    minutosPorDia,
    reparto: repartoResultado.data,
    recomendaciones,
    prioridades,
    createdAt,
    tareas: conteoTareas ?? 0,
    partes,
  };
}

export async function inventarioDeContenido(): Promise<MateriaInventario[]> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient(
    "Leer el catalogo publicado global para el inventario del plan de estudio",
  );
  const { data: cursosBrutos, error: cursosError } = await supabase
    .from("courses")
    .select("id, subject_id")
    .is("school_id", null)
    .eq("year_level", 6)
    .eq("status", "published");

  if (cursosError !== null || cursosBrutos === null) return [];

  const cursos: { id: string; subjectId: string }[] = [];
  for (const bruta of cursosBrutos) {
    if (!esFila(bruta)) continue;
    const id = texto(bruta["id"]);
    const subjectId = texto(bruta["subject_id"]);
    if (id !== null && subjectId !== null) cursos.push({ id, subjectId });
  }

  if (cursos.length === 0) return [];

  const courseIds = cursos.map((c) => c.id);
  const subjectIds = cursos.map((c) => c.subjectId);

  const [materiasRes, modulosRes, skillsRes] = await Promise.all([
    supabase.from("subjects").select("id, code, ord").is("school_id", null).in("id", subjectIds),
    supabase.from("course_modules").select("id, course_id, ord, title").in("course_id", courseIds),
    supabase
      // `skills` no tiene `status`: la skill existe o no; lo publicado son
      // sus preguntas, que se cuentan mas abajo.
      .from("skills")
      .select("id, course_id, code, ord, name")
      .in("course_id", courseIds),
  ]);

  if (materiasRes.error !== null || modulosRes.error !== null || skillsRes.error !== null) {
    return [];
  }

  const materiaPorId = new Map<string, { code: CodigoMateria; ord: number }>();
  for (const bruta of materiasRes.data ?? []) {
    if (!esFila(bruta)) continue;
    const id = texto(bruta["id"]);
    const code = bruta["code"];
    const ord = entero(bruta["ord"]);
    if (id !== null && esCodigoMateria(code) && ord !== null) {
      materiaPorId.set(id, { code, ord });
    }
  }

  const modulos: { id: string; courseId: string; ord: number; titulo: string }[] = [];
  for (const bruta of modulosRes.data ?? []) {
    if (!esFila(bruta)) continue;
    const id = texto(bruta["id"]);
    const courseId = texto(bruta["course_id"]);
    const ord = entero(bruta["ord"]);
    if (id !== null && courseId !== null && ord !== null) {
      modulos.push({ id, courseId, ord, titulo: tituloDesdeI18n(bruta["title"]) });
    }
  }

  const moduloPorId = new Map<string, { courseId: string; ord: number; titulo: string }>();
  for (const m of modulos) moduloPorId.set(m.id, m);

  const skills: { id: string; courseId: string; code: string; ord: number; nombre: string }[] = [];
  for (const bruta of skillsRes.data ?? []) {
    if (!esFila(bruta)) continue;
    const id = texto(bruta["id"]);
    const courseId = texto(bruta["course_id"]);
    const code = texto(bruta["code"]);
    const ord = entero(bruta["ord"]);
    if (id !== null && courseId !== null && code !== null && ord !== null) {
      skills.push({ id, courseId, code, ord, nombre: tituloDesdeI18n(bruta["name"]) });
    }
  }

  const moduleIds = modulos.map((m) => m.id);
  const lessonsRes =
    moduleIds.length > 0
      ? await supabase
          .from("lessons")
          .select("id, module_id, ord, estimated_minutes, title")
          .in("module_id", moduleIds)
          .eq("status", "published")
      : { data: [], error: null };
  if (lessonsRes.error !== null) return [];

  const lecciones: {
    id: string;
    moduleId: string;
    ord: number;
    minutos: number;
    titulo: string;
  }[] = [];
  for (const bruta of lessonsRes.data ?? []) {
    if (!esFila(bruta)) continue;
    const id = texto(bruta["id"]);
    const moduleId = texto(bruta["module_id"]);
    const ord = entero(bruta["ord"]);
    const minutos = numero(bruta["estimated_minutes"]);
    if (id !== null && moduleId !== null && ord !== null && minutos !== null) {
      lecciones.push({ id, moduleId, ord, minutos, titulo: tituloDesdeI18n(bruta["title"]) });
    }
  }

  const skillIds = skills.map((s) => s.id);
  const preguntasRes =
    skillIds.length > 0
      ? await supabase
          .from("questions")
          .select("skill_id")
          .in("skill_id", skillIds)
          .eq("status", "published")
      : { data: [], error: null };
  if (preguntasRes.error !== null) return [];

  const preguntasPorSkill = new Map<string, number>();
  for (const bruta of preguntasRes.data ?? []) {
    if (!esFila(bruta)) continue;
    const skillId = texto(bruta["skill_id"]);
    if (skillId !== null) {
      preguntasPorSkill.set(skillId, (preguntasPorSkill.get(skillId) ?? 0) + 1);
    }
  }

  const resultado: MateriaInventario[] = [];
  const cursosOrdenados = [...cursos].sort(
    (a, b) =>
      (materiaPorId.get(a.subjectId)?.ord ?? Number.MAX_SAFE_INTEGER) -
      (materiaPorId.get(b.subjectId)?.ord ?? Number.MAX_SAFE_INTEGER),
  );

  for (const curso of cursosOrdenados) {
    const materia = materiaPorId.get(curso.subjectId);
    if (!materia) continue;

    const leccionesDeMateria = lecciones.flatMap((leccion) => {
      const modulo = moduloPorId.get(leccion.moduleId);
      if (!modulo || modulo.courseId !== curso.id) return [];
      return [
        {
          lessonId: leccion.id,
          titulo: leccion.titulo,
          moduloTitulo: modulo.titulo,
          moduloOrd: modulo.ord,
          ord: leccion.ord,
          minutos: leccion.minutos,
        },
      ];
    });
    leccionesDeMateria.sort((a, b) => a.moduloOrd - b.moduloOrd || a.ord - b.ord);

    const skillsDeMateria = skills
      .filter((skill) => skill.courseId === curso.id)
      .map((skill) => ({
        skillId: skill.id,
        code: skill.code,
        nombre: skill.nombre,
        ord: skill.ord,
        preguntas: preguntasPorSkill.get(skill.id) ?? 0,
      }))
      .sort((a, b) => a.ord - b.ord);

    resultado.push({
      subjectId: curso.subjectId,
      code: materia.code,
      lecciones: leccionesDeMateria,
      skills: skillsDeMateria,
    });
  }

  return resultado;
}

export async function leccionesCompletadas(studentId: string): Promise<ReadonlySet<string>> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient(
    "Leer learning_events para saber que lecciones termino el alumno",
  );
  const { data, error } = await supabase
    .from("learning_events")
    .select("lesson_id")
    .eq("student_id", studentId)
    .eq("event_type", "lesson_completed");

  const resultado = new Set<string>();
  if (error !== null) return resultado;
  for (const bruta of data ?? []) {
    if (!esFila(bruta)) continue;
    const lessonId = texto(bruta["lesson_id"]);
    if (lessonId !== null) resultado.add(lessonId);
  }
  return resultado;
}

export interface MasteryDeSkill {
  readonly mastery: number;
  /** `YYYY-MM-DD`, fecha civil en la zona del plan; `null` sin práctica registrada. */
  readonly ultimaPractica: string | null;
}

export async function masteryDeAlumno(
  studentId: string,
): Promise<ReadonlyMap<string, MasteryDeSkill>> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient(
    "Leer skill_mastery del alumno para armar la entrada del plan",
  );
  const { data, error } = await supabase
    .from("skill_mastery")
    .select("skill_id, mastery, last_practiced_at")
    .eq("student_id", studentId);

  const resultado = new Map<string, MasteryDeSkill>();
  if (error !== null) return resultado;
  for (const bruta of data ?? []) {
    if (!esFila(bruta)) continue;
    const skillId = texto(bruta["skill_id"]);
    const mastery = numero(bruta["mastery"]);
    const ultimaPracticaBruta = texto(bruta["last_practiced_at"]);
    if (skillId !== null && mastery !== null && mastery >= 0 && mastery <= 1) {
      resultado.set(skillId, {
        mastery,
        ultimaPractica:
          ultimaPracticaBruta === null
            ? null
            : hoyEnZona(ZONA_HORARIA_DEL_PLAN, new Date(ultimaPracticaBruta)),
      });
    }
  }
  return resultado;
}

/**
 * Reparto por materia de los últimos 28 días (§7.1), mismo RPC y ventana que
 * `minutosObservados` y `lib/tutor/queries.ts`: una fila por materia con
 * actividad, nunca una por cada materia del catálogo.
 */
export interface ActividadDeMateria {
  readonly minutos: number;
  readonly items: number;
  readonly porcentajeAcierto: number | null;
  readonly leccionesCompletadas: number;
}

export async function actividadRecientePorMateria(
  studentId: string,
): Promise<ReadonlyMap<string, ActividadDeMateria>> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { desde, hasta } = ventanaDeInforme(28);
  const { data, error } = await supabase.rpc("informe_alumno_resumen_por_materia", {
    p_student_id: studentId,
    p_desde: desde,
    p_hasta: hasta,
  });

  const resultado = new Map<string, ActividadDeMateria>();
  if (error !== null || !Array.isArray(data)) return resultado;
  for (const bruta of data) {
    if (!esFila(bruta)) continue;
    const subjectId = texto(bruta["subject_id"]);
    const minutos = numero(bruta["minutos_estudio"]);
    const items = entero(bruta["items_respondidos"]);
    const porcentajeAcierto = numero(bruta["porcentaje_acierto"]);
    const leccionesCompletadas = entero(bruta["lecciones_completadas"]);
    if (subjectId === null || minutos === null || items === null || leccionesCompletadas === null) {
      continue;
    }
    resultado.set(subjectId, { minutos, items, porcentajeAcierto, leccionesCompletadas });
  }
  return resultado;
}

export interface LeccionCompletadaReciente {
  readonly lessonId: string;
  /** `YYYY-MM-DD`, fecha civil en la zona del plan. */
  readonly fecha: string;
}

/** Las últimas `limite` lecciones que terminó el alumno, más recientes primero (§7.1). */
export async function ultimasLeccionesCompletadas(
  studentId: string,
  limite: number = 5,
): Promise<LeccionCompletadaReciente[]> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient(
    "Leer learning_events para las últimas lecciones completadas del plan",
  );
  const { data, error } = await supabase
    .from("learning_events")
    .select("lesson_id, server_ts")
    .eq("student_id", studentId)
    .eq("event_type", "lesson_completed")
    .order("server_ts", { ascending: false })
    .limit(limite);

  const resultado: LeccionCompletadaReciente[] = [];
  if (error !== null) return resultado;
  for (const bruta of data ?? []) {
    if (!esFila(bruta)) continue;
    const lessonId = texto(bruta["lesson_id"]);
    const serverTs = texto(bruta["server_ts"]);
    if (lessonId !== null && serverTs !== null) {
      resultado.push({ lessonId, fecha: hoyEnZona(ZONA_HORARIA_DEL_PLAN, new Date(serverTs)) });
    }
  }
  return resultado;
}

const eventoCalendarioSchema = z.object({
  desde: z.string(),
  hasta: z.string(),
  tipo: z.enum([
    "feriado",
    "sin_clases",
    "examenes_finales",
    "vacaciones",
    "fin_trimestre",
    "hito_cambridge",
  ]),
});

export function filtrarCalendarioPorCurso(
  filas: readonly unknown[],
  yearLevel: number | null,
): EventoCalendario[] {
  const resultado: EventoCalendario[] = [];
  for (const bruta of filas) {
    if (!esFila(bruta)) continue;
    const parse = eventoCalendarioSchema.safeParse(bruta);
    if (!parse.success) continue;
    // Un hito Cambridge de OTRO curso (Movers de Y4, Flyers de Y5) no es el
    // hito de este alumno: sin este filtro, `hitoMasCercano` cerraria la
    // ventana de LEO en la fecha de un examen que no es suyo. `EventoCalendario`
    // no lleva year_levels a proposito: el motor solo necesita fechas y tipo.
    const yearLevels = bruta["year_levels"];
    if (
      parse.data.tipo === "hito_cambridge" &&
      Array.isArray(yearLevels) &&
      yearLevels.length > 0 &&
      (yearLevel === null || !yearLevels.includes(yearLevel))
    ) {
      continue;
    }
    resultado.push(parse.data);
  }
  return resultado;
}

export async function calendarioDelPlan(
  gestion: number,
  yearLevel: number | null = null,
): Promise<EventoCalendario[]> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendario_eventos")
    .select("desde, hasta, tipo, year_levels")
    .eq("gestion", gestion)
    .order("desde", { ascending: true });

  if (error !== null || data === null) return [];
  return filtrarCalendarioPorCurso(data, yearLevel);
}

export interface EventoProximo {
  readonly desde: string;
  readonly hasta: string;
  readonly tipo: EventoCalendario["tipo"];
  readonly yearLevels: number[];
}

export function recortarVentana(
  filas: readonly unknown[],
  desde: string,
  hasta: string,
): EventoProximo[] {
  const resultado: EventoProximo[] = [];
  for (const bruta of filas) {
    if (!esFila(bruta)) continue;
    const parse = eventoCalendarioSchema.safeParse(bruta);
    if (!parse.success) continue;
    if (parse.data.hasta < desde || parse.data.desde > hasta) continue;
    const yearLevelsBruto = bruta["year_levels"];
    const yearLevels = Array.isArray(yearLevelsBruto)
      ? yearLevelsBruto.filter((x): x is number => typeof x === "number")
      : [];
    resultado.push({ ...parse.data, yearLevels });
  }
  return resultado;
}

export async function eventosProximos(
  gestion: number,
  desde: string,
  dias: number = 60,
): Promise<EventoProximo[]> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const hasta = sumarDias(desde, dias);
  const { data, error } = await supabase
    .from("calendario_eventos")
    .select("desde, hasta, tipo, year_levels")
    .eq("gestion", gestion)
    .gte("hasta", desde)
    .lte("desde", hasta)
    .order("desde", { ascending: true });

  if (error !== null || data === null) {
    console.error("[cet] eventosProximos", error);
    return [];
  }
  return recortarVentana(data, desde, hasta);
}

export async function minutosObservados(studentId: string): Promise<number | null> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { desde, hasta } = ventanaDeInforme(28);
  const { data, error } = await supabase.rpc("informe_alumno_serie_diaria", {
    p_student_id: studentId,
    p_desde: desde,
    p_hasta: hasta,
  });

  if (error !== null || !Array.isArray(data)) return null;

  let total = 0;
  let dias = 0;
  let conMinutos = false;
  for (const bruta of data) {
    if (!esFila(bruta)) continue;
    const minutos = numero(bruta["minutos_estudio"]);
    if (minutos === null) continue;
    total += minutos;
    dias += 1;
    if (minutos > 0) conMinutos = true;
  }

  if (dias === 0 || !conMinutos) return null;
  return Math.round(total / dias);
}

const ACTIVIDAD_VACIA: ActividadDeMateria = {
  minutos: 0,
  items: 0,
  porcentajeAcierto: null,
  leccionesCompletadas: 0,
};

/**
 * El detalle que ve el estratega por materia (§7.1): sustituye a los cuatro
 * totales de antes. `completada` y `mastery`/`ultimaPractica` cruzan el
 * inventario con lo que hizo el alumno; `reciente` es su actividad de los
 * últimos 28 días (o ceros/porcentaje `null` si no tocó esa materia).
 */
export function armarInventarioDetallado(
  inventario: readonly MateriaInventario[],
  completadas: ReadonlySet<string>,
  mastery: ReadonlyMap<string, MasteryDeSkill>,
  actividad: ReadonlyMap<string, ActividadDeMateria>,
): InventarioDetalladoDeMateria[] {
  return inventario.map((materia) => ({
    code: materia.code,
    lecciones: materia.lecciones.map((leccion) => ({
      id: leccion.lessonId,
      titulo: leccion.titulo,
      modulo: leccion.moduloTitulo,
      minutos: leccion.minutos,
      completada: completadas.has(leccion.lessonId),
    })),
    skills: materia.skills.map((skill) => {
      const m = mastery.get(skill.skillId);
      return {
        id: skill.skillId,
        code: skill.code,
        nombre: skill.nombre,
        preguntas: skill.preguntas,
        mastery: m?.mastery ?? null,
        ultimaPractica: m?.ultimaPractica ?? null,
      };
    }),
    reciente: actividad.get(materia.subjectId) ?? ACTIVIDAD_VACIA,
  }));
}

/** Las últimas lecciones completadas (§7.1), con su título y la materia a la que pertenecen. */
export function armarUltimasLecciones(
  ultimas: readonly LeccionCompletadaReciente[],
  inventario: readonly MateriaInventario[],
): { readonly titulo: string; readonly code: CodigoMateria; readonly fecha: string }[] {
  const materiaPorLeccion = new Map<string, { titulo: string; code: CodigoMateria }>();
  for (const materia of inventario) {
    for (const leccion of materia.lecciones) {
      materiaPorLeccion.set(leccion.lessonId, { titulo: leccion.titulo, code: materia.code });
    }
  }

  return ultimas.flatMap((reciente) => {
    const encontrada = materiaPorLeccion.get(reciente.lessonId);
    if (!encontrada) return [];
    return [{ titulo: encontrada.titulo, code: encontrada.code, fecha: reciente.fecha }];
  });
}

export function armarEntradaReparto(p: {
  readonly desde: string;
  readonly hasta: string;
  readonly minutosPorDia: number;
  readonly pesos: Partial<Record<CodigoMateria, number>>;
  readonly inventario: readonly MateriaInventario[];
  readonly completadas: ReadonlySet<string>;
  readonly mastery: ReadonlyMap<string, MasteryDeSkill>;
  readonly calendario: readonly EventoCalendario[];
  readonly prioridades?: Partial<Record<CodigoMateria, PrioridadDeMateria>>;
  readonly examenes?: readonly { readonly fecha: string; readonly subjectId: string | null }[];
}): EntradaReparto {
  const materias: MateriaDelPlan[] = [];

  for (const materia of p.inventario) {
    const peso = p.pesos[materia.code];
    if (typeof peso !== "number" || !Number.isFinite(peso) || peso <= 0) {
      continue;
    }

    const prioridad = p.prioridades?.[materia.code];

    materias.push({
      subjectId: materia.subjectId,
      code: materia.code,
      peso,
      lecciones: materia.lecciones.map((leccion) => ({
        lessonId: leccion.lessonId,
        moduloOrd: leccion.moduloOrd,
        ord: leccion.ord,
        minutos: leccion.minutos,
        completada: p.completadas.has(leccion.lessonId),
      })),
      skills: materia.skills.map((skill) => ({
        skillId: skill.skillId,
        ord: skill.ord,
        preguntas: skill.preguntas,
        mastery: p.mastery.get(skill.skillId)?.mastery ?? null,
      })),
      ...(prioridad !== undefined && prioridad.lecciones.length > 0
        ? { prioridadLecciones: prioridad.lecciones }
        : {}),
      ...(prioridad !== undefined && prioridad.skills.length > 0
        ? { prioridadSkills: prioridad.skills }
        : {}),
    });
  }

  return {
    desde: p.desde,
    hasta: p.hasta,
    minutosPorDia: p.minutosPorDia,
    materias,
    calendario: p.calendario,
    ...(p.examenes !== undefined ? { examenes: p.examenes } : {}),
  };
}

/* ---------------------------------------------------------------------------
 * El calendario del plan, para el tutor
 * ------------------------------------------------------------------------- */

export interface TareaDelCalendario {
  readonly id: string;
  readonly ord: number;
  readonly code: CodigoMateria | null;
  readonly tipo: "leccion" | "practica";
  readonly titulo: string;
  readonly minutos: number;
  /** Solo para lecciones: hay un `lesson_completed` del alumno. Las prácticas no llevan marca. */
  readonly hecha: boolean;
}

export interface DiaDelCalendario {
  /** `YYYY-MM-DD`. */
  readonly fecha: string;
  readonly minutos: number;
  readonly tareas: readonly TareaDelCalendario[];
}

/**
 * Todas las tareas del plan activo agrupadas por día, con título de lección o
 * nombre de skill y la marca de hecha. Se lee con la sesión del tutor
 * (`plan_tareas_select_dueno_o_tutor`); solo las lecciones completadas
 * (`learning_events`) salen de `service_role`, como en `leccionesCompletadas`.
 * Vacío si no hay plan.
 */
export async function calendarioDelPlanActivo(
  studentId: string,
  planId: string,
): Promise<DiaDelCalendario[]> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const [tareasRes, completadas] = await Promise.all([
    supabase
      .from("plan_tareas")
      .select(
        "id, fecha, ord, tipo, minutos, lesson_id, subjects(code), lessons(title), skills(name)",
      )
      .eq("plan_id", planId)
      .eq("student_id", studentId)
      .order("fecha", { ascending: true })
      .order("ord", { ascending: true }),
    leccionesCompletadas(studentId),
  ]);
  if (tareasRes.error !== null || tareasRes.data === null) return [];

  const primero = (v: unknown): Fila | null => {
    if (Array.isArray(v)) return esFila(v[0]) ? v[0] : null;
    return esFila(v) ? v : null;
  };

  const porFecha = new Map<string, TareaDelCalendario[]>();
  for (const bruta of tareasRes.data) {
    if (!esFila(bruta)) continue;
    const id = texto(bruta["id"]);
    const fecha = texto(bruta["fecha"]);
    const ord = entero(bruta["ord"]);
    const tipo = bruta["tipo"];
    const minutos = numero(bruta["minutos"]) ?? 0;
    if (id === null || fecha === null || ord === null) continue;
    if (tipo !== "leccion" && tipo !== "practica") continue;
    const codeBruto = primero(bruta["subjects"])?.["code"];
    const titulo =
      tipo === "leccion"
        ? tituloDesdeI18n(primero(bruta["lessons"])?.["title"])
        : tituloDesdeI18n(primero(bruta["skills"])?.["name"]);
    const lessonId = texto(bruta["lesson_id"]);
    const tarea: TareaDelCalendario = {
      id,
      ord,
      code: esCodigoMateria(codeBruto) ? codeBruto : null,
      tipo,
      titulo,
      minutos,
      hecha: tipo === "leccion" && lessonId !== null && completadas.has(lessonId),
    };
    const lista = porFecha.get(fecha.slice(0, 10)) ?? [];
    lista.push(tarea);
    porFecha.set(fecha.slice(0, 10), lista);
  }

  return [...porFecha.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, tareas]) => ({
      fecha,
      minutos: tareas.reduce((n, t) => n + t.minutos, 0),
      tareas: [...tareas].sort((a, b) => a.ord - b.ord),
    }));
}
