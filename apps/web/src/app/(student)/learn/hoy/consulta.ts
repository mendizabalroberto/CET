import type { I18nText } from "@cet/shared";

import { getSessionProfile } from "@/lib/auth/session";
import { hoyEnZona } from "@/lib/plan/fecha";
import { createClient } from "@/lib/supabase/server";

/**
 * Lectura de las tareas de hoy del plan de estudio.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El alumno no puede leer `planes_de_estudio`; para saber si tiene plan se
 * mira si existe alguna `plan_tareas` suya, de cualquier fecha. Las dos
 * consultas son independientes y se lanzan en paralelo. Ningún fallo de base
 * de datos puede propagarse: la función devuelve `{ estado: "error" }`.
 */

export interface FilaTarea {
  readonly id: string;
  readonly fecha: string;
  readonly ord: number;
  readonly tipo: "leccion" | "practica";
  readonly minutos: number | null;
  readonly lesson_id: string | null;
  readonly subjects: ReadonlyArray<{ readonly code: string; readonly name: I18nText }> | null;
  readonly lessons: ReadonlyArray<{ readonly title: I18nText }> | null;
  readonly skills: ReadonlyArray<{ readonly code: string; readonly name: I18nText }> | null;
}

export type TareasDeHoyResultado =
  | { readonly estado: "ok"; readonly hayPlan: boolean; readonly filas: FilaTarea[] }
  | { readonly estado: "error" };

export async function tareasDeHoy(): Promise<TareasDeHoyResultado> {
  try {
    const perfil = await getSessionProfile();
    if (perfil === null || perfil.role !== "student") {
      return { estado: "error" };
    }

    const supabase = await createClient();
    const hoy = hoyEnZona();

    const [tareas, plan] = await Promise.all([
      supabase
        .from("plan_tareas")
        .select(
          "id, fecha, ord, tipo, minutos, lesson_id, subjects(code, name), lessons(title), skills(code, name)",
        )
        .eq("student_id", perfil.id)
        .eq("fecha", hoy)
        .order("ord", { ascending: true }),
      supabase
        .from("plan_tareas")
        .select("id", { count: "exact", head: true })
        .eq("student_id", perfil.id),
    ]);

    if (tareas.error !== null || plan.error !== null) {
      return { estado: "error" };
    }

    return {
      estado: "ok",
      hayPlan: (plan.count ?? 0) > 0,
      filas: (tareas.data ?? []) as FilaTarea[],
    };
  } catch {
    return { estado: "error" };
  }
}
