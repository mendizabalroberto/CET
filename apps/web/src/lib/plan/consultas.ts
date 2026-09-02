import { z } from "zod";
import type { EntradaReparto, EventoCalendario, MateriaDelPlan, TechoDeMateria } from "@cet/engine";
import type { InventarioDeMateria } from "./estratega";
import { hoyEnZona, sumarDias } from "./fecha";
import { MATERIAS_CON_CONTENIDO, type Banda, type CodigoMateria } from "./tipos";

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

export const repartoGuardadoSchema: z.ZodType<RepartoGuardado> = z.object({
  pesos: pesosGuardadosSchema,
  techos: z.array(techoDeMateriaSchema),
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
}

export interface MateriaInventario {
  readonly subjectId: string;
  readonly code: CodigoMateria;
  readonly lecciones: readonly {
    readonly lessonId: string;
    readonly moduloOrd: number;
    readonly ord: number;
    readonly minutos: number;
  }[];
  readonly skills: readonly {
    readonly skillId: string;
    readonly code: string;
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

  return {
    id,
    boletinId,
    desde,
    hasta,
    minutosPorDia,
    reparto: repartoResultado.data,
    recomendaciones,
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
    supabase.from("course_modules").select("id, course_id, ord").in("course_id", courseIds),
    supabase
      // `skills` no tiene `status`: la skill existe o no; lo publicado son
      // sus preguntas, que se cuentan mas abajo.
      .from("skills")
      .select("id, course_id, code, ord")
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

  const modulos: { id: string; courseId: string; ord: number }[] = [];
  for (const bruta of modulosRes.data ?? []) {
    if (!esFila(bruta)) continue;
    const id = texto(bruta["id"]);
    const courseId = texto(bruta["course_id"]);
    const ord = entero(bruta["ord"]);
    if (id !== null && courseId !== null && ord !== null) {
      modulos.push({ id, courseId, ord });
    }
  }

  const moduloPorId = new Map<string, { courseId: string; ord: number }>();
  for (const m of modulos) moduloPorId.set(m.id, m);

  const skills: { id: string; courseId: string; code: string; ord: number }[] = [];
  for (const bruta of skillsRes.data ?? []) {
    if (!esFila(bruta)) continue;
    const id = texto(bruta["id"]);
    const courseId = texto(bruta["course_id"]);
    const code = texto(bruta["code"]);
    const ord = entero(bruta["ord"]);
    if (id !== null && courseId !== null && code !== null && ord !== null) {
      skills.push({ id, courseId, code, ord });
    }
  }

  const moduleIds = modulos.map((m) => m.id);
  const lessonsRes =
    moduleIds.length > 0
      ? await supabase
          .from("lessons")
          .select("id, module_id, ord, estimated_minutes")
          .in("module_id", moduleIds)
          .eq("status", "published")
      : { data: [], error: null };
  if (lessonsRes.error !== null) return [];

  const lecciones: {
    id: string;
    moduleId: string;
    ord: number;
    minutos: number;
  }[] = [];
  for (const bruta of lessonsRes.data ?? []) {
    if (!esFila(bruta)) continue;
    const id = texto(bruta["id"]);
    const moduleId = texto(bruta["module_id"]);
    const ord = entero(bruta["ord"]);
    const minutos = numero(bruta["estimated_minutes"]);
    if (id !== null && moduleId !== null && ord !== null && minutos !== null) {
      lecciones.push({ id, moduleId, ord, minutos });
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

export async function masteryDeAlumno(studentId: string): Promise<ReadonlyMap<string, number>> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient(
    "Leer skill_mastery del alumno para armar la entrada del plan",
  );
  const { data, error } = await supabase
    .from("skill_mastery")
    .select("skill_id, mastery")
    .eq("student_id", studentId);

  const resultado = new Map<string, number>();
  if (error !== null) return resultado;
  for (const bruta of data ?? []) {
    if (!esFila(bruta)) continue;
    const skillId = texto(bruta["skill_id"]);
    const mastery = numero(bruta["mastery"]);
    if (skillId !== null && mastery !== null && mastery >= 0 && mastery <= 1) {
      resultado.set(skillId, mastery);
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

export async function calendarioDelPlan(gestion: number): Promise<EventoCalendario[]> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendario_eventos")
    .select("desde, hasta, tipo")
    .eq("gestion", gestion)
    .order("desde", { ascending: true });

  if (error !== null || data === null) return [];
  const resultado: EventoCalendario[] = [];
  for (const bruta of data) {
    if (!esFila(bruta)) continue;
    const parse = eventoCalendarioSchema.safeParse(bruta);
    if (parse.success) resultado.push(parse.data);
  }
  return resultado;
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

export function armarInventarioEstratega(
  inventario: readonly MateriaInventario[],
  completadas: ReadonlySet<string>,
): InventarioDeMateria[] {
  return inventario.map((materia) => ({
    code: materia.code,
    leccionesPublicadas: materia.lecciones.length,
    leccionesCompletadas: materia.lecciones.reduce(
      (n, leccion) => n + (completadas.has(leccion.lessonId) ? 1 : 0),
      0,
    ),
    minutosEstimados: materia.lecciones.reduce((n, leccion) => n + leccion.minutos, 0),
    preguntasPublicadas: materia.skills.reduce((n, skill) => n + skill.preguntas, 0),
  }));
}

export function armarEntradaReparto(p: {
  readonly desde: string;
  readonly hasta: string;
  readonly minutosPorDia: number;
  readonly pesos: Partial<Record<CodigoMateria, number>>;
  readonly inventario: readonly MateriaInventario[];
  readonly completadas: ReadonlySet<string>;
  readonly mastery: ReadonlyMap<string, number>;
  readonly calendario: readonly EventoCalendario[];
}): EntradaReparto {
  const materias: MateriaDelPlan[] = [];

  for (const materia of p.inventario) {
    const peso = p.pesos[materia.code];
    if (typeof peso !== "number" || !Number.isFinite(peso) || peso <= 0) {
      continue;
    }

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
        mastery: p.mastery.get(skill.skillId) ?? null,
      })),
    });
  }

  return {
    desde: p.desde,
    hasta: p.hasta,
    minutosPorDia: p.minutosPorDia,
    materias,
    calendario: p.calendario,
  };
}
