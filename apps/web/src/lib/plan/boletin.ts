/**
 * Extracción y validación de boletines de notas.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * La parte pura: recibe el texto del PDF y el JSON crudo del modelo, y devuelve
 * el boletín ya validado y mapeado a las materias que la app cubre. La llamada
 * HTTP vive en `deepseek.ts`; aquí no hay red.
 */
import { z } from "zod";

import type { Banda, BoletinExtraido, CodigoMateria } from "./tipos";

/** Forma exacta que debe devolver el modelo. */
export const extraccionCrudaSchema: z.ZodType<{
  gestion: number;
  trimestre: number | null;
  notas: { materia: string; nota: number }[];
}> = z.object({
  gestion: z.number().int().min(2020).max(2100),
  trimestre: z.number().int().min(1).max(3).nullable(),
  notas: z
    .array(
      z.object({
        materia: z.string().trim().min(1),
        nota: z.number().int().min(0).max(100),
      }),
    )
    .min(1),
});

/** La escala impresa en el boletín. */
export function bandaDeNota(nota: number): Banda {
  if (nota >= 91) return "outstanding";
  if (nota >= 81) return "well_done";
  if (nota >= 71) return "good";
  if (nota >= 61) return "satisfactory";
  if (nota >= 51) return "needs_improvement";
  return "failing";
}

/** Normaliza una cadena: minúsculas, sin acentos, espacios colapsados. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const SINONIMOS: Readonly<Record<CodigoMateria, readonly string[]>> = {
  english: ["english", "ingles"],
  math: ["math", "maths", "mathematics", "matematicas", "matematica"],
  science: ["science", "sciences", "ciencias", "ciencias naturales"],
  spanish: ["spanish", "espanol", "lengua", "lenguaje", "castellano"],
  socials: ["social studies", "socials", "sociales", "ciencias sociales", "estudios sociales"],
  ict: [
    "ict",
    "information & communication technology",
    "information and communication technology",
    "computacion",
    "informatica",
    "tic",
  ],
};

/** Mapea el nombre de una materia a su código, o null si la app no la cubre. */
export function mapearMateria(materia: string): CodigoMateria | null {
  const n = normalizar(materia);
  for (const [code, sinonimos] of Object.entries(SINONIMOS) as [
    CodigoMateria,
    readonly string[],
  ][]) {
    if (sinonimos.some((s) => n === s || n === `${s}(s)`)) return code;
  }
  return null;
}

/** Error de validación de la extracción. */
export class ExtraccionInvalidaError extends Error {
  readonly motivo: "forma" | "materia_inventada";

  constructor(motivo: "forma" | "materia_inventada", message?: string) {
    super(message ?? `Extracción inválida: ${motivo}`);
    this.name = "ExtraccionInvalidaError";
    this.motivo = motivo;
  }
}

/** Colapsa runs de espacios/saltos a un solo espacio y recorta. */
function normalizarEspacios(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Valida la salida cruda del modelo contra el texto del PDF.
 *
 * Dos puertas duras: la forma (esquema) y que toda materia exista literalmente
 * en el texto. Solo después se mapea a las materias de la app.
 */
export function validarExtraccion(textoDelPdf: string, salidaCruda: unknown): BoletinExtraido {
  const parsed = extraccionCrudaSchema.safeParse(salidaCruda);
  if (!parsed.success) {
    throw new ExtraccionInvalidaError("forma");
  }

  const textoNormalizado = normalizarEspacios(textoDelPdf);
  for (const { materia } of parsed.data.notas) {
    if (!textoNormalizado.includes(materia)) {
      throw new ExtraccionInvalidaError("materia_inventada", `Materia no encontrada en el texto: ${materia}`);
    }
  }

  const trimestre = parsed.data.trimestre as 1 | 2 | 3 | null;
  return {
    gestion: parsed.data.gestion,
    trimestre,
    notas: parsed.data.notas.map(({ materia, nota }) => ({
      materia,
      code: mapearMateria(materia),
      nota,
      banda: bandaDeNota(nota),
    })),
  };
}

/** Instrucciones para el modelo que extrae las notas del boletín. */
export function promptDeExtraccion(textoDelPdf: string): {
  readonly system: string;
  readonly user: string;
} {
  return {
    system:
      "Eres un extractor de boletines de notas. Responde SOLO con un objeto JSON " +
      "con esta forma exacta: " +
      '{"gestion": number, "trimestre": number | null, "notas": [{"materia": string, "nota": number}]}. ' +
      "gestion es el año lectivo (entero entre 2020 y 2100). trimestre es el número " +
      "del trimestre cuyas notas están presentes (1, 2 o 3), o null si no se distingue. " +
      "notas es un arreglo con al menos una fila; cada nota es un entero entre 0 y 100. " +
      "Copia los nombres de materia CARÁCTER A CARÁCTER tal como aparecen en el texto, " +
      "sin traducir, sin abreviar y sin inventar materias ni notas. " +
      "AVERAGES, la asistencia y los comentarios del tutor NO son materias: no los incluyas.",
    user: `Extrae las notas del siguiente boletín:\n---\n${textoDelPdf}\n---`,
  };
}
