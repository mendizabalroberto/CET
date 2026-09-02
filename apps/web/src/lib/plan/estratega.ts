import { z } from "zod";
import {
  MATERIAS_CON_CONTENIDO,
  type CodigoMateria,
  type NotaExtraida,
  type PrioridadDeMateria,
  type Propuesta,
} from "./tipos";

/** Una lección del inventario detallado que ve el estratega (§7.1). */
export interface LeccionDetallada {
  readonly id: string;
  readonly titulo: string;
  readonly modulo: string;
  readonly minutos: number;
  readonly completada: boolean;
}

/** Una skill del inventario detallado que ve el estratega (§7.1). */
export interface SkillDetallada {
  readonly id: string;
  readonly code: string;
  readonly nombre: string;
  readonly preguntas: number;
  /** 0..1, o `null` sin historial. */
  readonly mastery: number | null;
  /** `YYYY-MM-DD`, o `null` sin práctica registrada. */
  readonly ultimaPractica: string | null;
}

/** La actividad de una materia en los últimos 28 días (§7.1). */
export interface ActividadReciente {
  readonly minutos: number;
  readonly items: number;
  readonly porcentajeAcierto: number | null;
  readonly leccionesCompletadas: number;
}

/**
 * El detalle por materia que sustituye a los cuatro totales de la primera
 * ronda (§7.1): el modelo ve lecciones y skills concretas, no solo cuántas
 * hay, para poder decir QUÉ leer y QUÉ practicar.
 */
export interface InventarioDetalladoDeMateria {
  readonly code: CodigoMateria;
  readonly lecciones: readonly LeccionDetallada[];
  readonly skills: readonly SkillDetallada[];
  readonly reciente: ActividadReciente;
}

/** Una de las últimas lecciones que terminó el alumno (§7.1). */
export interface UltimaLeccion {
  readonly titulo: string;
  readonly code: CodigoMateria;
  readonly fecha: string;
}

export interface EntradaEstratega {
  readonly nombreDePila: string;
  readonly notas: readonly NotaExtraida[];
  readonly inventario: readonly InventarioDetalladoDeMateria[];
  readonly ultimasLecciones: readonly UltimaLeccion[];
  readonly ventana: {
    readonly desde: string;
    readonly hasta: string;
    readonly hito: string;
  };
  readonly minutosPorDiaObservados: number | null;
  /**
   * El idioma del alumno (AD-7): `recomendaciones` y cada `por_que` se
   * escriben en este idioma, nunca mezclados, para que el tutor lea el plan
   * en el idioma en el que ya usa la app.
   */
  readonly idioma: "es" | "en";
  /**
   * Lo que el tutor escribió al pedir el plan («¡más matemáticas!»). Va al
   * modelo como una preferencia de la familia, no como un dato medido: pesa
   * en el reparto si el inventario lo permite. `null` si no escribió nada.
   */
  readonly indicacionDelTutor?: string | null;
  /**
   * Los exámenes próximos del alumno (0095), de hoy en adelante. Las
   * materias con examen próximo pesan más en el reparto y las
   * `prioridades`/recomendaciones deben apuntar a lo que entra en ese
   * examen; un examen sin materia (general) afecta a todas.
   */
  readonly examenes: readonly { fecha: string; code: CodigoMateria | null; titulo: string }[];
}

const pesoNoNegativo = z
  .number()
  .refine((v) => Number.isFinite(v) && v >= 0, { message: "peso_invalido" });

const prioridadCrudaSchema = z.object({
  lecciones: z.array(z.string()).max(64),
  skills: z.array(z.string()).max(32),
  por_que: z.string().trim().min(1).max(200),
});

export const propuestaCrudaSchema = z.object({
  minutos_por_dia: z.number().int().min(10).max(180),
  reparto: z.record(z.string(), pesoNoNegativo),
  recomendaciones: z.array(z.string().trim().min(1).max(400)).max(6),
  prioridades: z.record(z.string(), prioridadCrudaSchema).optional(),
});

export type PropuestaCruda = z.infer<typeof propuestaCrudaSchema>;

export class PropuestaInvalidaError extends Error {
  constructor() {
    super("propuesta_invalida");
  }
}

