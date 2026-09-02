/**
 * El calendario de exámenes del colegio, leído por el modelo.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Misma frontera que el boletín (`boletin.ts`): el modelo devuelve fechas y
 * nombres de materia tal cual aparecen; el CÓDIGO decide qué materia es
 * (`mapearMateria`, el mismo mapa de sinónimos) y rechaza lo que no es una
 * fecha real. Sin cita literal, pero con las mismas dos puertas: Zod sobre la
 * forma, y cada `materia` devuelta tiene que aparecer literal en el texto del
 * documento, para que el modelo no invente asignaturas.
 */
import { z } from "zod";

import { mapearMateria } from "./boletin";
import type { CodigoMateria } from "./tipos";

const MAX_EXAMENES = 60;

export interface ExamenExtraido {
  /** `YYYY-MM-DD`. */
  readonly fecha: string;
  /** Lo que ponía en el documento, para el título. */
  readonly materia: string;
  /** Materia con contenido en la app, o `null` si no la cubre (sigue contando como examen). */
  readonly code: CodigoMateria | null;
}

export const examenesCrudosSchema: z.ZodType<{
  examenes: { fecha: string; materia: string }[];
}> = z.object({
  examenes: z
    .array(
      z.object({
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        materia: z.string().trim().min(1).max(80),
      }),
    )
    .max(MAX_EXAMENES),
});

export class ExtraccionDeExamenesInvalidaError extends Error {
  constructor(motivo: string) {
    super(`extraccion_de_examenes_invalida: ${motivo}`);
  }
}

function esFechaReal(fecha: string): boolean {
  const [y, m, d] = fecha.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d;
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Valida la salida del modelo contra el texto del documento. Se queda solo
 * con fechas reales y materias que aparezcan literalmente (ignorando tildes y
 * mayúsculas) en el PDF; una materia inventada tumba la extracción entera,
 * igual que en el boletín. Devuelve la lista sin duplicados, ordenada por fecha.
 */
export function validarExamenes(textoDelPdf: string, salidaCruda: unknown): ExamenExtraido[] {
  const resultado = examenesCrudosSchema.safeParse(salidaCruda);
  if (!resultado.success) throw new ExtraccionDeExamenesInvalidaError("forma");

  const texto = normalizar(textoDelPdf);
  const vistos = new Set<string>();
  const examenes: ExamenExtraido[] = [];
  for (const fila of resultado.data.examenes) {
    if (!esFechaReal(fila.fecha)) throw new ExtraccionDeExamenesInvalidaError("fecha");
    const materia = fila.materia.trim();
    if (!texto.includes(normalizar(materia))) {
      throw new ExtraccionDeExamenesInvalidaError("materia_no_esta_en_el_texto");
    }
    const clave = `${fila.fecha}|${normalizar(materia)}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    examenes.push({ fecha: fila.fecha, materia, code: mapearMateria(materia) });
  }
  if (examenes.length === 0) throw new ExtraccionDeExamenesInvalidaError("vacio");
  return examenes.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function promptDeExtraccionDeExamenes(
  textoDelPdf: string,
  gestion: number,
): { readonly system: string; readonly user: string } {
  return {
    system:
      "Eres un extractor de calendarios de exámenes escolares. Responde SOLO con un objeto JSON " +
      'con esta forma exacta: {"examenes": [{"fecha": "YYYY-MM-DD", "materia": string}]}. ' +
      `Si el documento no indica el año, el año lectivo es ${gestion}. ` +
      "Una fila por examen y materia; si un mismo día hay varias materias, una fila por cada una. " +
      "Copia los nombres de materia CARÁCTER A CARÁCTER tal como aparecen en el texto, sin traducir " +
      "ni abreviar. No inventes fechas ni materias. Los feriados, las entregas de notas y las " +
      "reuniones NO son exámenes: no los incluyas.",
    user: `Extrae los exámenes del siguiente calendario:\n---\n${textoDelPdf}\n---`,
  };
}
