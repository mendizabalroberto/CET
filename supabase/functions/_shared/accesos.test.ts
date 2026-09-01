/**
 * Pruebas del rastro de accesos de alumno.
 * Cambridge Exam Trainer · © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Sin red ni base de datos, como el resto de este directorio: lo que se prueba
 * aquí es la frontera —qué cabeceras se leen, qué llega a `inet`— y el
 * invariante del §5 del diseño: la geo NO puede viajar por el cuerpo.
 */

import { describe, it, expect } from "vitest";
import { entradaDeAuthPin } from "./puertas.ts";
import {
  contextoDeAcceso,
  familiaDeAgente,
  geoDeCabeceras,
  ipParaInet,
  parametrosDeAcceso,
} from "./accesos.ts";

const UUID = "00000000-0000-4000-8000-000000000001";
const TOKEN = "a".repeat(43);

describe("la geo viaja por cabecera y NUNCA por el cuerpo", () => {
  // Este bloque es el que sostiene la decisión del §5: si estas pruebas se
  // pusieran en verde aflojando `.strict()`, se habría cambiado un invariante de
  // seguridad —que nadie mande las dos puertas a la vez— por la comodidad de
  // transportar un dato decorativo.
  it("rechaza la geo metida en el cuerpo de la puerta del colegio", () => {
    const r = entradaDeAuthPin.safeParse({
      schoolId: UUID,
      studentCode: "Y6A-001",
      pin: "1357",
      pais: "ES",
      region: "MD",
      ciudad: "Madrid",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza la geo metida en el cuerpo de la puerta del dispositivo", () => {
    const r = entradaDeAuthPin.safeParse({
      deviceToken: TOKEN,
      pin: "1357",
      pais: "ES",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un solo campo de geo suelto: no hay resquicio por el que colarla", () => {
    expect(
      entradaDeAuthPin.safeParse({ deviceToken: TOKEN, pin: "1357", ciudad: "Madrid" }).success,
    ).toBe(false);
    expect(
      entradaDeAuthPin.safeParse({
        schoolId: UUID,
        studentCode: "Y6A-001",
        pin: "1357",
        region: "MD",
      }).success,
    ).toBe(false);
  });

  it("el cuerpo legítimo, sin geo, sigue pasando por las dos puertas", () => {
    expect(
      entradaDeAuthPin.safeParse({ schoolId: UUID, studentCode: "Y6A-001", pin: "1357" }).success,
    ).toBe(true);
    expect(entradaDeAuthPin.safeParse({ deviceToken: TOKEN, pin: "1357" }).success).toBe(true);
  });
});

describe("geoDeCabeceras", () => {
  it("lee las tres cabeceras que pone la capa web", () => {
    const h = new Headers({
      "x-cet-geo-pais": "ES",
      "x-cet-geo-region": "MD",
      "x-cet-geo-ciudad": "Madrid",
    });
    expect(geoDeCabeceras(h)).toEqual({ pais: "ES", region: "MD", ciudad: "Madrid" });
  });

  it("los tres campos son independientes: país sin ciudad es un caso normal", () => {
    const h = new Headers({ "x-cet-geo-pais": "ES" });
    expect(geoDeCabeceras(h)).toEqual({ pais: "ES", region: null, ciudad: null });
  });

  it("EL CONTRATO CON LA CAPA WEB: la geo llega percent-codificada y se descodifica", () => {
    // La web emite `encodeURIComponent` porque `fetch` rechaza la petición
    // entera —sin código de error útil— si una cabecera lleva bytes fuera de
    // ASCII. Sin descodificar aquí, la columna `ciudad` guardaría literalmente
    // "M%C3%A1laga", y el fallo sería MUDO: las ciudades sin acentos, que son
    // las que se prueban, entrarían perfectas.
    const h = new Headers({
      "x-cet-geo-pais": "ES",
      "x-cet-geo-region": "AN",
      "x-cet-geo-ciudad": encodeURIComponent("Málaga"),
    });
    expect(geoDeCabeceras(h)).toEqual({ pais: "ES", region: "AN", ciudad: "Málaga" });
  });

  it("una secuencia mal formada no lanza: se guarda cruda y el acceso se registra", () => {
    // `decodeURIComponent("%ZZ")` lanza, y esta cabecera la escribe quien llama.
    // Una ciudad rara en el rastro es cosmético; una excepción aquí perdería el
    // registro del acceso entero, que es justo lo que se quería guardar.
    const h = new Headers({ "x-cet-geo-ciudad": "%ZZ-Madrid" });
    expect(geoDeCabeceras(h).ciudad).toBe("%ZZ-Madrid");
  });

  it("una cabecera vacía es NULL y no cadena vacía", () => {
    // Dos representaciones del mismo hecho obligan a acordarse de las dos en
    // cada consulta forense, y alguien se olvidará.
    const h = new Headers({ "x-cet-geo-ciudad": "   " });
    expect(geoDeCabeceras(h).ciudad).toBeNull();
  });

  it("acota el texto: la cabecera es falsificable y no es una vía de escritura", () => {
    const h = new Headers({ "x-cet-geo-ciudad": "M".repeat(5000) });
    expect(geoDeCabeceras(h).ciudad).toHaveLength(120);
  });
});

describe("ipParaInet", () => {
  it("toma el primer valor de x-forwarded-for", () => {
    expect(ipParaInet("203.0.113.7, 70.41.3.18, 150.172.238.178")).toBe("203.0.113.7");
  });

  it("acepta IPv6", () => {
    expect(ipParaInet("2001:db8::1")).toBe("2001:db8::1");
  });

  it("descarta lo que `inet` rechazaría, en vez de dejar que reviente la llamada", () => {
    // Sin esto, un `curl` con una cabecera basura haría fallar
    // `registrar_acceso` entera y borraría justo el rastro que más interesa.
    expect(ipParaInet("hola")).toBeNull();
    expect(ipParaInet("999.1.2.3")).toBeNull();
    expect(ipParaInet("1.2.3")).toBeNull();
    expect(ipParaInet("<script>")).toBeNull();
    expect(ipParaInet(null)).toBeNull();
    expect(ipParaInet("")).toBeNull();
  });
});

describe("familiaDeAgente", () => {
  it("degrada a una etiqueta que un tutor reconoce", () => {
    expect(
      familiaDeAgente(
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe("Chrome en Android");
  });

  it("lo desconocido nunca degrada a la cadena original", () => {
    expect(familiaDeAgente("curl/8.4.0")).toBe("Navegador");
    expect(familiaDeAgente(null)).toBe("Navegador");
    expect(familiaDeAgente("")).toBe("Navegador");
  });
});

describe("parametrosDeAcceso", () => {
  const h = new Headers({
    "x-forwarded-for": "203.0.113.7",
    "x-cet-geo-pais": "ES",
    "x-cet-geo-ciudad": "Madrid",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
  });

  it("compone la llamada con los nombres exactos de la RPC", () => {
    const p = parametrosDeAcceso(contextoDeAcceso(h, "elhash"), {
      studentId: UUID,
      deviceId: null,
      tipo: "login_fallido",
    });
    expect(p).toEqual({
      p_student_id: UUID,
      p_device_id: null,
      p_tipo: "login_fallido",
      p_ip: "203.0.113.7",
      p_ip_hash: "elhash",
      p_pais: "ES",
      p_region: null,
      p_ciudad: "Madrid",
      p_agente_familia: "Chrome en Windows",
      p_user_agent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
      p_origen: "edge",
    });
  });

  it("el origen es siempre 'edge': esta capa no puede conocer la geo por sí misma", () => {
    const p = parametrosDeAcceso(contextoDeAcceso(new Headers(), null), {
      studentId: UUID,
      deviceId: UUID,
      tipo: "login_ok",
    });
    expect(p.p_origen).toBe("edge");
    // Sin cabeceras no se inventa nada: NULL es «no se sabe», y `origen` es lo
    // que distingue eso de «esta capa no podía saberlo».
    expect(p.p_pais).toBeNull();
    expect(p.p_ip).toBeNull();
    expect(p.p_device_id).toBe(UUID);
  });

  it("guarda el user-agent entero, que es lo que la columna con GRANT restringido protege", () => {
    const largo = `Mozilla/5.0 ${"x".repeat(400)} Firefox/120.0`;
    const p = parametrosDeAcceso(contextoDeAcceso(new Headers({ "user-agent": largo }), null), {
      studentId: UUID,
      deviceId: null,
      tipo: "login_ok",
    });
    expect(p.p_user_agent).toBe(largo);
  });
});

describe("contextoDeAcceso · la IP y el agente REALES del cliente", () => {
  it("EL FALLO DEL 01/09/2026: prefiere x-cet-ip a la IP de salida de Vercel", () => {
    // Nadie llega a auth-pin desde un navegador: la web llama de servidor a
    // servidor, asi que x-forwarded-for es SIEMPRE el proxy. En el primer login
    // real de un alumno el canje registro 190.186.86.236 y este login, un
    // segundo despues, 98.93.183.199.
    const h = new Headers({
      "x-forwarded-for": "98.93.183.199",
      "x-cet-ip": "190.186.86.236",
      "user-agent": "node",
      "x-cet-user-agent": encodeURIComponent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151.0.0.0",
      ),
    });
    const ctx = contextoDeAcceso(h, null);
    expect(ctx.ip).toBe("190.186.86.236");
    expect(ctx.userAgent).toContain("Chrome/151");
    // Y con el agente bueno, la etiqueta que ve el tutor deja de ser generica.
    expect(ctx.agenteFamilia).toBe("Chrome en Windows");
  });

  it("sin la web por delante, x-forwarded-for sigue siendo el del llamante", () => {
    const h = new Headers({ "x-forwarded-for": "88.12.34.56", "user-agent": "curl/8" });
    expect(contextoDeAcceso(h, null).ip).toBe("88.12.34.56");
  });

  it("una x-cet-ip vacia no borra lo que si se sabe", () => {
    const h = new Headers({ "x-forwarded-for": "88.12.34.56", "x-cet-ip": "" });
    expect(contextoDeAcceso(h, null).ip).toBe("88.12.34.56");
  });

  it("una x-cet-ip que no es una IP no revienta el registro: degrada a NULL", () => {
    // `inet` rechazaria la cadena con un 22P02 y se perderia la fila entera,
    // que es justo el rastro que se queria guardar.
    const h = new Headers({ "x-cet-ip": "hola", "x-forwarded-for": "98.93.183.199" });
    expect(contextoDeAcceso(h, null).ip).toBeNull();
  });
});