export function normalizarReparto(
  reparto: Record<string, number>
): Partial<Record<CodigoMateria, number>> {
  const pesos: Partial<Record<CodigoMateria, number>> = {};
  let suma = 0;
  for (const code of MATERIAS_CON_CONTENIDO) {
    const peso = reparto[code];
    if (typeof peso !== "number" || !Number.isFinite(peso) || peso <= 0) {
      continue;
    }
    pesos[code] = peso;
    suma += peso;
  }
  if (suma === 0) {
    throw new PropuestaInvalidaError();
  }
  for (const code of MATERIAS_CON_CONTENIDO) {
    const peso = pesos[code];
    if (peso !== undefined) {
      pesos[code] = peso / suma;
    }
  }
  return pesos;
}

const MAX_LECCIONES_PRIORIDAD = 8;
const MAX_SKILLS_PRIORIDAD = 6;

function esCodigoMateria(value: string): value is CodigoMateria {
  return (MATERIAS_CON_CONTENIDO as readonly string[]).includes(value);
}

/**
 * Filtra las `prioridades` crudas contra el inventario que de verdad vio el
 * modelo: ids que no existan en esa materia, o de lecciones ya completadas,
 * se descartan (§7.2) — «el modelo PRIORIZA, el código PLANIFICA» empieza por
 * no confiar ciegamente en lo que devolvió.
 */
function filtrarPrioridades(
  crudo: PropuestaCruda["prioridades"],
  inventario: readonly InventarioDetalladoDeMateria[],
): Partial<Record<CodigoMateria, PrioridadDeMateria>> | undefined {
  if (crudo === undefined) return undefined;

  const inventarioPorMateria = new Map(inventario.map((materia) => [materia.code, materia]));
  const resultado: Partial<Record<CodigoMateria, PrioridadDeMateria>> = {};

  for (const [clave, prioridad] of Object.entries(crudo)) {
    if (!esCodigoMateria(clave)) continue;
    const materia = inventarioPorMateria.get(clave);
    if (materia === undefined) continue;

    const leccionesNoCompletadas = new Set(
      materia.lecciones.filter((leccion) => !leccion.completada).map((leccion) => leccion.id),
    );
    const skillsConocidas = new Set(materia.skills.map((skill) => skill.id));

    const lecciones = prioridad.lecciones
      .filter((id) => leccionesNoCompletadas.has(id))
      .slice(0, MAX_LECCIONES_PRIORIDAD);
    const skills = prioridad.skills
      .filter((id) => skillsConocidas.has(id))
      .slice(0, MAX_SKILLS_PRIORIDAD);

    if (lecciones.length === 0 && skills.length === 0) continue;

    resultado[clave] = { lecciones, skills, porQue: prioridad.por_que };
  }

  return Object.keys(resultado).length > 0 ? resultado : undefined;
}

export function validarPropuesta(
  salidaCruda: unknown,
  inventarioDetallado: readonly InventarioDetalladoDeMateria[],
): Propuesta {
  const resultado = propuestaCrudaSchema.safeParse(salidaCruda);
  if (!resultado.success) {
    throw new PropuestaInvalidaError();
  }
  const prioridades = filtrarPrioridades(resultado.data.prioridades, inventarioDetallado);
  return {
    minutosPorDia: resultado.data.minutos_por_dia,
    reparto: normalizarReparto(resultado.data.reparto),
    recomendaciones: resultado.data.recomendaciones,
    ...(prioridades !== undefined ? { prioridades } : {}),
  };
}

const CLAVES_PERMITIDAS = MATERIAS_CON_CONTENIDO.join(", ");
const MAX_LECCIONES_PROMPT = 40;
const MAX_SKILLS_PROMPT = 20;

/**
 * Recorta las lecciones de una materia para el prompt: como máximo
 * `MAX_LECCIONES_PROMPT`, priorizando las no completadas EN SU ORDEN y
 * rellenando con las completadas restantes solo si hace falta (§7.2).
 */
function recortarLecciones(lecciones: readonly LeccionDetallada[]): LeccionDetallada[] {
  if (lecciones.length <= MAX_LECCIONES_PROMPT) return [...lecciones];
  const noCompletadas = lecciones.filter((l) => !l.completada);
  const completadas = lecciones.filter((l) => l.completada);
  return [...noCompletadas, ...completadas].slice(0, MAX_LECCIONES_PROMPT);
}

function recortarSkills(skills: readonly SkillDetallada[]): SkillDetallada[] {
  return skills.slice(0, MAX_SKILLS_PROMPT);
}

