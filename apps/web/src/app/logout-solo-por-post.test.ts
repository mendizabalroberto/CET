/**
 * `/logout` no se enlaza NUNCA con un <Link>.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL FALLO QUE ESTE FICHERO EXISTE PARA ATRAPAR
 * ─────────────────────────────────────────────────────────────────────────────
 * La zona del tutor tenía `<Link href={ROUTES.logout}>` en su cabecera, y eso
 * cerraba la sesión del padre SIN QUE NADIE PULSARA NADA. Next.js prefetcha los
 * enlaces en cuanto entran en pantalla, y prefetchar `/logout` es ejecutarlo:
 * la respuesta traía `Set-Cookie: sb-…-auth-token=; Max-Age=0` y el siguiente
 * clic se encontraba con un 404 mudo, porque `/tutor` es zona privada y su 404
 * es deliberadamente silencioso.
 *
 * Se veía como un fallo aleatorio —a veces la ficha del hijo abría, a veces
 * no— porque dependía de cuándo decidiera prefetchar el navegador. Lo destapó
 * el e2e de la cadena de invitación leyendo las cabeceras `Set-Cookie`.
 *
 * La cabecera de `app/logout/route.ts` ya fijaba la regla: esa ruta es el
 * destino de un `redirect()` del servidor, «no un enlace que un tercero pueda
 * hacer pulsar», y el cierre de sesión desde la interfaz usa la Server Action
 * `signOut`, que va por POST. Esta prueba es lo que impide que la regla vuelva
 * a romperse en la próxima pantalla que alguien añada.
 *
 * NO SIRVE PONER `prefetch={false}`. Seguiría siendo una navegación GET que
 * cualquier acelerador del navegador, extensión o rastreador puede disparar. La
 * regla es un formulario, no un enlace con adornos.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..");

function ficherosDeInterfaz(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...ficherosDeInterfaz(ruta));
    } else if (ruta.endsWith(".tsx")) {
      salida.push(ruta);
    }
  }
  return salida;
}

/** `href={ROUTES.logout}` y `href="/logout"`, con o sin espacios de por medio. */
const ENLACE_A_LOGOUT = /href\s*=\s*(?:\{\s*ROUTES\.logout\s*\}|["']\/logout["'])/;

describe("la salida de sesión va por POST", () => {
  it("ningún componente enlaza /logout con un href", () => {
    const culpables = ficherosDeInterfaz(RAIZ)
      .filter((ruta) => ENLACE_A_LOGOUT.test(readFileSync(ruta, "utf8")))
      .map((ruta) => ruta.slice(RAIZ.length + 1));

    expect(
      culpables,
      "Un href a /logout se prefetcha solo y cierra la sesión sin que el usuario pulse nada. Usa <form action={signOut}>, como (staff) y (student).",
    ).toEqual([]);
  });

  it("las zonas con sesión cierran con la Server Action", () => {
    for (const zona of ["(staff)", "(student)", "(tutor)"]) {
      const layout = readFileSync(join(RAIZ, "app", zona, "layout.tsx"), "utf8");
      expect(layout, `${zona}/layout.tsx no usa <form action={signOut}>`).toContain(
        "action={signOut}",
      );
    }
  });
});
