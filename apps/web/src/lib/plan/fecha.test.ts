/**
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it } from "vitest";

import { hoyEnZona, sumarDias, ZONA_HORARIA_DEL_PLAN } from "./fecha";

describe("hoyEnZona", () => {
  it("corta el dia en Bolivia, no en UTC", () => {
    // 02:30 UTC del 3 de septiembre son las 22:30 del 2 en La Paz (UTC-4).
    const instante = new Date("2026-09-03T02:30:00Z");
    expect(hoyEnZona(ZONA_HORARIA_DEL_PLAN, instante)).toBe("2026-09-02");
    expect(hoyEnZona("UTC", instante)).toBe("2026-09-03");
  });

  it("devuelve siempre YYYY-MM-DD", () => {
    expect(hoyEnZona()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("sumarDias", () => {
  it("cruza el mes y el ano", () => {
    expect(sumarDias("2026-09-30", 1)).toBe("2026-10-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-09-02", -2)).toBe("2026-08-31");
  });
});
