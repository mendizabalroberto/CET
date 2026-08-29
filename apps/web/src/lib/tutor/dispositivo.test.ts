/**
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Solo se prueba `familiaDeAgente`, que es la parte pura. Las tres funciones de
 * cookie son un envoltorio de `next/headers` y probarlas aqui seria probar a
 * Next; lo que si se prueba es la constante de vida de la cookie, porque un
 * cero de mas convierte "un ano" en "un siglo".
 */
import { describe, expect, it } from "vitest";

import { COOKIE_DISPOSITIVO, familiaDeAgente, VIDA_COOKIE_SEGUNDOS } from "./dispositivo";

describe("familiaDeAgente", () => {
  it("reduce a algo que un padre reconoce", () => {
    expect(familiaDeAgente("Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0")).toBe(
      "Chrome en Android",
    );
  });

  it("nunca devuelve el user-agent completo", () => {
    const ua = "Mozilla/5.0 (algo raro que nadie ha visto)";
    expect(familiaDeAgente(ua)).toBe("Navegador");
    expect(familiaDeAgente(null)).toBe("Navegador");
  });

  it("degrada a Navegador cuando falta la mitad del par", () => {
    // Navegador reconocible, sistema no: sigue sin poder devolverse nada que
    // arrastre la cadena original.
    const soloNavegador = "Chrome/120.0.0.0 (SistemaOperativoInventado)";
    expect(familiaDeAgente(soloNavegador)).toBe("Navegador");
    expect(familiaDeAgente("   ")).toBe("Navegador");
  });

  it("no filtra ningun fragmento del user-agent en su salida", () => {
    // La huella digital de un menor no puede salir ni a trozos: la salida debe
    // ser una de las etiquetas del vocabulario cerrado, y nada mas.
    const agentes = [
      "Mozilla/5.0 (Linux; Android 14; SM-A536B Build/UP1A.231005.007) Chrome/120.0.0.0",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) Safari/605.1.15",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/120.0.0.0",
      "Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0",
      "curl/8.4.0",
    ];
    const permitidas = new Set([
      "Navegador",
      "Chrome en Android",
      "Safari en iPad o iPhone",
      "Edge en Windows",
      "Firefox en Linux",
    ]);
    for (const ua of agentes) {
      const familia = familiaDeAgente(ua);
      expect(permitidas.has(familia)).toBe(true);
      expect(ua).not.toBe(familia);
      // Ni el modelo del aparato ni el numero de version sobreviven.
      expect(familia).not.toMatch(/\d/);
    }
  });
});

describe("la cookie del dispositivo", () => {
  it("se llama igual que lo que lee el login y dura un ano", () => {
    expect(COOKIE_DISPOSITIVO).toBe("cet_device");
    expect(VIDA_COOKIE_SEGUNDOS).toBe(31_536_000);
  });
});
