/**
 * @cet/ui — la materia se reconoce sin color.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Hermano de `estados-no-solo-color.test.tsx`, y por la misma razon: en
 * deuteranopia los seis colores de materia son el mismo color, y en escala de
 * grises el mismo gris. Lo que este fichero vigila es que quede SIEMPRE otro
 * canal —la silueta— y que ese canal sea de verdad distinto entre materias.
 *
 * La comprobacion de las siluetas no es cosmetica. Si alguien "unifica" los
 * iconos a una familia parecida, o copia y pega un `d` de otra materia, la
 * pantalla sigue viendose bien en su monitor y deja de funcionar para uno de
 * cada doce ninos varones. Aqui se pone rojo.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SubjectIcon } from "../src/navigation/SubjectIcon.js";
import {
  SUBJECT_CODES,
  UNKNOWN_SUBJECT,
  subjectIdentity,
} from "../src/navigation/subject-identity.js";

function pathOf(code: string): string {
  const { container } = render(<SubjectIcon code={code} />);
  const path = container.querySelector("path");
  expect(path).not.toBeNull();
  return path?.getAttribute("d") ?? "";
}

describe("subjectIdentity", () => {
  it.each(SUBJECT_CODES)("%s apunta a sus dos tokens y a ninguno mas", (code) => {
    const identity = subjectIdentity(code);
    expect(identity.code).toBe(code);
    expect(identity.fill).toBe(`var(--cet-materia-${code})`);
    expect(identity.soft).toBe(`var(--cet-materia-${code}-suave)`);
  });

  it("da a cada materia conocida un sitio distinto y estable en la rejilla", () => {
    const orders = SUBJECT_CODES.map((code) => subjectIdentity(code).order);
    expect(new Set(orders).size).toBe(SUBJECT_CODES.length);
  });

  /*
   * El caso que rompe produccion sin que nadie lo note en desarrollo: el colegio
   * da de alta `music`. `var(--cet-materia-music)` no existe, y en CSS un token
   * que no existe es transparente — tarjeta invisible.
   */
  it.each(["music", "pe", "", "MATH", "math2"])(
    "un code desconocido (%s) cae en la identidad neutra, no en un token inventado",
    (code) => {
      const identity = subjectIdentity(code);
      expect(identity.code).toBe(UNKNOWN_SUBJECT);
      expect(identity.fill).toBe("var(--cet-materia-otra)");
    },
  );

  it("manda las materias desconocidas detras de las conocidas", () => {
    const known = SUBJECT_CODES.map((code) => subjectIdentity(code).order);
    expect(subjectIdentity("music").order).toBeGreaterThan(Math.max(...known));
  });
});

describe("SubjectIcon", () => {
  it("dibuja una silueta DISTINTA para cada materia", () => {
    const paths = [...SUBJECT_CODES, "music"].map(pathOf);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("no trae color propio: hereda el del contenedor que lo ha medido", () => {
    const { container } = render(<SubjectIcon code="math" />);
    const svg = container.querySelector("svg");
    expect(svg?.outerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(container.querySelector("path")?.getAttribute("stroke")).toBe("currentColor");
  });

  it("es decorativo: el nombre de la materia va escrito al lado", () => {
    const { container } = render(<SubjectIcon code="science" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
  });
});
