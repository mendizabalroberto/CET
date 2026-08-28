/**
 * La matriz de autorización es la pieza más fácil de romper sin darse cuenta.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { afterEach, describe, expect, it } from "vitest";

import { findProtectedArea, homeForRole, isApiPath, isPublicPath } from "./routes";

describe("las vistas previas de /dev", () => {
  // El valor de `NODE_ENV` se lee en cada llamada, no al importar el modulo:
  // por eso se puede cambiar aqui y volver a preguntar.
  const original = process.env.NODE_ENV;
  afterEach(() => {
    poner(original);
  });
  // `process.env` no acepta `defineProperty`: solo asignacion. El cast es la
  // forma que tiene TypeScript de dejarnos escribir en una propiedad que
  // declara de solo lectura, y aqui es legitimo porque es exactamente lo que
  // hace el entorno al arrancar.
  const poner = (v: string | undefined) => {
    (process.env as Record<string, string | undefined>)["NODE_ENV"] = v;
  };

  it("en desarrollo son publicas: si no, el middleware las manda a /login y el 404 de la propia pagina nunca llega a correr", () => {
    poner("development");
    expect(isPublicPath("/dev/keyboard-preview")).toBe(true);
    expect(isPublicPath("/dev")).toBe(true);
  });

  it("en produccion NO lo son", () => {
    poner("production");
    expect(isPublicPath("/dev/keyboard-preview")).toBe(false);
  });

  it("no se deja enganar por una ruta que solo EMPIECE por /dev", () => {
    poner("development");
    expect(isPublicPath("/development-secreto")).toBe(false);
    expect(isPublicPath("/devops")).toBe(false);
  });
});

describe("isPublicPath", () => {
  it("acepta las rutas públicas y sus subrutas", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/privacy")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/login/student")).toBe(true);
    expect(isPublicPath("/register/sent")).toBe(true);
    // `/logout` tiene que ser alcanzable por alguien cuya sesión ya no sirve, o
    // se produce un bucle de redirecciones entre el login y su portada.
    expect(isPublicPath("/logout")).toBe(true);
  });

  it("no se deja engañar por un prefijo que solo COMIENZA igual", () => {
    // Sin esta comprobación, `/loginfalso` sería pública.
    expect(isPublicPath("/loginfalso")).toBe(false);
    expect(isPublicPath("/privacy-leak")).toBe(false);
  });

  it("no considera pública una ruta arbitraria", () => {
    expect(isPublicPath("/admin")).toBe(false);
    expect(isPublicPath("/learn")).toBe(false);
    expect(isPublicPath("/api/events")).toBe(false);
  });
});

describe("isApiPath", () => {
  it("reconoce las rutas de API, que el middleware NO debe reescribir", () => {
    // Regresión: cuando `/api/events` no estaba exento, el middleware la
    // reescribía a la página 404 y la cola de telemetría recibía HTML donde
    // esperaba JSON, reintentando en bucle sin enterarse.
    expect(isApiPath("/api/events")).toBe(true);
    expect(isApiPath("/api/health")).toBe(true);
    expect(isApiPath("/api")).toBe(true);
  });

  it("no confunde una página cuyo nombre empieza por api", () => {
    expect(isApiPath("/apiary")).toBe(false);
    expect(isApiPath("/learn/api")).toBe(false);
  });
});

describe("findProtectedArea", () => {
  it("devuelve 404 (no 403) para las áreas privilegiadas", () => {
    expect(findProtectedArea("/admin")?.onDeny).toBe("not-found");
    expect(findProtectedArea("/admin/schools")?.onDeny).toBe("not-found");
    expect(findProtectedArea("/teach")?.onDeny).toBe("not-found");
    expect(findProtectedArea("/reports/mastery")?.onDeny).toBe("not-found");
  });

  it("no deja a un alumno entrar en el área de personal", () => {
    expect(findProtectedArea("/admin")?.allow).not.toContain("student");
    expect(findProtectedArea("/teach")?.allow).not.toContain("student");
  });

  it("no deja al personal entrar en el área de alumno", () => {
    expect(findProtectedArea("/learn")?.allow).toEqual(["student"]);
  });

  it("permite a cualquier rol con sesión cambiar su propio PIN", () => {
    const area = findProtectedArea("/account/pin");
    expect(area?.allow).toContain("student");
    expect(area?.allow).toContain("teacher");
  });

  it("devuelve undefined para una ruta no catalogada, que el middleware trata como denegada", () => {
    expect(findProtectedArea("/ruta-inventada")).toBeUndefined();
  });
});

describe("homeForRole", () => {
  it("manda a cada rol a su portada", () => {
    expect(homeForRole("student")).toBe("/learn");
    expect(homeForRole("teacher")).toBe("/teach");
    expect(homeForRole("school_admin")).toBe("/admin");
    expect(homeForRole("superadmin")).toBe("/admin");
    expect(homeForRole(null)).toBe("/");
  });
});
