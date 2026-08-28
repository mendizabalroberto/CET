/**
 * INVARIANTE: ninguna cabecera que construya el cliente de servicio sale de ASCII.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ FAMILIA CAZA ESTE FICHERO
 * ===========================================================================
 * Una cabecera HTTP no admite caracteres fuera de ASCII. Si se cuela uno,
 * `fetch` no manda la petición y `supabase-js` devuelve
 * `{"message":"Something went wrong"}` — sin código y sin decir qué cabecera
 * fue. El motivo real no aparece en ningún log.
 *
 * El 28 de agosto de 2026 eso dejó a TODOS los alumnos sin poder empezar un
 * examen. El motivo de escalada del motor dice «corrección», la «ó» caía dentro
 * del recorte de 120 caracteres, y `/api/attempts/start` devolvía 500 con
 * «findInProgressAttempt falló: ? Something went wrong». Se tardó en encontrar
 * porque el síntoma apuntaba a la base de datos y la causa estaba en una tilde.
 *
 * Los motivos se escriben en español porque así lo pide el repositorio, así que
 * el acento va a volver. Lo que no puede volver es que llegue a la cabecera.
 */
import { describe, expect, it } from "vitest";

import { aAscii } from "./ascii";

/** Lo que de verdad exige una cabecera HTTP: ASCII imprimible. */
const SOLO_ASCII = /^[\x20-\x7e]*$/;

describe("aAscii — el motivo de escalada puede viajar en una cabecera", () => {
  it("pliega los acentos a su letra base, y el motivo se sigue leyendo", () => {
    expect(aAscii("corrección")).toBe("correccion");
    expect(aAscii("materia de Matemáticas y Ciencias")).toBe("materia de Matematicas y Ciencias");
  });

  it("el motivo real del motor de examen queda en ASCII y no pierde sentido", () => {
    // Es el texto exacto de `api/attempts/_context.ts`, el que tumbó la pantalla.
    const real =
      "Motor de examen autoritativo (M09): el alumno no tiene INSERT en las tablas de intento y la corrección necesita answer_key, revocada por columna a authenticated.";

    const cabecera = aAscii(real).slice(0, 120);
    expect(cabecera).toMatch(SOLO_ASCII);
    expect(cabecera).toContain("correccion");
  });

  it("la eñe tambien, que es la letra que mas va a aparecer aqui", () => {
    expect(aAscii("año de enseñanza")).toBe("ano de ensenanza");
  });

  it("lo que no tiene letra base se cae, en vez de tumbar la peticion", () => {
    // Comillas tipográficas, guiones largos y emoji: nada de esto tiene
    // equivalente ASCII, y una cabecera incompleta es mejor que una peticion
    // que no sale.
    expect(aAscii("«motivo» — 🚀")).toMatch(SOLO_ASCII);
  });

  it("no toca lo que ya era ASCII", () => {
    const plano = "Motor de examen (M09): el alumno no tiene INSERT.";
    expect(aAscii(plano)).toBe(plano);
  });

  it("cualquier texto, salga de donde salga, acaba en ASCII", () => {
    // El caso general: es lo que impide que esto vuelva por un motivo nuevo que
    // nadie ha escrito todavia.
    for (const texto of [
      "acentos: áéíóú ÁÉÍÓÚ",
      "eñe y cedilla: ñÑ çÇ",
      "diéresis: güe ü",
      "moneda y signos: € ± ° ¿? ¡!",
      "griego y cirilico: λ Ж",
      "emoji: 🎓📐",
    ]) {
      expect(aAscii(texto), `no quedo en ASCII: ${texto}`).toMatch(SOLO_ASCII);
    }
  });
});
