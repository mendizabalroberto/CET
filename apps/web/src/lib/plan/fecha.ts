/**
 * El «hoy» del plan de estudio.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `plan_tareas.fecha` es una fecha civil, y una fecha civil solo existe dentro
 * de una zona horaria. El colegio está en Bolivia y el parte nocturno corre a
 * las 21:00 de allí (spec §11), así que el día del plan se corta en esa zona:
 * un servidor en UTC preguntando `current_date` a las 02:00 ya estaría en
 * mañana mientras el niño todavía cena.
 *
 * Es una constante y no un dato por alumno A PROPÓSITO: hoy hay un colegio y
 * una familia. El día que haya dos zonas, esto se convierte en un campo.
 */
export const ZONA_HORARIA_DEL_PLAN = "America/La_Paz";

/** `YYYY-MM-DD` del instante `ahora` visto desde `zona`. */
export function hoyEnZona(zona: string = ZONA_HORARIA_DEL_PLAN, ahora: Date = new Date()): string {
  // `en-CA` es el único locale corto que formatea como ISO (YYYY-MM-DD).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** `fecha` + `dias`, en el mismo formato. Sin zona: es aritmética civil. */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const ms = Date.UTC(y, m - 1, d) + dias * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
