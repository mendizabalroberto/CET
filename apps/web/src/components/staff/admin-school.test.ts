/**
 * El selector de colegio del panel, que es también una frontera de tenant.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it } from "vitest";

import { resolveAdminSchool } from "./admin-school";

const CAMBRIDGE = "00000000-0000-4000-8000-000000000001";
const OTRO = "00000000-0000-4000-8000-000000000002";
const SCHOOLS = [{ id: CAMBRIDGE }, { id: OTRO }];

describe("resolveAdminSchool · superadmin", () => {
  it("carga el colegio que ha elegido", () => {
    expect(resolveAdminSchool({ role: "superadmin", schoolId: null }, CAMBRIDGE, SCHOOLS)).toBe(
      CAMBRIDGE,
    );
  });

  it("sin elección devuelve null: toca enseñar el selector, no un panel vacío", () => {
    const viewer = { role: "superadmin", schoolId: null } as const;
    expect(resolveAdminSchool(viewer, null, SCHOOLS)).toBeNull();
    expect(resolveAdminSchool(viewer, "", SCHOOLS)).toBeNull();
    expect(resolveAdminSchool(viewer, undefined, SCHOOLS)).toBeNull();
  });

  it("descarta un uuid que no está en la lista", () => {
    // Sin esto, un uuid inventado llega a las consultas y devuelve un panel
    // vacío con el nombre del colegio en blanco: indistinguible de una avería.
    const inventado = "00000000-0000-4000-8000-00000000ffff";
    expect(resolveAdminSchool({ role: "superadmin", schoolId: null }, inventado, SCHOOLS)).toBeNull();
  });

  it("descarta la basura sin intentar interpretarla", () => {
    const viewer = { role: "superadmin", schoolId: null } as const;
    expect(resolveAdminSchool(viewer, "'; drop table profiles; --", SCHOOLS)).toBeNull();
    expect(resolveAdminSchool(viewer, "../../etc/passwd", SCHOOLS)).toBeNull();
  });
});

describe("resolveAdminSchool · el resto del personal", () => {
  it("IGNORA el parámetro: un school_admin no cambia de colegio por la URL", () => {
    // Escalada horizontal de libro. RLS lo pararía igual y `queries.ts` filtra
    // a mano, pero esta es la primera de las tres capas y la más barata.
    expect(resolveAdminSchool({ role: "school_admin", schoolId: CAMBRIDGE }, OTRO, SCHOOLS)).toBe(
      CAMBRIDGE,
    );
  });

  it("tampoco se lo salta un teacher", () => {
    expect(resolveAdminSchool({ role: "teacher", schoolId: CAMBRIDGE }, OTRO, SCHOOLS)).toBe(
      CAMBRIDGE,
    );
  });

  it("un school_admin sin parámetro sigue viendo el suyo", () => {
    expect(resolveAdminSchool({ role: "school_admin", schoolId: CAMBRIDGE }, null, SCHOOLS)).toBe(
      CAMBRIDGE,
    );
  });
});
