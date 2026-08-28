/**
 * El tema por defecto es CLARO, no el del dispositivo.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUE ESTE TEST EXISTE
 *
 * `getTheme()` devolvia `system` cuando no habia cookie, y eso dejaba que el
 * modo oscuro del telefono decidiera con que contraste estudia un nino. La
 * leccion se diseno, se midio y se mira sobre fondo claro.
 *
 * El fallo que vigila es una REGRESION SILENCIOSA: volver a poner `system` como
 * valor por defecto no rompe ninguna pantalla, no lanza, y no lo nota nadie
 * hasta que un alumno con el movil en oscuro abre una figura pensada en claro.
 *
 * Comprobado por mutacion: con `: "system"` en lugar de `: "light"` caen los
 * dos casos que dependen del valor por defecto —sin cookie y cookie invalida—
 * y siguen verdes los dos de eleccion explicita. 2 de 4.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

describe("el tema por defecto es claro, no el del dispositivo", () => {
  beforeEach(() => {
    cookieStore.clear();
    vi.resetModules();
  });

  it("sin cookie devuelve 'light' — el dispositivo no decide por el alumno", async () => {
    const { getTheme } = await import("@/lib/preferences");
    await expect(getTheme()).resolves.toBe("light");
  });

  it("una cookie con basura tambien cae en claro, no en el dispositivo", async () => {
    cookieStore.set("cet_theme", "morado");
    const { getTheme } = await import("@/lib/preferences");
    await expect(getTheme()).resolves.toBe("light");
  });

  it("'system' sigue siendo elegible: quien lo elige, lo obtiene", async () => {
    cookieStore.set("cet_theme", "system");
    const { getTheme } = await import("@/lib/preferences");
    await expect(getTheme()).resolves.toBe("system");
  });

  it("'dark' explicito se respeta", async () => {
    cookieStore.set("cet_theme", "dark");
    const { getTheme } = await import("@/lib/preferences");
    await expect(getTheme()).resolves.toBe("dark");
  });
});