export function promptDeEstratega(entrada: EntradaEstratega): {
  readonly system: string;
  readonly user: string;
} {
  const datosNotas = entrada.notas.map(({ materia, code, nota, banda }) => ({
    materia,
    code: code ?? "no se planifica",
    nota,
    banda,
  }));
  const historial =
    entrada.minutosPorDiaObservados === null
      ? "sin historial"
      : entrada.minutosPorDiaObservados;

  const inventarioParaPrompt = entrada.inventario.map((materia) => ({
    code: materia.code,
    lecciones: recortarLecciones(materia.lecciones),
    skills: recortarSkills(materia.skills),
    reciente: materia.reciente,
  }));
  const huboRecorte = entrada.inventario.some(
    (materia) => materia.lecciones.length > MAX_LECCIONES_PROMPT || materia.skills.length > MAX_SKILLS_PROMPT,
  );
  const instruccionDeIdioma =
    entrada.idioma === "en"
      ? 'Write "recomendaciones" and every "por_que" in ENGLISH, never mixed with Spanish.'
      : 'Escribe "recomendaciones" y cada "por_que" en ESPAÑOL, nunca mezclado con inglés.';

  const system = [
    "Eres un planificador de estudio para un niño de 10–11 años; escribes a un adulto.",
    "Responde solo con un JSON válido con esta forma exacta:",
    '{ "minutos_por_dia": 45, "reparto": { "english": 0.4, "math": 0.3, "spanish": 0.3 }, "recomendaciones": ["frase"], "prioridades": { "math": { "lecciones": ["<id>"], "skills": ["<id>"], "por_que": "frase" } } }',
    `En "reparto" usa SOLO las claves ${CLAVES_PERMITIDAS}.`,
    "Los pesos de esas claves suman 1.",
    "No inventes materias. No cites cifras medidas de estudio en las recomendaciones; la aritmética la hace el repartidor.",
    "Una materia con poco contenido publicado no puede absorber mucho tiempo aunque su nota sea baja.",
    "recomendaciones: de 0 a 6 frases breves para un adulto.",
    instruccionDeIdioma,
    "Si hay una indicación del tutor, dale prioridad en el reparto siempre que el inventario lo permita, y recógela en una recomendación.",
    "Las materias con examen próximo pesan más en el reparto, y sus prioridades y recomendaciones deben apuntar a lo que entra en ese examen; un examen sin materia (general) afecta a todas por igual.",
    '"prioridades" es opcional, una entrada por materia con contenido. Los ids de "lecciones" y "skills" deben ser EXACTAMENTE los ids del inventario de esa materia (campo "id"); un id inventado o que no esté en el inventario se descarta.',
    "No incluyas en \"lecciones\" ninguna que el inventario marque \"completada\": true.",
    "Prioriza lecciones no completadas relacionadas con las notas más bajas, y skills con mastery bajo o sin ninguna práctica todavía (ultimaPractica null).",
    'Como máximo 8 lecciones y 6 skills por materia en "prioridades".',
    '"por_que" es una frase breve para un adulto (máximo 200 caracteres) que explique por qué esas lecciones y skills primero; nunca cifras medidas.',
    ...(huboRecorte
      ? [
          `El inventario de alguna materia se recortó a ${MAX_LECCIONES_PROMPT} lecciones y ${MAX_SKILLS_PROMPT} skills, mostrando primero lo no completado en su orden.`,
        ]
      : []),
  ].join("\n");

  const user = [
    `Alumno: ${entrada.nombreDePila}`,
    "Boletín (code null = no se planifica):",
    JSON.stringify(datosNotas, null, 2),
    "Inventario detallado de contenido publicado (por materia: lecciones, skills, actividad de los últimos 28 días):",
    JSON.stringify(inventarioParaPrompt, null, 2),
    "Últimas lecciones que completó el alumno:",
    JSON.stringify(entrada.ultimasLecciones, null, 2),
    "Ventana y hito:",
    JSON.stringify(entrada.ventana, null, 2),
    `Minutos por día observados: ${historial}`,
    "Exámenes próximos del alumno:",
    entrada.examenes.length === 0
      ? "ninguno"
      : JSON.stringify(
          entrada.examenes.map(({ fecha, code, titulo }) => ({
            fecha,
            code: code ?? "general",
            titulo,
          })),
          null,
          2,
        ),
    ...(entrada.indicacionDelTutor
      ? [`Indicación del tutor: ${JSON.stringify(entrada.indicacionDelTutor)}`]
      : []),
  ].join("\n");

  return { system, user };
}
