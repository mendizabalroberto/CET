import { z } from "zod";
import {
  MATERIAS_CON_CONTENIDO,
  type CodigoMateria,
  type NotaExtraida,
  type Propuesta,
} from "./tipos";

export interface InventarioDeMateria {
  readonly code: CodigoMateria;
  readonly leccionesPublicadas: number;
  readonly leccionesCompletadas: number;
  readonly minutosEstimados: number;
  readonly preguntasPublicadas: number;
}

export interface EntradaEstratega {
  readonly nombreDePila: string;
  readonly notas: readonly NotaExtraida[];
  readonly inventario: readonly InventarioDeMateria[];
  readonly ventana: {
    readonly desde: string;
    readonly hasta: string;
    readonly hito: string;
  };
  readonly minutosPorDiaObservados: number | null;
}

const pesoNoNegativo = z
  .number()
  .refine((v) => Number.isFinite(v) && v >= 0, { message: "peso_invalido" });

export const propuestaCrudaSchema: z.ZodType<{
  minutos_por_dia: number;
  reparto: Record<string, number>;
  recomendaciones: string[];
}> = z.object({
  minutos_por_dia: z.number().int().min(10).max(180),
  reparto: z.record(z.string(), pesoNoNegativo),
  recomendaciones: z.array(z.string().trim().min(1).max(400)).max(6),
});

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

export function validarPropuesta(salidaCruda: unknown): Propuesta {
  const resultado = propuestaCrudaSchema.safeParse(salidaCruda);
  if (!resultado.success) {
    throw new PropuestaInvalidaError();
  }
  return {
    minutosPorDia: resultado.data.minutos_por_dia,
    reparto: normalizarReparto(resultado.data.reparto),
    recomendaciones: resultado.data.recomendaciones,
  };
}

const CLAVES_PERMITIDAS = MATERIAS_CON_CONTENIDO.join(", ");

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

  const system = [
    "Eres un planificador de estudio para un niño de 10–11 años; escribes a un adulto.",
    "Responde solo con un JSON válido con esta forma exacta:",
    '{ "minutos_por_dia": 45, "reparto": { "english": 0.4, "math": 0.3, "spanish": 0.3 }, "recomendaciones": ["frase"] }',
    `En "reparto" usa SOLO las claves ${CLAVES_PERMITIDAS}.`,
    "Los pesos de esas claves suman 1.",
    "No inventes materias. No cites cifras medidas de estudio en las recomendaciones; la aritmética la hace el repartidor.",
    "Una materia con poco contenido publicado no puede absorber mucho tiempo aunque su nota sea baja.",
    "recomendaciones: de 0 a 6 frases breves para un adulto.",
  ].join("\n");

  const user = [
    `Alumno: ${entrada.nombreDePila}`,
    "Boletín (code null = no se planifica):",
    JSON.stringify(datosNotas, null, 2),
    "Inventario de contenido publicado:",
    JSON.stringify(entrada.inventario, null, 2),
    "Ventana y hito:",
    JSON.stringify(entrada.ventana, null, 2),
    `Minutos por día observados: ${historial}`,
  ].join("\n");

  return { system, user };
}
