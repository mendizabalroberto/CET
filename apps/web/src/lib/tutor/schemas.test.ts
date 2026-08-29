/**
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it } from "vitest";

import {
  altaDeTutorSchema,
  canjeDeEnlaceSchema,
  crearHijoSchema,
  etapaDeCurso,
  invitarTutorSchema,
  longitudDePin,
  olvidarDispositivoSchema,
  tokenSchema,
} from "./schemas";

const TOKEN = "a".repeat(43);

describe("tokenSchema", () => {
  it("el token es opaco y de 43 caracteres", () => {
    expect(tokenSchema.safeParse(TOKEN).success).toBe(true);
    expect(tokenSchema.safeParse("corto").success).toBe(false);
    expect(tokenSchema.safeParse(`${"a".repeat(42)}/`).success).toBe(false);
  });

  it("rechaza el alfabeto de base64 clasico", () => {
    // `+` y `/` son base64, no base64url. Aceptar los dos alfabetos permitiria
    // que dos cadenas distintas apunten al mismo secreto.
    expect(tokenSchema.safeParse(`${"a".repeat(42)}+`).success).toBe(false);
    expect(tokenSchema.safeParse(`${"a".repeat(43)}=`).success).toBe(false);
    expect(tokenSchema.safeParse("a".repeat(44)).success).toBe(false);
  });
});

describe("invitarTutorSchema", () => {
  it("normaliza el correo y rechaza lo que no lo es", () => {
    const ok = invitarTutorSchema.safeParse({ email: "  Roberto@Example.COM " });
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.email).toBe("roberto@example.com");
    expect(invitarTutorSchema.safeParse({ email: "no-es-un-correo" }).success).toBe(false);
  });
});

describe("altaDeTutorSchema", () => {
  it("no admite un campo de correo: el correo sale de la invitacion", () => {
    const parsed = altaDeTutorSchema.safeParse({
      token: TOKEN,
      fullName: "Roberto Mendizabal",
      password: "una-contrasena-larga",
      email: "otro@example.com",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "email" in parsed.data).toBe(false);
  });

  it("exige una contrasena de al menos diez caracteres", () => {
    const base = { token: TOKEN, fullName: "Roberto Mendizabal" };
    expect(altaDeTutorSchema.safeParse({ ...base, password: "corta123" }).success).toBe(false);
    expect(altaDeTutorSchema.safeParse({ ...base, password: "0123456789" }).success).toBe(true);
  });

  it("rechaza un nombre con caracteres de control", () => {
    const parsed = altaDeTutorSchema.safeParse({
      token: TOKEN,
      fullName: "Roberto\u0000Mendizabal",
      password: "una-contrasena-larga",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("crearHijoSchema", () => {
  const base = { fullName: "Leo Mendizabal", fechaNacimiento: "2015-04-12", yearLevel: "6" };

  it("acepta el formulario de un hijo y convierte el curso a numero", () => {
    const parsed = crearHijoSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.yearLevel).toBe(6);
  });

  it("rechaza un curso fuera de Y1-Y13 y una fecha imposible", () => {
    expect(crearHijoSchema.safeParse({ ...base, yearLevel: "14" }).success).toBe(false);
    expect(crearHijoSchema.safeParse({ ...base, yearLevel: "0" }).success).toBe(false);
    expect(crearHijoSchema.safeParse({ ...base, fechaNacimiento: "12/04/2015" }).success).toBe(
      false,
    );
    expect(crearHijoSchema.safeParse({ ...base, fechaNacimiento: "2999-01-01" }).success).toBe(
      false,
    );
  });
});

describe("canjeDeEnlaceSchema", () => {
  it("el canje exige que el PIN y su repeticion coincidan", () => {
    const base = { token: TOKEN, pin: "1234" };
    expect(canjeDeEnlaceSchema.safeParse({ ...base, pinRepetido: "1234" }).success).toBe(true);
    expect(canjeDeEnlaceSchema.safeParse({ ...base, pinRepetido: "4321" }).success).toBe(false);
    expect(
      canjeDeEnlaceSchema.safeParse({ token: base.token, pin: "123", pinRepetido: "123" }).success,
    ).toBe(false);
  });

  it("senala el campo de la repeticion, que es donde el formulario pinta el error", () => {
    const parsed = canjeDeEnlaceSchema.safeParse({
      token: TOKEN,
      pin: "1234",
      pinRepetido: "4321",
    });
    expect(parsed.success).toBe(false);
    expect(!parsed.success && parsed.error.issues[0]?.path).toEqual(["pinRepetido"]);
  });

  it("hereda de pinSchema: solo digitos, 4 a 8", () => {
    const conPin = (pin: string) =>
      canjeDeEnlaceSchema.safeParse({ token: TOKEN, pin, pinRepetido: pin }).success;
    expect(conPin("123456")).toBe(true);
    expect(conPin("12345678")).toBe(true);
    expect(conPin("123456789")).toBe(false);
    expect(conPin("12a4")).toBe(false);
  });
});

describe("olvidarDispositivoSchema", () => {
  it("solo acepta un uuid", () => {
    expect(
      olvidarDispositivoSchema.safeParse({ deviceId: "3f1c0a5e-8e6a-4a7d-9c3f-0f2b1d4e5a6b" })
        .success,
    ).toBe(true);
    expect(olvidarDispositivoSchema.safeParse({ deviceId: "1" }).success).toBe(false);
  });
});

describe("la etapa y la longitud del PIN", () => {
  it("salen del curso", () => {
    expect(etapaDeCurso(6)).toBe("primary");
    expect(etapaDeCurso(7)).toBe("secondary");
    expect(longitudDePin("primary")).toBe(4);
    expect(longitudDePin("secondary")).toBe(6);
  });

  it("cubre los dos extremos del rango", () => {
    expect(etapaDeCurso(1)).toBe("primary");
    expect(etapaDeCurso(13)).toBe("secondary");
  });
});
