/**
 * @cet/ui — INVARIANTE: un boton no puede perder el color de su texto por el
 * camino.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUE FALLO CIERRA ESTE FICHERO
 * ===========================================================================
 * `Button` compone sus clases en este orden: base, variante, tamano. La
 * variante `primary` aporta `text-[var(--cet-on-primary)]`; el tamano `md`
 * aporta `text-body`. Las dos empiezan por `text-`, y `tailwind-merge` —que no
 * lee la configuracion de Tailwind y no conoce nuestra escala— las metia en el
 * mismo grupo y se quedaba con la ultima. El color desaparecia del atributo
 * `class` sin que nadie lo notara.
 *
 * En pantalla: «Comprobar» pintado en `#12202f` sobre `#173a63`, que es
 * **1.53:1**. El token decia 11.53:1 y decia la verdad; lo que no llegaba a la
 * pantalla era el token.
 *
 * `contraste-tokens.test.ts` no podia cazarlo: mide los hexadecimales de la
 * hoja, no si el componente llega a usarlos. Este fichero cubre justo ese hueco
 * —del token a la clase— y por eso son dos tests y no uno.
 *
 * ===========================================================================
 * LO QUE SE VIGILA
 * ===========================================================================
 * 1. Que cada variante con tinta propia la conserve en TODOS los tamanos.
 * 2. Que la lista de tamanos que `cn.ts` le declara a `tailwind-merge` siga
 *    siendo la del preset. Anadir `text-caption` al preset y olvidarse de aqui
 *    reabre el mismo agujero en silencio.
 */

import { describe, expect, it } from "vitest";
import { cn, CET_FONT_SIZES } from "../src/lib/cn.js";
import { cetPreset } from "../src/tailwind-preset.js";

/** Las variantes que traen tinta propia, y el token que tienen que conservar. */
const CON_TINTA_PROPIA = [
  ["primary", "--cet-on-primary"],
  ["accent", "--cet-on-amber"],
  ["danger", "--cet-on-danger"],
] as const;

/** Los tamanos de `Button`, con la clase de tipografia que aporta cada uno. */
const TAMANOS = ["text-body-sm", "text-body", "text-body-lg"] as const;

describe("un boton conserva la tinta de su variante", () => {
  it.each(CON_TINTA_PROPIA)("la variante %s conserva %s en todos los tamanos", (_v, token) => {
    for (const tamano of TAMANOS) {
      const clases = cn(
        "inline-flex items-center justify-center gap-2 rounded-sm font-semibold",
        `bg-[var(--cet-primary)] text-[var(${token})] border border-transparent`,
        `min-h-touch px-5 ${tamano}`,
      );
      expect(
        clases,
        `con ${tamano}, tailwind-merge se comio text-[var(${token})]: el boton pinta su ` +
          `texto con la tinta heredada y el contraste que promete el token no llega a la pantalla.`,
      ).toContain(`text-[var(${token})]`);
      // Y el tamano tiene que seguir ahi: la solucion no puede ser perder el otro.
      expect(clases).toContain(tamano);
    }
  });

  it("un color que llega DESPUES sigue ganando al de la variante", () => {
    // La razon de ser de `cn` es que el `className` de fuera mande. Declarar la
    // escala no puede romper eso: dos colores siguen siendo un conflicto real.
    const clases = cn("text-[var(--cet-on-primary)] text-body", "text-[var(--cet-ink)]");
    expect(clases).toContain("text-[var(--cet-ink)]");
    expect(clases).not.toContain("text-[var(--cet-on-primary)]");
  });

  it("la escala declarada a tailwind-merge es la del preset", () => {
    // Sin esto, anadir un tamano al preset y olvidarlo aqui reabre el agujero
    // sin poner nada rojo.
    const delPreset = Object.keys(cetPreset.theme?.extend?.fontSize ?? {});
    expect(delPreset.length).toBeGreaterThan(0);
    expect([...CET_FONT_SIZES].sort()).toEqual(delPreset.sort());
  });
});
