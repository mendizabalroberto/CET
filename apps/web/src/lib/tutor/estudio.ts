/**
 * Lo que el hijo HIZO: tiempo por lección y detalle de su práctica.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Vive aparte de `queries.ts` porque contesta otra pregunta. Aquel resuelve
 * «quién es este hijo y qué puede ver de él este adulto»; esto resuelve «qué
 * estuvo haciendo», que es lectura de telemetría y tiene sus propias reglas de
 * ventana y de tope.
 *
 * ===========================================================================
 * TODO VA CON LA SESIÓN DEL TUTOR
 * ===========================================================================
 * `informe_alumno_tiempo_por_leccion` llama a `app.puede_ver_informe()` en su
 * primera línea (0062), y `learning_events` se lee bajo
 * `learning_events_select_own`, que desde 0059 se apoya en
 * `app.puede_ver_alumno`. Es el motor quien decide si este adulto alcanza a
 * este menor. Aquí no se escribe ninguna comprobación de pertenencia —
 * escribirla sería una segunda copia de la regla de acceso a datos de un menor,
 * y dos copias divergen.
 *
 * ===========================================================================
 * NO LANZA
 * ===========================================================================
 * Como el resto de lecturas de esta casa: si una consulta falla se devuelve
 * `null` y la página decide qué enseñar. Un informe incompleto es mejor que la
 * pantalla roja de `app/error.tsx`. Y los fallos se registran (R4): un cero por
 * un `grant` que falta se ve en pantalla exactamente igual que un niño que no
 * ha practicado, y solo el registro los distingue.
 */
import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import {
  resumirPractica,
  TIPOS_DE_PRACTICA,
  type FilaDeEvento,
  type PracticaDeHijo,
} from "./practica";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La ventana de todo lo de este módulo.
 *
 * Son los mismos 90 días que ya usa el alumno en `practice-progress.ts`. Dos
 * ventanas distintas para el mismo niño serían un fallo silencioso: el chip que
 * ve él y la tabla que ve su padre hablarían de periodos distintos sin que
 * ninguna de las dos pantallas lo dijera.
 */
export const DIAS_DE_ESTUDIO = 90;

/**
 * Tope de filas de telemetría por consulta.
 *
 * Acota el coste pase lo que pase con el histórico. Cuando se alcanza, el
 * resumen viene marcado como truncado y la pantalla lo dice: un recuento
 * cortado que se presenta como total es peor que no darlo.
 */
export const MAX_FILAS = 1000;

function desde(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

/* ========================================================================== */
/* Tiempo por lección                                                          */
/* ========================================================================== */

export interface EstudioDeLeccion {
  /** Minutos de estudio en esa lección. Los mide o los estima la base (0083). */
  readonly minutos: number;
  /** Veces que se sentó con ella. */
  readonly visitas: number;
  /** Veces que la abrió (`lesson_opened`). */
  readonly aperturas: number;
}

/**
 * Cuánto tiempo ha pasado el hijo en cada lección.
 *
 * Lo calcula la BASE y no esta función, y eso importa: `app.minutos_de_sesion`
 * (0083) decide por sesión entre el tiempo MEDIDO por el navegador
 * (`tiempo_en_pantalla.msActivos`, con el reloj parado cuando la pestaña está
 * oculta o el niño lleva un minuto sin tocar nada) y el ESTIMADOR de huecos de
 * 0064 para las sesiones antiguas que no lo traen. Hay una sola definición de
 * «tiempo de estudio» en este producto y es esa. Reimplementarla aquí habría
 * dado una segunda cifra que un día no cuadraría con la del informe, y el padre
 * no tendría forma de saber cuál de las dos creerse.
 *
 * Devuelve `null` si la consulta falla, para que la pantalla pueda callarse en
 * vez de escribir «0 min» sobre una lección que el niño sí estudió.
 */
export const tiempoPorLeccion = cache(async function tiempoPorLeccion(
  studentId: string,
  dias: number = DIAS_DE_ESTUDIO,
): Promise<ReadonlyMap<string, EstudioDeLeccion> | null> {
  if (!UUID_RE.test(studentId)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("informe_alumno_tiempo_por_leccion", {
    p_student_id: studentId,
    p_desde: desde(dias),
    p_hasta: new Date().toISOString(),
  });

  if (error !== null) {
    console.error("[cet] tiempoPorLeccion", error.code, error.message);
    return null;
  }

  const salida = new Map<string, EstudioDeLeccion>();
  for (const fila of (data ?? []) as Record<string, unknown>[]) {
    const id = fila["leccion_id"];
    if (typeof id !== "string") continue;
    const minutos = Number(fila["minutos"]);
    salida.set(id, {
      minutos: Number.isFinite(minutos) && minutos > 0 ? minutos : 0,
      visitas: Number(fila["visitas"]) || 0,
      aperturas: Number(fila["aperturas"]) || 0,
    });
  }
  return salida;
});

/* ========================================================================== */
/* La práctica, una a una                                                      */
/* ========================================================================== */

/**
 * Qué practicó el hijo, en qué acertó, en qué falló y dónde pidió ayuda.
 *
 * Se piden las cuatro columnas que se usan y no la fila entera: `payload` ya es
 * lo más gordo que viaja, y `learning_events` guarda además el contexto de
 * sesión de cada evento, que aquí no se mira.
 *
 * El orden descendente es parte del contrato de `resumirPractica`: «los últimos
 * intentos» son las primeras filas.
 *
 * @param maxIntentos cuántos intentos detallados devolver como mucho.
 */
export const practicaDeHijo = cache(async function practicaDeHijo(
  studentId: string,
  maxIntentos: number,
  dias: number = DIAS_DE_ESTUDIO,
): Promise<PracticaDeHijo | null> {
  if (!UUID_RE.test(studentId)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learning_events")
    .select("event_type, server_ts, payload")
    // La RLS ya limita a los alumnos que este adulto alcanza; el filtro
    // explícito es la regla transversal 2 de `MODULES.md`.
    .eq("student_id", studentId)
    .in("event_type", [...TIPOS_DE_PRACTICA])
    .gte("server_ts", desde(dias))
    .order("server_ts", { ascending: false })
    .limit(MAX_FILAS);

  if (error !== null) {
    console.error("[cet] practicaDeHijo", error.code, error.message);
    return null;
  }

  const filas = (data ?? []) as FilaDeEvento[];
  return resumirPractica(filas, { maxIntentos, truncado: filas.length >= MAX_FILAS });
});
