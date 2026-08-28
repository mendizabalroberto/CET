/**
 * INVARIANTE: ninguna preferencia se escribe en un sitio que su lector no consulta.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ FAMILIA DE FALLOS CIERRA ESTE FICHERO
 * ===========================================================================
 * Una preferencia tiene dos mitades escritas en momentos distintos: la acción
 * que la GUARDA y el resolutor que la LEE. Cada mitad enumera sus sitios —una
 * cookie, una columna, una cabecera— y nada obliga a que las dos listas
 * coincidan. Cuando dejan de coincidir no hay excepción, no hay 500, no hay
 * nada en los logs: el botón se pulsa, el formulario envía, la acción escribe,
 * y la página se repinta idéntica.
 *
 * Pasó con el idioma. `resolveLocale()` resuelve en este orden:
 *
 *     1. profiles.locale del usuario autenticado   <- gana y RETORNA
 *     2. cookie cet_locale
 *     3. Accept-Language
 *     4. DEFAULT_LOCALE
 *
 * ...y `setLocalePreference` escribía SOLO la cookie. Como `profiles.locale` es
 * `not null default 'en'` (0003_tenancy.sql), todo usuario con sesión salía por
 * el paso 1 y la cookie no se leía jamás. Para un visitante anónimo el selector
 * funcionaba perfectamente, que es la razón de que nadie lo viera: el fallo
 * exige sesión, y las pruebas manuales se hacen sin ella.
 *
 * ===========================================================================
 * POR QUÉ ESTE TEST NO MIRA EL CÓDIGO, LO EJECUTA
 * ===========================================================================
 * Un guardián que buscase `from("profiles")` dentro de la acción comprobaría
 * que alguien escribió una línea, no que la línea sirva de algo. Aquí se hace
 * el viaje de ida y vuelta completo: se escribe con la MISMA Server Action que
 * usa el formulario y se lee POR LA MISMA VÍA QUE LA APLICACIÓN —para el
 * idioma, sesión primero y `resolveLocale(perfil.locale)` después, tal como
 * hacen `app/(account)/account/page.tsx` y sus hermanas—. Si la lectura de este
 * test se saltara la sesión, pasaría en verde con el fallo puesto. Es
 * literalmente el error que se está cazando, así que la vía de lectura es parte
 * de la aserción y no un detalle del montaje.
 *
 * Y se recorre la FAMILIA, no el caso: cada preferencia declarada, cada uno de
 * sus valores, con sesión y sin ella. El tema entra por el mismo aro aunque hoy
 * no tenga el fallo —no existe columna `theme` en `supabase/migrations/`, su
 * único sitio es la cookie `cet_theme`—; el día que alguien le añada un
 * `profiles.theme` y no toque la acción, este fichero se pone rojo solo.
 *
 * VERIFICADO POR MUTACIÓN: revertido `persistLocaleOnProfile` en
 * `lib/preferences-actions.ts` (la acción vuelve a escribir solo la cookie),
 * este fichero sale ROJO por código de salida (exit 1): fallan los DOS casos
 * del idioma con sesión —«es» y «en»— y ninguno de los otros nueve. Restaurada
 * la corrección, verde.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LOCALES } from "@cet/shared";

/* -------------------------------------------------------------------------- */
/* El mundo: cookies, sesión y la fila de profiles                            */
/* -------------------------------------------------------------------------- */

/** `id` y `locale` son columnas reales de `public.profiles` (0003_tenancy.sql). */
const PERFIL_ID = "11111111-1111-4111-8111-111111111111";

interface Mundo {
  cookies: Map<string, string>;
  /** `null` = visitante sin cuenta. */
  perfil: Record<string, unknown> | null;
}

const mundo: Mundo = { cookies: new Map(), perfil: null };

function conSesion(siembra: Record<string, unknown> = {}): void {
  mundo.perfil = {
    id: PERFIL_ID,
    school_id: "22222222-2222-4222-8222-222222222222",
    role: "student",
    full_name: "Alumna de prueba",
    locale: "en",
    status: "active",
    ...siembra,
  };
}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = mundo.cookies.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => {
        mundo.cookies.set(name, value);
      },
    }),
  // Sin `Accept-Language`: la negociación del navegador es el escalón 3 y no
  // debe tapar lo que el usuario acaba de elegir.
  headers: () => Promise.resolve(new Headers()),
}));

