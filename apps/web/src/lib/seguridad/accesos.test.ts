/**
 * Las dos propiedades del registro de accesos que no pueden romperse.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * No se prueba «que guarda lo que le pasas», que es lo que hace el compilador.
 * Se prueban las dos cosas que, si se rompen en silencio, no las nota nadie
 * hasta que ya han hecho el dano:
 *
 *   1. LA GEO VIAJA EN CABECERAS, Y EN ASCII. Si alguna vez llega al cuerpo,
 *      `entradaDeAuthPin` es `.strict()` y habria que aflojarlo en sus dos
 *      ramas — o sea, romper lo unico que impide presentar las dos puertas de
 *      login a la vez. Y si llega a una cabecera con un byte fuera de ASCII,
 *      `fetch` rechaza la peticion ENTERA con un error sin codigo: es el fallo
 *      del 28 de agosto de 2026, que dejo a todos los alumnos sin examen por
 *      una vocal acentuada.
 *
 *   2. UN RASTRO PERDIDO NO TUMBA UN CANJE. `registrarAcceso` no lanza pase lo
 *      que pase. Si algun dia lanzara, el canje se caeria con el enlace ya
 *      quemado y el nino se quedaria fuera.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cabecerasDeGeo,
  contextoDeAcceso,
  hashDeIp,
  leerGeo,
  leerIp,
  leerUserAgent,
  registrarAcceso,
  cabecerasDeContexto,
} from "./accesos";

function cabeceras(pares: Record<string, string>): Headers {
  return new Headers(pares);
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CET_IP_HASH_SALT;
});

describe("leerGeo", () => {
  it("decodifica lo que Vercel percent-codifica", () => {
    // Vercel manda la ciudad escapada porque una cabecera HTTP no admite bytes
    // fuera de ASCII. Guardar «M%C3%A1laga» en la columna seria dejarle esa
    // cadena al tutor en su panel.
    const geo = leerGeo(
      cabeceras({
        "x-vercel-ip-country": "ES",
        "x-vercel-ip-country-region": "AN",
        "x-vercel-ip-city": "M%C3%A1laga",
      }),
    );
    expect(geo).toEqual({ pais: "ES", region: "AN", ciudad: "Málaga" });
  });

  it("no se cae con un percent suelto", () => {
    // No puede venir de Vercel, pero si de quien llame a mano a esta aplicacion.
    // La geo es contexto: no merece tumbar la peticion que la acompana.
    expect(leerGeo(cabeceras({ "x-vercel-ip-city": "100%" })).ciudad).toBe("100%");
  });

  it("sin cabeceras, todo nulo y no cadena vacia", () => {
    expect(leerGeo(cabeceras({}))).toEqual({ pais: null, region: null, ciudad: null });
    expect(leerGeo(cabeceras({ "x-vercel-ip-city": "   " })).ciudad).toBeNull();
  });
});

describe("cabecerasDeGeo", () => {
  it("omite lo desconocido en vez de mandarlo vacio", () => {
    expect(cabecerasDeGeo({ pais: "ES", region: null, ciudad: null })).toEqual({
      "x-cet-geo-pais": "ES",
    });
  });

  it("todo valor sale en ASCII puro", () => {
    // La propiedad que importa: un solo byte alto aqui y `fetch` rechaza la
    // peticion entera, sin codigo de error que apunte a la causa.
    const salida = cabecerasDeGeo({ pais: "ES", region: "Andalucía", ciudad: "Málaga" });
    for (const valor of Object.values(salida)) {
      expect(valor).toMatch(/^[\x20-\x7e]*$/);
    }
    expect(decodeURIComponent(salida["x-cet-geo-ciudad"] ?? "")).toBe("Málaga");
  });
});

describe("leerIp", () => {
  it("solo el primer salto de x-forwarded-for", () => {
    // Los siguientes los anaden los proxies intermedios y no dicen nada del
    // cliente.
    expect(leerIp(cabeceras({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("cae a x-real-ip y, sin nada, a nulo", () => {
    expect(leerIp(cabeceras({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(leerIp(cabeceras({}))).toBeNull();
  });
});

describe("hashDeIp", () => {
  it("sin sal no hay hash: un sha256 de una IPv4 sin sal es la IP con disfraz", () => {
    expect(hashDeIp("203.0.113.7")).toBeNull();
    process.env.CET_IP_HASH_SALT = "corta";
    expect(hashDeIp("203.0.113.7")).toBeNull();
  });

  it("con sal, 64 hex y determinista", () => {
    process.env.CET_IP_HASH_SALT = "una-sal-larga-de-verdad";
    const a = hashDeIp("203.0.113.7");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDeIp("203.0.113.7")).toBe(a);
    expect(hashDeIp("203.0.113.8")).not.toBe(a);
  });
});

describe("leerUserAgent", () => {
  it("acota a 512: la columna es text, pero la cadena la controla el cliente", () => {
    expect(leerUserAgent(cabeceras({ "user-agent": "x".repeat(9000) }))).toHaveLength(512);
    expect(leerUserAgent(cabeceras({}))).toBeNull();
  });
});

describe("registrarAcceso", () => {
  const registro = {
    studentId: "11111111-1111-4111-8111-111111111111",
    deviceId: "22222222-2222-4222-8222-222222222222",
    tipo: "enlace_canjeado" as const,
    contexto: contextoDeAcceso(cabeceras({ "x-forwarded-for": "203.0.113.7" })),
    agenteFamilia: "Chrome en Android",
  };

  it("llama al envoltorio de public, nunca a app: PostgREST no expone ese esquema", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await registrarAcceso({ rpc } as never, registro);

    expect(rpc).toHaveBeenCalledTimes(1);
    const [nombre, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(nombre).toBe("registrar_acceso");
    expect(args["p_origen"]).toBe("web");
    expect(args["p_device_id"]).toBe(registro.deviceId);
  });

  it("un error de PostgREST no lanza: se grita con prefijo greppable", async () => {
    const grito = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValue({ error: { code: "42501", message: "denied" } });

    await expect(registrarAcceso({ rpc } as never, registro)).resolves.toBeUndefined();
    expect(grito.mock.calls[0]?.[0]).toContain("[cet] ACCESO NO REGISTRADO");
  });

  it("tampoco lanza si la base esta inalcanzable", async () => {
    // `supabase-js` devuelve los errores de PostgREST en `{ error }`, pero un
    // DNS caido o un plazo agotado SI lanzan — y ese es justo el momento en el
    // que el canje no puede caerse por culpa del rastro.
    const grito = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(registrarAcceso({ rpc } as never, registro)).resolves.toBeUndefined();
    expect(grito.mock.calls[0]?.[0]).toContain("[cet] ACCESO NO REGISTRADO (inalcanzable)");
  });

  it("no vuelca la IP en el log: ahi no hay GRANT por columna que la proteja", async () => {
    process.env.CET_IP_HASH_SALT = "una-sal-larga-de-verdad";
    const grito = vi.spyOn(console, "error").mockImplementation(() => {});
    const contexto = contextoDeAcceso(cabeceras({ "x-forwarded-for": "203.0.113.7" }));
    const rpc = vi.fn().mockResolvedValue({ error: { code: "42501", message: "denied" } });

    await registrarAcceso({ rpc } as never, { ...registro, contexto });

    const escrito = grito.mock.calls.flat().join(" ");
    expect(escrito).not.toContain("203.0.113.7");
  });
});

describe("cabecerasDeContexto · lo que baja hasta auth-pin", () => {
  it("EL FALLO DEL 01/09/2026: manda la IP y el agente, no solo la geo", () => {
    // auth-pin se llama de SERVIDOR A SERVIDOR desde Vercel, asi que lo que ve
    // en x-forwarded-for es la IP de salida de Vercel y en user-agent, 'node'.
    // Solo le bajaba la geo, y por eso el pais salia bien y la IP mal.
    const salida = cabecerasDeContexto({
      ip: "190.186.86.236",
      ipHash: "da-igual",
      geo: { pais: "BO", region: "S", ciudad: "Santa Cruz de la Sierra" },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151.0.0.0",
    });
    expect(salida["x-cet-ip"]).toBe("190.186.86.236");
    expect(decodeURIComponent(salida["x-cet-user-agent"]!)).toContain("Chrome/151");
    expect(salida["x-cet-geo-pais"]).toBe("BO");
  });

  it("percent-codifica: un byte fuera de ASCII haria que fetch rechazara la peticion entera", () => {
    const salida = cabecerasDeContexto({
      ip: null,
      ipHash: null,
      geo: { pais: "ES", region: null, ciudad: "Malaga" },
      userAgent: "Navegador Raro/1.0 (Espana)",
    });
    for (const valor of Object.values(salida)) {
      expect(/^[ -]*$/.test(valor)).toBe(true);
    }
  });

  it("lo desconocido se OMITE: una cabecera ausente dice 'no lo se' sin ambiguedad", () => {
    const salida = cabecerasDeContexto({
      ip: null,
      ipHash: null,
      geo: { pais: null, region: null, ciudad: null },
      userAgent: null,
    });
    expect(salida).toEqual({});
  });
});
