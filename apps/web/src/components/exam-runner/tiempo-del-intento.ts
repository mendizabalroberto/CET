/**
 * El tiempo activo del intento, de la pantalla del examen a la del resultado.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ HACE FALTA UN PASO DE MANO Y NO SE CALCULA EN EL RESULTADO
 * ===========================================================================
 * El examen NO lleva un segundo reloj visible: ya tiene su cuenta atrás, y dos
 * cronómetros en la pantalla de un niño de once años es como se le agobia. Pero
 * sí enseña el tiempo TRANSCURRIDO en el resumen final, y ahí aparece un
 * problema de fontanería: al entregar se navega a otra ruta (`router.replace`),
 * y el cronómetro —que vive en memoria del corredor— se desmonta con ella.
 *
 * La tentación sería recalcularlo en el resultado como `submittedAt - startedAt`.
 * Sería OTRA definición de tiempo: incluiría el rato con la pestaña oculta, y
 * podría decirle al alumno «has estado 40 minutos» de un examen en el que
 * estuvo veinticinco. Este producto tiene UNA definición de tiempo —la de
 * `supabase/migrations/0064_tiempo_de_estudio.sql`— y quien la mide es el
 * cronómetro activo. Así que no se recalcula: se pasa el número medido.
 *
 * `sessionStorage` y no `localStorage`: el dato solo tiene sentido en esta
 * pestaña y en este rato. Sobrevivir al cierre del navegador para reaparecer una
 * semana después bajo un examen distinto sería un fallo, no una virtud.
 *
 * Todo va envuelto en `try`: el modo privado y las políticas de algunos
 * colegios hacen que `sessionStorage` LANCE al tocarlo. Un examen entregado no
 * se cae por no poder guardar un adorno del resumen.
 */

const PREFIJO = "cet:examen:tiempo:";

/** Guarda los milisegundos ACTIVOS del intento. Silencioso si no puede. */
export function guardarTiempoDelIntento(attemptId: string, msActivos: number): void {
  if (typeof sessionStorage === "undefined") return;
  if (!Number.isFinite(msActivos) || msActivos < 0) return;
  try {
    sessionStorage.setItem(`${PREFIJO}${attemptId}`, String(Math.round(msActivos)));
  } catch {
    /* sin almacenamiento: el resumen sale sin la línea del tiempo */
  }
}

/**
 * Los milisegundos activos del intento, o `null` si no los hay.
 *
 * `null` significa «no lo sabemos» y quien llama NO debe pintar un cero: llegar
 * al resultado por un enlace, desde otra pestaña o al día siguiente son casos
 * normales, y «has estado 0 minutos» sería una mentira sobre el trabajo de un
 * niño. Se calla, que es lo único honesto.
 */
export function leerTiempoDelIntento(attemptId: string): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const crudo = sessionStorage.getItem(`${PREFIJO}${attemptId}`);
    if (crudo === null) return null;
    const valor = Number(crudo);
    return Number.isFinite(valor) && valor >= 0 ? valor : null;
  } catch {
    return null;
  }
}