/**
 * Doble de Supabase con estado. Que la fila cambie de verdad tras el UPDATE es
 * lo que permite volver a leerla; un doble que solo cuenta llamadas diría que
 * "se escribió" sin poder decir qué se lee después.
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        getUser: () =>
          Promise.resolve(
            mundo.perfil === null
              ? { data: { user: null }, error: { message: "sin sesión" } }
              : { data: { user: { id: PERFIL_ID, app_metadata: {} } }, error: null },
          ),
      },
      from: (tabla: string) => {
        if (tabla !== "profiles") throw new Error(`tabla inesperada en el doble: ${tabla}`);
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: mundo.perfil !== null && id === PERFIL_ID ? mundo.perfil : null,
                  error: null,
                }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              // La RLS real solo deja tocar la propia fila; el doble hace lo
              // mismo para que un id equivocado no pase inadvertido.
              if (mundo.perfil !== null && id === PERFIL_ID) Object.assign(mundo.perfil, patch);
              return Promise.resolve({ error: null });
            },
          }),
        };
      },
    }),
}));

/* -------------------------------------------------------------------------- */
/* El catálogo de preferencias                                                */
/* -------------------------------------------------------------------------- */

interface Preferencia {
  /** Nombre de la Server Action exportada. Ata el catálogo al código real. */
  readonly accion: string;
  /** `name` del boton de envio en PreferenceSwitchers.tsx. */
  readonly campo: string;
  readonly valores: readonly string[];
  /**
   * Fila de `profiles` de partida para el caso con sesión, en función del valor
   * que se va a elegir. Existe para que el perfil NUNCA arranque ya en el valor
   * objetivo: si arrancara ahí, el viaje de ida y vuelta se cumpliría sin que la
   * acción escribiese nada y el caso no probaría nada.
   */
  readonly sembrarPerfil?: (valor: string) => Record<string, unknown>;
  /** Guarda la preferencia por la misma vía que el formulario. */
  readonly escribir: (valor: string) => Promise<void>;
  /** La lee POR LA MISMA VÍA QUE LA APLICACIÓN. Ver la cabecera del fichero. */
  readonly leer: () => Promise<string>;
}

function formulario(campo: string, valor: string): FormData {
  const fd = new FormData();
  fd.set(campo, valor);
  return fd;
}

const PREFERENCIAS: readonly Preferencia[] = [
  {
    accion: "setLocalePreference",
    campo: "locale",
    valores: LOCALES,
    // El perfil empieza SIEMPRE en el otro idioma: los dos únicos valores que
    // acepta `profiles_locale_supported` son 'es' y 'en'.
    sembrarPerfil: (valor) => ({ locale: LOCALES.find((l) => l !== valor) }),
    escribir: async (valor) => {
      const { setLocalePreference } = await import("@/lib/preferences-actions");
      await setLocalePreference(formulario("locale", valor));
    },
    leer: async () => {
      // Así lo lee la aplicación: primero el perfil de sesión, y su `locale`
      // entra como argumento de `resolveLocale`, donde tiene la precedencia
      // máxima. Saltarse este paso es lo que haría verde un test inútil.
      const { getSessionProfile } = await import("@/lib/auth/session");
      const { resolveLocale } = await import("@/lib/i18n/server");
      const perfil = await getSessionProfile();
      return resolveLocale(perfil?.locale);
    },
  },
  {
    accion: "setThemePreference",
    campo: "theme",
    valores: ["light", "dark", "system"],
    escribir: async (valor) => {
      const { setThemePreference } = await import("@/lib/preferences-actions");
      await setThemePreference(formulario("theme", valor));
    },
    leer: async () => {
      const { getTheme } = await import("@/lib/preferences");
      return getTheme();
    },
  },
];

/* -------------------------------------------------------------------------- */

describe("invariante: ninguna preferencia se escribe donde su lector no mira", () => {
  beforeEach(() => {
    mundo.cookies = new Map();
    mundo.perfil = null;
  });

  it("el catálogo cubre todas las preferencias que existen", () => {
    // Un invariante que recorre una lista vacía —o una lista que se quedó atrás
    // cuando alguien añadió la tercera preferencia— pasa siempre y no protege
    // nada. Las acciones se leen del fichero real, no de este catálogo.
    const fuente = readFileSync(
      fileURLToPath(new URL("./preferences-actions.ts", import.meta.url)),
      "utf8",
    );
    const exportadas = [...fuente.matchAll(/export\s+async\s+function\s+(set\w*Preference)\b/g)]
      .map((m) => m[1] as string)
      .sort();

    expect(exportadas.length).toBeGreaterThanOrEqual(2);
    expect(PREFERENCIAS.map((p) => p.accion).sort()).toEqual(exportadas);

    for (const preferencia of PREFERENCIAS) {
      // Con un solo valor posible no hay nada que cambiar y el viaje de ida y
      // vuelta se cumpliría sin escribir una línea.
      expect(preferencia.valores.length).toBeGreaterThanOrEqual(2);
    }
  });

  for (const preferencia of PREFERENCIAS) {
    for (const sesion of ["anónimo", "con sesión"] as const) {
      for (const valor of preferencia.valores) {
        it(`${preferencia.accion}: elegir "${valor}" (${sesion}) es lo que luego se lee`, async () => {
          if (sesion === "con sesión") conSesion(preferencia.sembrarPerfil?.(valor));

          await preferencia.escribir(valor);

          expect(await preferencia.leer()).toBe(valor);
        });
      }
    }
  }
});
