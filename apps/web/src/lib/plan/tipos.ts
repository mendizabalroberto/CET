/**
 * Tipos compartidos del plan de estudio (lado app).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Ver docs/superpowers/specs/2026-09-02-planes-de-estudio-design.md §7–§9.
 */

/** Las seis materias con contenido en la plataforma. Solo éstas se planifican. */
export const MATERIAS_CON_CONTENIDO = [
  "english",
  "ict",
  "math",
  "science",
  "socials",
  "spanish",
] as const;

export type CodigoMateria = (typeof MATERIAS_CON_CONTENIDO)[number];

/**
 * La escala impresa en el propio boletín («Grade Breakdown»):
 *   Outstanding 91–100 · Well Done 81–90 · Good 71–80 · Satisfactory 61–70 ·
 *   Needs Improvement 51–60 · Failing ≤ 50.
 */
export type Banda =
  | "outstanding"
  | "well_done"
  | "good"
  | "satisfactory"
  | "needs_improvement"
  | "failing";

/** Una fila de `boletines.notas`. `code` es null cuando la app no cubre la materia. */
export interface NotaExtraida {
  readonly materia: string;
  readonly code: CodigoMateria | null;
  readonly nota: number;
  readonly banda: Banda;
}

export interface BoletinExtraido {
  readonly gestion: number;
  readonly trimestre: 1 | 2 | 3 | null;
  readonly notas: readonly NotaExtraida[];
}

/**
 * Qué leer y qué practicar primero en una materia (§7.2). Los ids son
 * EXACTAMENTE los del inventario que vio el modelo; `validarPropuesta` filtra
 * lo que no lo sea. `porQue` es una frase para un adulto, sin cifras medidas.
 */
export interface PrioridadDeMateria {
  readonly lecciones: readonly string[];
  readonly skills: readonly string[];
  readonly porQue: string;
}

/** Lo que devuelve el estratega (§8.1/§7.2), ya validado y con el reparto normalizado. */
export interface Propuesta {
  readonly minutosPorDia: number;
  /** Pesos por `CodigoMateria`, suman 1, sin claves ajenas ni ceros. */
  readonly reparto: Readonly<Partial<Record<CodigoMateria, number>>>;
  /** Como máximo 6. Texto para un adulto, nunca cifras medidas. */
  readonly recomendaciones: readonly string[];
  /** Puede faltar: el modelo no siempre lo da, y el repartidor sigue sin él. */
  readonly prioridades?: Readonly<Partial<Record<CodigoMateria, PrioridadDeMateria>>>;
}
