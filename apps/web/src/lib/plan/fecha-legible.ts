/**
 * Pintar una fecha del plan. © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

/**
 * Una fecha civil («2026-08-24», sin hora) se pinta tal cual es, en cualquier
 * zona horaria. `new Date("2026-08-24")` es la medianoche UTC, y en La Paz
 * (UTC-4) `toLocaleDateString` la enseñaba como el 23: el plan «empezaba» un
 * día antes y el feriado del 24 caía en 23. Medido en `/dev/plan-preview` el
 * 02/09/2026. Un instante con hora (`createdAt`, `confirmadoAt`) sí se
 * convierte a la hora local, que es lo que se espera de un instante.
 */
export function fechaLegible(iso: string, locale: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  const idioma = locale === "es" ? "es-ES" : "en-GB";
  const esFechaCivil = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return esFechaCivil
    ? fecha.toLocaleDateString(idioma, { timeZone: "UTC" })
    : fecha.toLocaleDateString(idioma);
}
