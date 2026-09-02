/**
 * Tipos del repartidor de planes de estudio.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Es la frontera de §8 del diseño (docs/superpowers/specs/2026-09-02-planes-de-
 * estudio-design.md): la IA decide CUÁNTO a cada materia (los `peso`), el
 * código decide QUÉ DÍA y QUÉ TAREA. Todo lo que entra aquí es dato ya leído
 * de la base; el repartidor no toca red ni base y es determinista.
 */

/** Fecha de calendario sin hora, `YYYY-MM-DD`. El plan vive en días, no en instantes. */
export type FechaISO = string;

export type TipoEventoEscolar =
  | "feriado"
  | "sin_clases"
  | "examenes_finales"
  | "vacaciones"
  | "fin_trimestre"
  | "hito_cambridge";

/** Un tramo del calendario escolar. `desde` y `hasta` son inclusivos. */
export interface EventoCalendario {
  readonly desde: FechaISO;
  readonly hasta: FechaISO;
  readonly tipo: TipoEventoEscolar;
}

export interface LeccionDisponible {
  readonly lessonId: string;
  /** Orden del módulo dentro del curso, y de la lección dentro del módulo. */
  readonly moduloOrd: number;
  readonly ord: number;
  /** `lessons.estimated_minutes`, ya rellenado (nunca 0 ni null aquí). */
  readonly minutos: number;
  readonly completada: boolean;
}

export interface SkillDisponible {
  readonly skillId: string;
  readonly ord: number;
  /** Preguntas publicadas de esa skill. Con 0 no se puede practicar. */
  readonly preguntas: number;
  /** 0..1 desde `skill_mastery`, o `null` si no hay historial. */
  readonly mastery: number | null;
}

export interface MateriaDelPlan {
  readonly subjectId: string;
  /** `subjects.code`: english | ict | math | science | socials | spanish. */
  readonly code: string;
  /** Peso del estratega, ya normalizado: los pesos de la entrada suman 1. */
  readonly peso: number;
  readonly lecciones: readonly LeccionDisponible[];
  readonly skills: readonly SkillDisponible[];
}

export interface EntradaReparto {
  readonly desde: FechaISO;
  readonly hasta: FechaISO;
  /** El compromiso que firmó el tutor, 10..180. */
  readonly minutosPorDia: number;
  readonly materias: readonly MateriaDelPlan[];
  readonly calendario: readonly EventoCalendario[];
}

export type TipoTarea = "leccion" | "practica";

/** Una fila de `plan_tareas`. Exactamente una de `lessonId`/`skillId` va informada. */
export interface Tarea {
  readonly fecha: FechaISO;
  readonly ord: number;
  readonly subjectId: string;
  readonly tipo: TipoTarea;
  readonly lessonId: string | null;
  readonly skillId: string | null;
  /** 5..25: ningún bloque pasa de 25 minutos (§8.2 regla 4). */
  readonly minutos: number;
}

/** Un techo de munición que se activó (§8.2 regla 3). Se muestra al tutor. */
export interface TechoDeMateria {
  readonly subjectId: string;
  readonly code: string;
  /** Lo que el peso pedía para toda la ventana. */
  readonly minutosPedidos: number;
  /** Lo que el contenido existente permite planificar. */
  readonly minutosDisponibles: number;
}

export interface Reparto {
  readonly tareas: readonly Tarea[];
  readonly techos: readonly TechoDeMateria[];
  /** Suma de `tareas[].minutos`. */
  readonly minutosPlanificados: number;
  /** Presupuesto de la ventana tras calendario e intensidad, antes de techos. */
  readonly minutosPresupuestados: number;
}
