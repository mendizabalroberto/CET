/**
 * /not-found — destino interno de las denegaciones que deben parecer un 404.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El middleware REESCRIBE aquí (no redirige: la URL del navegador no cambia)
 * cuando alguien pide un área privilegiada sin permiso. `notFound()` renderiza
 * `app/not-found.tsx` con un 404 real.
 *
 * ¿Por qué no reescribir directamente a una ruta interna de Next? Porque no es
 * una API pública y cambia entre versiones. Una página propia de una línea es
 * más aburrida y no se rompe sola.
 *
 * Si alguien visita `/not-found` a mano, ve exactamente lo mismo: un 404. No
 * hay nada que descubrir aquí.
 */
import { notFound } from "next/navigation";

export default function NotFoundRewriteTarget(): never {
  notFound();
}
